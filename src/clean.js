import fs from 'fs/promises'
import ora from 'ora'

import { CONFIG_PATH } from '../cli.js'

export async function clean() {
  const spinner = ora('Removing working directory').start()

  await fs.rm(CONFIG_PATH, { recursive: true })

  spinner.succeed('Working directory removed')
}
