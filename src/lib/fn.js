import path from 'path'
import { execa } from 'execa'
import { build } from '@fission-codes/homestar/wasmify'
import { createGenerator } from 'ts-json-schema-generator'

import { CONFIG_PATH, __dirname } from '../../cli.js'
import { addFSFileToIPFS } from './ipfs.js'

/**
 * @param { string } src
 * @param { string } out
 */
async function wasmFn(src, out) {
  const srcPath = path.relative(process.cwd(), path.resolve(src))
  await execa(
    `${__dirname}/node_modules/.bin/jco`,
    [
      'transpile',
      srcPath,
      '-o',
      out,
      '--map',
      'wasi-*=@bytecodealliance/preview2-shim/*',
    ],
    {
      preferLocal: true,
    }
  )

  const basename = path.basename(srcPath).replace('.wasm', '.d.ts')

  /** @type {import('ts-json-schema-generator').Config} */
  const config = {
    path: path.join(out, basename),
  }
  const schema = createGenerator(config).createSchema(config.type)

  if (!schema.definitions) {
    throw new Error('No definitions found')
  }

  const entries = /** @type { import('../types.js').Entries} */ (
    Object.entries(schema.definitions).map(([k, v]) => [
      k.replaceAll('NamedParameters<typeof ', '').replaceAll('>', ''),
      v,
    ])
  )

  return {
    entries,
    filePath: src,
  }
}

/**
 * @param { string } src
 * @param { string } out
 */
async function tsFn(src, out) {
  const fnPath = path.relative(process.cwd(), path.resolve(src))
  const wasmPath = await build({
    entryPoint: fnPath,
    outDir: out,
  })
  /** @type {import('ts-json-schema-generator').Config} */
  const config = {
    path: fnPath,
  }
  const schema = createGenerator(config).createSchema(config.type)

  if (!schema.definitions) {
    throw new Error('No definitions found')
  }

  const entries = /** @type { import('../types.js').Entries} */ (
    Object.entries(schema.definitions).map(([k, v]) => [
      k.replaceAll('NamedParameters<typeof ', '').replaceAll('>', ''),
      v,
    ])
  )

  return {
    entries,
    filePath: wasmPath.outPath,
  }
}

/**
 *
 * @param {import('../types.js').ConfigDev} opts
 * @param {number} ipfsPort
 */
export async function parseFns(opts, ipfsPort) {
  /** @type {string[]} */
  let fnsPath = []

  /** @type {import('../types.js').Entries} */
  const allEntries = []

  /** @type {import('../types.js').FnsMap} */
  const fns = new Map()

  if (typeof opts.fn === 'string') {
    fnsPath.push(opts.fn)
  }

  if (Array.isArray(opts.fn)) {
    fnsPath = opts.fn
  }

  for await (const fnPath of fnsPath) {
    if (['.ts'].includes(path.extname(fnPath))) {
      const { entries, filePath } = await tsFn(fnPath, CONFIG_PATH)
      allEntries.push(...entries)
      const cid = await addFSFileToIPFS(filePath, ipfsPort)
      for (const e of entries) {
        fns.set(e[0], {
          name: e[0],
          cid: cid.toString(),
          schema: e[1],
          path: filePath,
          args: e[1].properties ? Object.keys(e[1].properties) : [],
        })
      }
    }

    if (['.wasm'].includes(path.extname(fnPath))) {
      const { entries, filePath } = await wasmFn(fnPath, CONFIG_PATH)
      allEntries.push(...entries)
      const cid = await addFSFileToIPFS(filePath, ipfsPort)
      for (const e of entries) {
        fns.set(e[0], {
          name: e[0],
          cid: cid.toString(),
          schema: e[1],
          path: filePath,
          args: e[1].properties ? Object.keys(e[1].properties) : [],
        })
      }
    }
  }

  return { schema: allEntries, map: fns }
}
