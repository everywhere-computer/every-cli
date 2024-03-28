import path from 'path'
import fs from 'fs/promises'
import { execa } from 'execa'
import chalk from 'chalk'
import ora from 'ora'
import pDefer from 'p-defer'
import { gracefulExit } from 'exit-hook'
import { validator } from 'hono/validator'
import { Homestar } from '@fission-codes/homestar'
import { invocation, workflow } from '@fission-codes/homestar/workflow'
import { WebsocketTransport } from '@fission-codes/channel/transports/ws.js'
import { base32hex } from 'iso-base/rfc4648'
import { randomBytes } from 'iso-base/crypto'
import { listen } from 'listhen'
import Ajv from 'ajv'
import { getRequestListener } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import TOML from '@iarna/toml'

import { CONFIG_PATH, __dirname } from '../cli.js'
import { setupControlPanel } from './lib/cp.js'
import { schema } from './lib/schema.js'
import { deepAssign } from './utils/deepAssign.js'
import { startIPFS } from './lib/ipfs.js'
import { parseFns } from './lib/fn.js'
import { inferResponse, inferType } from './lib/response.js'

/** @type {number} */
const GATEWAY_PORT = 3000

/** @type {number} */
let HOMESTAR_PORT = 8020
/** @type {string} */
let HOMESTAR_WEBSERVER_HOST = '127.0.0.1'
/** @type {number} */
let IPFS_PORT

/**
 * Create invocations from tasks
 *
 * @param {import('./types.js').FnsMap} fns
 * @param {import('@fission-codes/homestar/types').TemplateInvocation[]} tasks
 * @param {boolean} debug
 */
function createInvocations(fns, tasks, debug) {
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
        // If in debug mode, add a nonce to each task to prevent replays
        nnc: debug ? base32hex.encode(randomBytes(12), false) : '',
      },
    }
  })
}

/**
 *
 * @param {import('./types.js').ConfigDev} opts
 */
async function getHomestarConfig(opts) {
  IPFS_PORT = opts.ipfsPort

  let useOfflineVersion = false
  let homestarToml = `
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
port = ${IPFS_PORT}
      `
  const parsedHomestarToml = TOML.parse(homestarToml)

  // If a --config file is set, read those values and apply them to the one in the `config` directory
  if (opts.config) {
    const userConfigFile = await fs.readFile(opts.config, 'utf-8')
    let parsedUserToml = TOML.parse(userConfigFile)

    // If the user has set a keypair_config, update the path to point to the original file
    const originalKeypairPath =
      // @ts-ignore
      parsedUserToml?.node?.network?.keypair_config?.existing?.path
    if (originalKeypairPath) {
      const userTomlDir = path.dirname(opts.config)
      // @ts-ignore
      parsedUserToml.node.network.keypair_config.existing.path = path.resolve(
        path.join(userTomlDir, originalKeypairPath)
      )
    }

    // If the user has specified a different Homestar port, load the local control panel
    useOfflineVersion =
      // @ts-ignore
      parsedUserToml?.node?.network?.webserver?.port &&
      // @ts-ignore
      parsedUserToml.node.network.webserver.port !==
        // @ts-ignore
        parsedHomestarToml.node.network.webserver.port

    const merged = deepAssign(parsedHomestarToml, parsedUserToml)

    HOMESTAR_PORT = merged.node.network.webserver.port
    HOMESTAR_WEBSERVER_HOST = merged.node.network.webserver.host
    IPFS_PORT = merged.node.network.ipfs.port

    homestarToml = TOML.stringify(merged)
  }

  return {
    homestarToml,
    useOfflineVersion,
  }
}

/**
 *
 * @param {string} homestarToml
 */
async function startHomestar(homestarToml) {
  const config1 = path.join(CONFIG_PATH, 'homestar.toml')

  // Write homestar.toml to config directory
  await fs.writeFile(config1, homestarToml)

  // Specify path to homestar.db in the config directory
  const db1 = path.join(CONFIG_PATH, 'homestar.db')

  // Start Homestar
  execa(
    `${__dirname}/node_modules/.bin/homestar`,
    ['start', '-c', config1, '--db', db1],
    {
      preferLocal: true,
      stdio: 'inherit',
      env: {
        ...('RUST_LOG' in process.env
          ? { EVERY_CLI: 'false', RUST_LOG: process.env.RUST_LOG }
          : { EVERY_CLI: 'true' }),
      },
    }
  )

  // Init Homestar client
  const hs = new Homestar({
    transport: new WebsocketTransport(
      `ws://${HOMESTAR_WEBSERVER_HOST}:${HOMESTAR_PORT}`
    ),
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
 *
 * @param {import('./types.js').ConfigDev} opts
 */
export async function dev(opts) {
  const spinner = ora('Starting IPFS').start()

  const { homestarToml, useOfflineVersion } = await getHomestarConfig(opts)

  await startIPFS(IPFS_PORT)
  spinner.succeed(
    `IPFS is running at ${chalk.cyan(`http://127.0.0.1:${IPFS_PORT}/debug/vars`)}`
  )

  spinner.start('Processing functions')
  const fns = await parseFns(opts, IPFS_PORT)
  spinner.succeed('Functions parsed and compiled')

  spinner.start('Starting Homestar')
  const hs = await startHomestar(homestarToml)
  const health = await hs.health()

  if (health.error) {
    console.error('❌ Homestar did not start correctly')
    return gracefulExit(1)
  }
  spinner.succeed(
    `Homestar is running at ${chalk.cyan(`http://${HOMESTAR_WEBSERVER_HOST}:${HOMESTAR_PORT}`)}`
  )

  spinner.start('Starting Control Panel')
  if (useOfflineVersion) {
    const controlPanelPort = await setupControlPanel({
      gateway: GATEWAY_PORT,
      homestar: HOMESTAR_PORT,
    })
    spinner.succeed(
      `Control Panel is running at ${chalk.cyan(`http://127.0.0.1:${controlPanelPort}`)}`
    )
  } else {
    spinner.succeed(
      `Control Panel is running at ${chalk.cyan(`https://control.everywhere.computer`)}`
    )
  }

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
      // Bypass schema validation because it breaks if functions are passed with no args
      const tasks =
        /** @type{import('@fission-codes/homestar/types').TemplateInvocation[]} */ (
          value.tasks
        )
      if (tasks.every((task) => task.run.input.args.length === 0)) {
        return value
      }

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
      const invs = createInvocations(fns.map, tasks, opts.debug)

      try {
        const returnAllResults = c.req.query('allResults')

        const wf = await workflow({
          name: 'test',
          workflow: {
            tasks: invs,
          },
        })

        /** @type {import('p-defer').DeferredPromise<Uint8Array>} */
        const prom = pDefer()
        let count = 0
        const allResults = /** @type { import('./types.js').RunResult[]} */ ([])
        const { error } = await hs.runWorkflow(wf, async (data) => {
          count++

          if (returnAllResults) {
            allResults.push({
              ...(await inferType({
                out: data.receipt.out[1],
                replayed: data.metadata.replayed,
              })),
            })
          }

          if (count === invs.length) {
            prom.resolve(returnAllResults ? allResults : data.receipt.out[1])
          }
        })

        if (error) {
          return c.json({ error: error.message }, 500)
        }

        const out = await prom.promise

        if (returnAllResults) {
          return c.json(allResults, 200, {
            'Content-Type': 'application/json',
          })
        }

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
      const invs = createInvocations(fns.map, tasks, opts.debug)

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
