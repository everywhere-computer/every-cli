#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir } from 'fs/promises'
import fs from 'fs'
import { gracefulExit } from 'exit-hook'
import sade from 'sade'

import { clean } from './src/clean.js'
import { dev } from './src/dev.js'

export const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Get the version from package.json
const { version } = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
)

// Handle any uncaught errors
process.once(
  'uncaughtException',
  (/** @type {Error} */ err, /** @type {string} */ origin) => {
    if (!origin || origin === 'uncaughtException') {
      console.error(err)
      gracefulExit(1)
    }
  }
)
process.once('unhandledRejection', (err) => {
  console.error(err)
  gracefulExit(1)
})

// TODO change to https://github.com/sindresorhus/env-paths
export const CONFIG_PATH = path.join(__dirname, 'config')

const prog = sade('every').option('--config', 'config file path')

prog
  .version(version)
  .command('dev', '', { default: true })
  .option('--fn', 'WASM or TS file path')
  .option('--ipfsPort', 'ipfs port', 5001)
  .option('--debug', 'debug mode', false)
  .action(async (/** @type {import('./src/types.ts').ConfigDev} */ opts) => {
    try {
      await mkdir(CONFIG_PATH, { recursive: true })

      if (opts._ && !opts.fn) {
        opts.fn = opts._
      }

      if (opts.fn) {
        await dev(opts)
      } else {
        prog.help('dev')
      }
    } catch (error) {
      console.error(error)
      gracefulExit(1)
    }
  })

prog.command('clean').action(async () => {
  try {
    await clean()
  } catch (error) {
    console.error(error)
    gracefulExit(1)
  }
})
prog.parse(process.argv)
