import { execa } from 'execa'

import { startGateway } from '../server.js'

export const dev = async (options, command) => {
  // Start HTTP Gateway
  startGateway()

  // Start Homestar
  execa('npm', ['run', 'homestar'], { stdio: 'inherit' })
}

export const createDevCommand = (program) => program
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

