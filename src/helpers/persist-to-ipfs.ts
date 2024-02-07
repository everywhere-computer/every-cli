import { $ } from 'execa'

/**
 * Add a WASM file to IPFS
 * - This will look for a generate .wasm file in the root `/wasm` directory of this repo
 * Note: this assumes the user already has an IPFS daemon running
 * @param {string} wasmFileName 
 */
export default async (wasmFileName: string): Promise<string> => {
  if (!wasmFileName) {
    throw new Error('No WASM file to upload')
  }

  const { stdout } = await $`ipfs add --cid-version 1 ${process.cwd()}/wasm/${wasmFileName}`

  return stdout.split(' ')[1]
}
