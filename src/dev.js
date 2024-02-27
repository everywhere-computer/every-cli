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
import { fileTypeFromBuffer } from 'file-type'

import { setupControlPanel } from './lib/cp.js'
import { schema } from './lib/schema.js'

export const GATEWAY_PORT = 3000
export const HOMESTAR_PORT = 8020

/**
 * Create invocations from tasks
 *
 * @param {import('./types.js').FnsMap} fns
 * @param {import('@fission-codes/homestar/types').TemplateInvocation[]} tasks
 */
function createInvocations(fns, tasks) {
  return tasks.map((task) => {
    return {
      ...task,
      meta: {
        memory: 4_294_967_296,
        time: 100_000,
      },
      prf: [],
      run: {
        ...task.run,
        op: 'wasm/run',
        rsc: `ipfs://${fns.get(task.run.input.func)?.cid}`,
        nnc: '',
      },
    }
  })
}

/**
 * Add file to IPFS
 *
 * @param {string} path - path to file ie. '/small.png'
 * @param {number} port
 */
export async function addFSFileToIPFS(path, port) {
  const ipfs = create({
    port,
    url: `http://127.0.0.1:${port}/api/v0`,
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
 * @param { string } src
 * @param { string } out
 */
async function wasmFn(src, out) {
  await execa(
    'jco',
    [
      'transpile',
      src,
      '-o',
      out,
      '--map',
      'wasi-*=@bytecodealliance/preview2-shim/*',
    ],
    {
      preferLocal: true,
    }
  )

  const basename = path.basename(src).replace('.wasm', '.d.ts')

  /** @type {import('ts-json-schema-generator').Config} */
  const config = {
    path: path.join(out, basename),
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
    path: src,
  }
}

/**
 * @param { string } src
 * @param { string } out
 */
async function tsFn(src, out) {
  const fnPath = path.resolve(src)
  const wasmPath = await build(fnPath, out)
  /** @type {import('ts-json-schema-generator').Config} */
  const config = {
    path: fnPath,
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
export async function parseFns(opts) {
  /** @type {string[]} */
  let fnsPath = []

  /** @type {import('./types.js').Entries} */
  const allEntries = []

  /** @type {import('./types.js').FnsMap} */
  const fns = new Map()

  if (typeof opts.fn === 'string') {
    fnsPath.push(opts.fn)
  }

  if (Array.isArray(opts.fn)) {
    fnsPath = opts.fn
  }

  for (const fnPath of fnsPath) {
    if (['.ts'].includes(path.extname(fnPath))) {
      const { entries, path } = await tsFn(fnPath, opts.config)
      allEntries.push(...entries)
      const cid = await addFSFileToIPFS(path, opts.ipfsPort)
      for (const e of entries) {
        fns.set(e[0], {
          name: e[0],
          cid: cid.toString(),
          schema: e[1],
          path,
          args: e[1].properties ? Object.keys(e[1].properties) : [],
        })
      }
    }

    if (['.wasm'].includes(path.extname(fnPath))) {
      const { entries, path } = await wasmFn(fnPath, opts.config)
      allEntries.push(...entries)
      const cid = await addFSFileToIPFS(path, opts.ipfsPort)
      for (const e of entries) {
        fns.set(e[0], {
          name: e[0],
          cid: cid.toString(),
          schema: e[1],
          path,
          args: e[1].properties ? Object.keys(e[1].properties) : [],
        })
      }
    }
  }

  return { schema: allEntries, map: fns }
}

/**
 *
 * @param {import('./types.js').ConfigDev} opts
 */
async function startHomestar(opts) {
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
host = "127.0.0.1"
port = ${HOMESTAR_PORT}

[node.network.ipfs]
host = "127.0.0.1"
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
    transport: new WebsocketTransport(`ws://127.0.0.1:${HOMESTAR_PORT}`),
  })

  return hs
}

/**
 * @param {any} value
 * @param {any} c
 */
function validate(value, c) {
  const ajv = new Ajv()
  const validate = ajv.compile(c.get('schema'))
  const valid = validate(value)

  if (!valid) {
    return c.json(validate.errors, 400)
  }
  return value
}

/**
 * @param {any} out
 * @param {import('hono').Context} c
 */
async function inferResponse(out, c) {
  const type = toString.call(out).slice(8, -1)

  switch (type) {
    case 'String': {
      if (out.startsWith('<svg xmlns:svg="http://www.w3.org/2000/svg"')) {
        return c.body(out, 200, {
          'Content-Type': 'image/svg+xml',
        })
      }
      return c.body(out, 200, {
        'Content-Type': 'plain/text',
      })
    }

    case 'Number': {
      return c.body(out, 200, {
        'Content-Type': 'plain/text',
      })
    }

    case 'Array': {
      return c.body(JSON.stringify(out), 200, {
        'Content-Type': 'application/json',
      })
    }

    case 'Uint8Array': {
      const mimeType = await fileTypeFromBuffer(out)
      return c.body(out, 200, {
        'Content-Length': `${out.byteLength}`,
        'Content-Type': mimeType?.mime || 'application/octet-stream',
      })
    }

    default: {
      return c.body(out, 200, {
        'Content-Type': 'application/octet-stream',
      })
    }
  }
}

/**
 *
 * @param {import('./types.js').ConfigDev} opts
 */
export async function dev(opts) {
  const spinner = ora('Processing functions').start()
  const fns = await parseFns(opts)

  spinner.succeed('Functions parsed and compiled')

  spinner.start('Starting Homestar')
  const hs = await startHomestar(opts)
  const health = await hs.health()

  if (health.error) {
    console.error('❌ Homestar did not start correctly')
    return gracefulExit(1)
  }
  spinner.succeed(`Homestar is running at 127.0.0.1:8020`)

  spinner.start('Starting Control Panel')
  const controlPanelPort = await setupControlPanel(opts, {
    gateway: GATEWAY_PORT,
    homestar: HOMESTAR_PORT,
  })
  spinner.succeed(
    `Control Panel is running at http://127.0.0.1:${controlPanelPort}`
  )

  /** @type {Hono<{Variables: {name: string, schema: import('ajv').SchemaObject, data: import('./types.js').FnData}}>} */
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
    return c.json(fns.schema, 200)
  })

  app.post(
    '/run',
    validator('json', (value, c) => {
      const ajv = new Ajv()
      const validate = ajv.compile(schema(fns.map))
      const valid = validate(value)

      if (!valid) {
        return c.json(validate.errors, 400)
      }
      return value
    }),
    async (c) => {
      const tasks =
        /** @type{import('@fission-codes/homestar/types').TemplateInvocation[]} */ (
          c.req.valid('json').tasks
        )
      const invs = createInvocations(fns.map, tasks)

      try {
        const wf = await workflow({
          name: 'test',
          workflow: {
            tasks: invs,
          },
        })

        /** @type {import('p-defer').DeferredPromise<Uint8Array>} */
        const prom = pDefer()
        let count = 0
        const { error } = await hs.runWorkflow(wf, (data) => {
          count++
          if (count === invs.length) {
            prom.resolve(data.receipt.out[1])
          }
        })

        if (error) {
          return c.json({ error: error.message }, 500)
        }

        const out = await prom.promise
        return inferResponse(out, c)
      } catch (error) {
        // @ts-ignore
        return c.json({ error: error.message }, 500)
      }
    }
  )

  app.post(
    '/workflow',
    validator('json', (value, c) => {
      return value
    }),
    async (c) => {
      const tasks =
        /** @type{import('@fission-codes/homestar/types').TemplateInvocation[]} */ (
          c.req.valid('json').tasks
        )
      const invs = createInvocations(fns.map, tasks)

      try {
        const wf = await workflow({
          name: 'test',
          workflow: {
            tasks: invs,
          },
        })

        return c.json(wf, 200, {
          'Content-Type': 'application/json',
        })
      } catch (error) {
        // @ts-ignore
        return c.json({ error: error.message }, 500)
      }
    }
  )

  app.use('/:name/*', async (c, next) => {
    const data = fns.map.get(c.req.param('name'))

    if (!data) {
      return c.json({ error: 'Not found' }, 404)
    }

    const _schema = data.schema
    _schema.properties = {
      ..._schema.properties,
      'content-type': {
        type: 'string',
        default: 'text/plain',
      },
    }
    c.set('name', data.name)
    c.set('schema', /** @type {import('ajv').SchemaObject} */ (_schema))
    c.set('data', data)

    await next()
  })

  app.get('/:name/schema', async (c) => {
    return c.json(c.get('data').schema, 200)
  })

  app.get('/:name/workflow', validator('query', validate), async (c) => {
    // order args by schema
    const args = []
    for (const arg of c.get('data').args) {
      args.push(c.req.query(arg))
    }

    const workflow1 = await buildWorkflow(
      args,
      c.get('data').cid,
      c.get('name')
    )
    return c.json(workflow1, 200, {
      'Content-Type': 'application/json',
    })
  })

  app.post('/:name/workflow', validator('json', validate), async (c) => {
    // order args by schema
    const payload = await c.req.json()
    const args = []
    for (const arg of c.get('data').args) {
      args.push(payload[arg])
    }

    const workflow1 = await buildWorkflow(
      args,
      c.get('data').cid,
      c.get('name')
    )
    return c.json(workflow1, 200, {
      'Content-Type': 'application/json',
    })
  })

  app.get('/:name', validator('query', validate), async (c) => {
    // order args by schema
    const args = []
    for (const arg of c.get('data').args) {
      args.push(c.req.query(arg))
    }

    const workflow1 = await buildWorkflow(
      args,
      c.get('data').cid,
      c.get('name')
    )

    try {
      const out = await run(workflow1, hs)

      return inferResponse(out, c)
    } catch (error) {
      // @ts-ignore
      return c.json({ error: error.message }, 500)
    }
  })

  app.post('/:name', validator('json', validate), async (c) => {
    // order args by schema
    const payload = await c.req.json()
    const args = []
    for (const arg of c.get('data').args) {
      args.push(payload[arg])
    }
    const workflow1 = await buildWorkflow(
      args,
      c.get('data').cid,
      c.get('name')
    )
    try {
      const out = await run(workflow1, hs)

      return inferResponse(out, c)
    } catch (error) {
      // @ts-ignore
      return c.json({ error: error.message }, 500)
    }
  })

  app.get('*', (c) => c.text('not found')) // fallback

  await listen(getRequestListener(app.fetch), {
    hostname: '127.0.0.1',
    public: true, // This triggers a one line warning in the terminal when using public: true and specifying a `hostname`, but we'll circle back to that after demos
    port: GATEWAY_PORT,
    tunnel: true,
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
