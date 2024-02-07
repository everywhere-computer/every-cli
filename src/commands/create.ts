import { execa } from 'execa'

import type { Every_Command } from './index.js'

const CONTROL_PANEL_REPO_URL = 'https://github.com/everywhere-computer/control-panel'

export const create = async (option: { template: boolean | string }, command: Every_Command) => {
  // Start Homestar
  // execa('npm', ['run', 'homestar'], { stdio: 'inherit' })
}

export const createCreateCommand = (program: Every_Command) => program
  .command('create')
  .description(
    `The create command will boot up a Homestar node`,
  )
  .option(
    '-t, --template [subdomain]',
    'Specify a template to use',
    false,
  )
  .action(create)
