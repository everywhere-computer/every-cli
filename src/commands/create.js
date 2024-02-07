import { execa } from 'execa'

const CONTROL_PANEL_REPO_URL = 'https://github.com/everywhere-computer/control-panel'

export const create = async (options, command) => {
  // Start Homestar
  // execa('npm', ['run', 'homestar'], { stdio: 'inherit' })
}

export const createCreateCommand = (program) => program
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
