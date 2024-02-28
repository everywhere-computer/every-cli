import fs from 'fs/promises'
import ora from 'ora'

import { CONFIG_PATH } from '../cli.js'

export async function clean() {
  const spinner = ora('Removing working directory').start()

  try {
    await fs.access(CONFIG_PATH)
    await fs.rm(CONFIG_PATH, { recursive: true })
    spinner.succeed('Working directory removed')
  } catch (error) {
    spinner.succeed('Working directory already removed')
  }
}
