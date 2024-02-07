import chalk from 'chalk'
import { readFile } from 'fs/promises'
import WSL from 'is-wsl'
import os from 'os'
import { dirname, join } from 'path'
import process from 'process'
import { fileURLToPath } from 'url'
import { format, inspect } from 'util'

// @ts-ignore-next-line
let packageJson
export const getPackageJson = async () => {
  // @ts-ignore-next-line
  if (!packageJson) {
    const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '../package.json')
    // @ts-expect-error
    packageJson = JSON.parse(await readFile(packageJsonPath))
  }

  return packageJson
}

const { name, version: packageVersion } = await getPackageJson()
const platform = WSL ? 'wsl' : os.platform()
const arch = os.arch() === 'ia32' ? 'x86' : os.arch()
export const version = packageVersion
export const USER_AGENT = `${name}/${version} ${platform}-${arch} node-${process.version}`

export const BANG = process.platform === 'win32' ? '»' : '›'

export const exit = (code = 0) => {
  process.exit(code)
}

export const log = (message = '', ...args: string[]) => {
  message = typeof message === 'string' ? message : inspect(message)
  process.stdout.write(`${format(message, ...args)}\n`)
}

export const warn = (message = '') => {
  const bang = chalk.yellow(BANG)
  log(`${bang} Warning: ${message}`)
}
