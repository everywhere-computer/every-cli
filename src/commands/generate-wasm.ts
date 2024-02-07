import type { Every_Command } from './index.js'
import { build } from '../helpers/convert-ts-to-wasm.js'
import persistToIPFS from '../helpers/persist-to-ipfs.js'

export const genWasm = async (options: { ipfs: boolean; rust: boolean; typescript: boolean }, command: Every_Command) => {
  // Generate WASM file from TS file
  if (options.typescript) {
    await build(command.args[0])
  } else if (options.rust) {
    // Call script to generate WASM from Rust file
  }

  const filePathParts = command.args[0].split('/')
  const fileName = filePathParts[filePathParts.length - 1].split('.')[0]

  if (options.ipfs) {
    const cid = await persistToIPFS(`${fileName}.wasm`)
    console.log(cid)
  }
}

export const createGenerateWasmCommand = (program: Every_Command) => program
  .command('generate-wasm')
  .alias('gen-wasm')
  .description(
    'Generate WASM from either a TypeScript or Rust function',
  )
  .option(
    '--ipfs',
    'persist generated WASM to IPFS',
    true,
  )
  .option(
    '-t, --typescript',
    'generate a WASM file from a TypeScript file',
    true,
  )
  .option(
    '-r, --rust',
    'generate a WASM file from a Rust file',
    false,
  )
  .action(genWasm)

