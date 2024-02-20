import path from 'path'
import fs from 'fs/promises'
import { execa } from 'execa'
import ora from 'ora'
import pDefer from 'p-defer'
import { gracefulExit } from 'exit-hook'
import { validator } from 'hono/validator'
import { Homestar } from '@fission-codes/homestar'
import { invocation, workflow } from '@fission-codes/homestar/workflow'
import { WebsocketTransport } from '@fission-codes/channel/transports/ws.js'
import { build } from '@fission-codes/homestar/wasmify'
import { create } from 'kubo-rpc-client'
import { createGenerator } from 'ts-json-schema-generator'

import { listen } from 'listhen'
import Ajv from 'ajv'
import { getRequestListener } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { startControlPanel } from './lib/control-panel.js'

export const GATEWAY_PORT = 3000
export const HOMESTAR_PORT = 8020

/**
 * Add file to IPFS
 *
 * @param {string} path - path to file ie. '/small.png'
 * @param {number} port
 */
export async function addFSFileToIPFS(path, port) {
  const ipfs = create({
    port,
  })

  const file = await ipfs.add(
    {
      content: await fs.readFile(path),
    },
    {
      cidVersion: 1,
    }
  )

  return file.cid
}

/**
 *  @param {import('./types.js').ConfigDev} opts
 */
async function wasmFn(opts) {
  await execa(
    'jco',
    [
      'transpile',
      opts.wasm,
      '-o',
      opts.config,
      '--map',
      'wasi-*=@bytecodealliance/preview2-shim/*',
    ],
    {
      preferLocal: true,
    }
  )

  const basename = path.basename(opts.wasm).replace('.wasm', '.d.ts')

  /** @type {import('ts-json-schema-generator').Config} */
  const config = {
    path: path.join(opts.config, basename),
  }
  const schema = createGenerator(config).createSchema(config.type)

  if (!schema.definitions) {
    throw new Error('No definitions found')
  }

  const entries = /** @type { import('./types.js').Entries} */ (
    Object.entries(schema.definitions).map(([k, v]) => [
      k.replaceAll('NamedParameters<typeof ', '').replaceAll('>', ''),
      v,
    ])
  )

  return {
    entries,
    path: opts.wasm,
  }
}

/**
 *  @param {import('./types.js').ConfigDev} opts
 */
async function tsFn(opts) {
  const fnPath = path.resolve(opts.fn)
  const wasmPath = await build(fnPath, opts.config)
  /** @type {import('ts-json-schema-generator').Config} */
  const config = {
    path: path.resolve(opts.fn),
    // tsconfig: path.join(__dirname, '/tsconfig.json'),
    // type: '*', // Or <type-name> if you want to generate schema for that one type only
  }
  const schema = createGenerator(config).createSchema(config.type)
  if (!schema.definitions) {
    throw new Error('No definitions found')
  }

  const entries = /** @type { import('./types.js').Entries} */ (
    Object.entries(schema.definitions).map(([k, v]) => [
      k.replaceAll('NamedParameters<typeof ', '').replaceAll('>', ''),
      v,
    ])
  )

  return {
    entries,
    path: wasmPath.outPath,
  }
}

/**
 *
 * @param {import('./types.js').ConfigDev} opts
 */
export async function dev(opts) {
  const spinner = ora('Processing function.').start()
  /** @type {import('./types.js').FnOut} */
  const fn = opts.fn ? await tsFn(opts) : await wasmFn(opts)

  spinner.succeed('Function parsed and compiled.')

  spinner.start('Starting Homestar')
  const config1 = path.join(opts.config, 'workflow.toml')
  const db1 = path.join(opts.config, 'homestar.db')
  await fs.writeFile(
    config1,
    `
[node]
[node.network.metrics]
port = 4020

[node.network.rpc]
port = 9820

[node.network.webserver]
port = ${HOMESTAR_PORT}

[node.network.ipfs]
port = ${opts.ipfsPort}
    `
  )

  execa('homestar', ['start', '-c', config1, '--db', db1], {
    preferLocal: true,
    env: {
      RUST_LOG: 'none',
    },
  })

  const hs = new Homestar({
    transport: new WebsocketTransport('ws://localhost:8020'),
  })

  const health = await hs.health()
  if (health.error) {
    console.error('❌ Homestar is not healthy')
    return gracefulExit(1)
  }
  spinner.succeed(`Homestar is running at localhost:8020`)

  const cid = await addFSFileToIPFS(fn.path, opts.ipfsPort)

  spinner.start('Starting Control Panel')
  const controlPanelPort = await startControlPanel(cid.toString())
  spinner.succeed(
    `Control Panel is running at http://localhost:${controlPanelPort}`
  )

  /** @type {Hono<{Variables: {name: string, schema: import('ajv').SchemaObject}}>} */
  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: '*',
      allowHeaders: ['Accept', 'Content-Type'],
      allowMethods: ['GET'],
    })
  )

  app.get('/', async (c) => {
    return c.json(fn.entries, 200)
  })

  app.use('/:id/*', async (c, next) => {
    const data = fn.entries.find((e) => e[0] === c.req.param('id'))

    if (!data) {
      return c.json({ error: 'Not found' }, 404)
    }

    const [name, schema] = data
    if (typeof schema === 'string' || typeof name !== 'string') {
      return c.json({ error: 'Schema error' }, 404)
    }

    schema.properties = {
      ...schema.properties,
      'content-type': {
        type: 'string',
        default: 'text/plain',
      },
    }
    c.set('name', name)
    c.set('schema', /** @type {import('ajv').SchemaObject} */ (schema))

    await next()
  })

  app.get('/:id/schema', async (c) => {
    return c.json(c.get('schema'), 200)
  })

  app.get('/:id/workflow', async (c) => {
    // order args by schema
    const keys = Object.keys(c.get('schema').properties).slice(0, -1)
    const args = []
    for (const key of keys) {
      args.push(c.req.query(key))
    }

    const workflow1 = await buildWorkflow(args, cid, c.get('name'))
    return c.json(workflow1, 200, {
      'Content-Type': 'application/json',
    })
  })

  app.get(
    '/:id',
    validator('query', (value, c) => {
      const ajv = new Ajv()
      const validate = ajv.compile(c.get('schema'))
      const valid = validate(value)

      if (!valid) {
        return c.json(validate.errors, 400)
      }
      return value
    }),

    async (c) => {
      const contentType = c.req.query('content-type')
      // order args by schema
      const keys = Object.keys(c.get('schema').properties)
      const args = []
      for (const key of keys) {
        if (key === 'content-type') continue
        args.push(c.req.query(key))
      }

      const workflow1 = await buildWorkflow(args, cid, c.get('name'))
      return c.text(await run(workflow1, hs), 200, {
        'Content-Type': contentType || 'plain/text',
      })
    }
  )

  app.post(
    '/:id',
    validator('json', (value, c) => {
      const ajv = new Ajv()
      const validate = ajv.compile(c.get('schema'))
      const valid = validate(value)

      if (!valid) {
        return c.json(validate.errors, 400)
      }
      return value
    }),

    async (c) => {
      const contentType = c.req.query('content-type')
      const workflow1 = await buildWorkflow(
        Object.values(c.req.json()),
        cid,
        c.get('name')
      )
      return c.text(await run(workflow1, hs), 200, {
        'Content-Type': contentType || 'plain/text',
      })
    }
  )

  app.get('*', (c) => c.text('not found')) // fallback

  await listen(getRequestListener(app.fetch), {
    public: true,
    port: GATEWAY_PORT,
    // tunnel: true,
  })
}

/**
 *
 * @param {any[]} args
 * @param {{ toString: () => any; }} cid
 * @param {string} name
 */
async function buildWorkflow(args, cid, name) {
  return workflow({
    // @ts-ignore
    name,
    workflow: {
      tasks: [
        invocation({
          name,
          func: name,
          args,
          resource: `ipfs://${cid.toString()}`,
        }),
      ],
    },
  })
}

/**
 *
 * @param {import('@fission-codes/homestar/types').Workflow} workflow1
 * @param {Homestar} hs
 */
async function run(workflow1, hs) {
  /** @type {import('p-defer').DeferredPromise<string>} */
  const prom = pDefer()

  const { error } = await hs.runWorkflow(workflow1, (data) => {
    prom.resolve(data.receipt.out[1])
  })

  if (error) {
    console.error(error)

    return error.message
  }

  return await prom.promise
}
