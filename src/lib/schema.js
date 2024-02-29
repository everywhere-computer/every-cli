/* eslint-disable unicorn/no-null */
/* eslint-disable unicorn/no-thenable */
/**
 *
 * @param {import("../types.js").FnsMap} map
 */
export function schema(map) {
  const names = [...map.keys()]

  const allOf = []
  for (const [key, value] of map) {
    if (!value.schema.properties) continue
    const propsSize = Object.keys(value.schema.properties).length
    const options = Object.values(value.schema.properties)
    const optionsWithTemplates = options.map((option) => {
      return {
        anyOf: [
          option,
          {
            type: 'string',
            pattern: '^\\{\\{.*\\}\\}$',
            description: 'Workflow template',
            examples: ['{{needs.qr.output}}'],
          },
        ],
      }
    })
    allOf.push({
      if: { properties: { func: { const: key } } },
      then: {
        properties: {
          args: {
            type: 'array',
            items: optionsWithTemplates,
            additionalItems: false,
            maxItems: propsSize,
            minItems: propsSize,
          },
        },
      },
    })
  }
  return {
    additionalProperties: false,
    definitions: {
      input: {
        type: 'object',
        required: ['func'],
        properties: {
          func: {
            type: 'string',
            enum: names,
            description: 'Function to call',
          },
          args: {
            type: 'array',
            description: 'Arguments to pass to the function',
            items: {
              oneOf: [
                {
                  type: 'string',
                },
                {
                  type: 'number',
                },
                {
                  type: 'object',
                },
                {
                  type: 'array',
                },
              ],
            },
          },
        },
        allOf,
      },
      task: {
        type: 'object',
        required: ['name', 'input'],
        properties: {
          name: {
            type: 'string',
            description: 'Task name',
          },
          nnc: {
            oneOf: [
              { type: 'string', description: 'Use empty string for no nonce' },
              {
                type: 'object',
                description: 'Base64 encoded binary',
                properties: {
                  '/': {
                    type: 'object',
                    properties: {
                      bytes: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            ],
            description:
              'A 12-byte or 16-byte nonce encoded as IPLD bytes. Use empty string for no nonce.',
          },
          op: {
            type: 'string',
            description: 'Wasm Operation',
            default: 'wasm/run',
          },
          rsc: {
            type: 'string',
            description: 'Resource to operate on.',
            examples: [
              'ipfs://bafybeiczefaiu7464ehupezpzulnti5jvcwnvdalqrdliugnnwcdz6ljia',
            ],
          },
          input: {
            $ref: '#/definitions/input',
            description:
              'Input to the task. \nAvailable expression contexts: `needs`. \nAvailable expression functions: `cid`.',
          },
        },
      },
      meta: {
        type: 'object',
        required: ['memory', 'time'],
        properties: {
          memory: {
            type: 'number',
            description: 'Memory used in bytes',
            default: 4_294_967_296,
          },
          time: {
            type: 'number',
            description: 'Time used in milliseconds',
            default: 100_000,
          },
        },
      },
      invocation: {
        type: 'object',
        required: ['run'],
        properties: {
          v: {
            type: 'string',
            description: 'Version',
          },
          run: {
            $ref: '#/definitions/task',
            description: 'Task to run',
          },
          cause: {
            type: 'null',
            description: 'Cause of the invocation',
            default: null,
          },
          auth: {
            type: 'string',
          },
          meta: {
            $ref: '#/definitions/meta',
          },
          prf: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      },
    },
    required: ['tasks'],
    properties: {
      tasks: {
        type: 'array',
        items: {
          $ref: '#/definitions/invocation',
        },
      },
    },
    type: 'object',
  }
}
