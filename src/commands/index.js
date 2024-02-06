import chalk from 'chalk'
import { Command, Option } from 'commander'
import { closest } from 'fastest-levenshtein'
import envinfo from 'envinfo'
import execa from 'execa'
import inquirer from 'inquirer'

import { BANG, getPackageJson, exit, log, warn, USER_AGENT } from '../utils.js'
import { createDevCommand } from './dev.js'

const SUGGESTION_TIMEOUT = 1e4

process.on('uncaughtException', async (err) => {
  console.log('')
  console.error(`${chalk.red('Everywhere CLI has terminated unexpectedly')}`)

  const systemInfo = await getSystemInfo()

  console.log(chalk.dim(err.stack || err))
  console.log(chalk.dim(systemInfo))

  console.error(err)

  process.exit(1)
})
  
const getSystemInfo = () =>
  envinfo.run({
    System: ['OS', 'CPU'],
    Binaries: ['Node', 'npm', 'pnpm', 'Yarn'],
    npmGlobalPackages: ['everywhere-cli'],
  })

const getVersionPage = async () => {
  const data = await getSystemInfo()

  return `
────────────────────┐
  Environment Info   │
────────────────────┘
${data}
${USER_AGENT}
`
}

/**
 * The every CLI command without any command (root action)
 */
const everyCommand = async function (options, command) {
  if (command.args[0] === 'version' || options.version) {
    if (options.verbose) {
      const versionPage = await getVersionPage()
      log(versionPage)
    }
    log(USER_AGENT)
    exit()
  }

  // if no command show the header and the help
  if (command.args.length === 0) {
    const pkg = await getPackageJson()

    const title = `${chalk.hex('#6A50EB')('ϵ✵ Everywhere CLI')}`
    const docsMsg = `${chalk.hex('#139C6E')('Check out the docs:')} https://docs.everywhere.computer/`
    const supportMsg = `${chalk.hex('#EBC428')('Support and bugs:')} ${pkg.bugs.url}`

    console.log()
    console.log(title)
    console.log(docsMsg)
    console.log(supportMsg)
    console.log()

    command.help()
  }

  // if (command.args[0] === 'help') {
  //   if (command.args[1]) {
  //     const subCommand = command.commands.find((cmd) => cmd.name() === command.args[1])
  //     if (!subCommand) {
  //       error(`command ${command.args[1]} not found`)
  //     }
  //     subCommand.help()
  //   }
  //   command.help()
  // }

  // warn(`${chalk.yellow(command.args[0])} is not a ${command.name()} command.`)

  const allCommands = command.commands.map((cmd) => cmd.name())
  const suggestion = closest(command.args[0], allCommands)

  const applySuggestion = await new Promise((resolve) => {
    const prompt = inquirer.prompt({
      type: 'confirm',
      name: 'suggestion',
      message: `Did you mean ${chalk.blue(suggestion)}`,
      default: false,
    })

    setTimeout(() => {
      prompt.ui.close()
      resolve(false)
    }, SUGGESTION_TIMEOUT)

    prompt.then((value) => resolve(value.suggestion))
  })

  log()

  if (!applySuggestion) {
    console.error(`Run ${chalk.bgRedBright(`${command.name()} help`)} for a list of available commands.`)
  }

  await execa(process.argv[0], [process.argv[1], suggestion], { stdio: 'inherit' })
}

/**
 * Creates the `every` command
 * Promise is needed as the envinfo is a promise
 */
export const createEveryCommand = () => {
  const program = new Command('every')
  createDevCommand(program)

  program
    .version(USER_AGENT, '-v, --version')
    .alias('create')
    .showSuggestionAfterError(true)
    .configureOutput({
      outputError: (message, write) => {
        write(`${chalk.red(BANG)}   Error: ${message.replace(/^error:\s/g, '')}`)
        write(`${chalk.red(BANG)}   See more help with --help\n`)
      },
    })
    .action(everyCommand)

  return program
}
  