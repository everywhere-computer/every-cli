import { Homestar } from '@fission-codes/homestar'
import { invocation, workflow } from '@fission-codes/homestar/workflow'
import Ajv from 'ajv'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { validator } from 'hono/validator'
import { base32hex } from 'iso-base/rfc4648'
import { randomBytes } from 'iso-base/crypto'
import pDefer from 'p-defer'

import { schema } from './schema.js'
import { inferResponse, inferType } from './response.js'

/**
 * Create invocations from tasks
 *
 * @param {import('../types.js').FnsMap} fns
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
 * @param {import('../types.js').ConfigDev} opts
 * @param {Homestar} hs
 * @param {import('../types.js').Fns} fns
 * @returns
 */
export function generateApp(opts, hs, fns) {
  /** @type {Hono<{Variables: {name: string, schema: import('ajv').SchemaObject, data: import('../types.js').FnData}}>} */
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
        const allResults =
          /** @type { import('../types.js').RunResult[]} */ ([])
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

  return app
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
