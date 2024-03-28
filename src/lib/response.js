import { fileTypeFromBuffer } from 'file-type'

/**
 * @param {any} out
 */
export async function inferType({ out, ...rest }) {
  const type = toString.call(out).slice(8, -1)

  switch (type) {
    case 'String': {
      if (out.startsWith('<svg xmlns:svg="http://www.w3.org/2000/svg"')) {
        return {
          out,
          type,
          headers: {
            'Content-Type': 'image/svg+xml',
          },
          ...rest,
        }
      }
      return {
        out,
        type,
        headers: {
          'Content-Type': 'plain/text',
        },
        ...rest,
      }
    }

    case 'Number': {
      return {
        out,
        type,
        headers: {
          'Content-Type': 'plain/text',
        },
        ...rest,
      }
    }

    case 'Array': {
      return {
        out: JSON.stringify(out),
        type,
        headers: {
          'Content-Type': 'application/json',
        },
        ...rest,
      }
    }

    case 'Uint8Array': {
      const mimeType = await fileTypeFromBuffer(out)
      return {
        out,
        type,
        headers: {
          'Content-Length': `${out.byteLength}`,
          'Content-Type': mimeType?.mime || 'application/octet-stream',
        },
        ...rest,
      }
    }

    default: {
      return {
        out,
        type,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        ...rest,
      }
    }
  }
}

/**
 * @param {any} out
 * @param {import('hono').Context} c
 */
export async function inferResponse(out, c) {
  const { out: res, headers } = await inferType({ out })

  return c.body(res, 200, headers)
}
