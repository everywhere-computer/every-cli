import { execa } from 'execa'

import type { Every_Command } from './index.js'
import { startGateway } from '../server.js'

export const dev = async (options: { live: boolean | string }, command: Every_Command) => {
  // Start HTTP Gateway
  startGateway()

  // Start Homestar
  execa('npm', ['run', 'homestar'], { stdio: 'inherit' })
}

export const createDevCommand = (program: Every_Command) => program
  .command('dev')
  .alias('develop')
  .description(
    'The dev command will run a local dev server',
  )
  .option(
    '-l, --live [subdomain]',
    '',
    false,
  )
  .action(dev)

