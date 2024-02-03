#!/usr/bin/env node
import chalk from 'chalk'
import { Command } from 'commander'
import path from 'path'
import checkForUpdate from 'update-check'

import everywhereCli, { DownloadError } from './everywhere-cli'
// import getPkgManager from './src/helpers/get-pkg-manager'
import validateNpmName from './helpers/validate-pkg'
import packageJson from '../package.json'

let projectPath = '';

/**
 * Flow to be run when `every` is called.
 * Args can also be passed in: --live
 */
const program = new Command('every')
  .version(packageJson.version)
  .argument('[project-directory]')
  .usage(`${chalk.green('[project-directory]')} [options]`)
  .action((name) => {
    if (typeof name === 'string') {
      projectPath = name.trim()
    }
  })
  .option(
    '--live',
    `
        Explicitly tell the CLI to bootstrap the app using npm(This is the default option anyway)
    `,
  )
  .allowUnknownOption()
  .parse(process.argv)

const run = async () => {
  // If the user hasn't explicitly set a project path, ask them to
  projectPath = await setProjectPath(projectPath, program)

  // Detect the selected auth flow or ask the user which they'd prefer
  const authFlow = await setAuthFlow(program)

  // Detect the selected framework or ask the user which they'd prefer
  const framework = await setFramework(program)

  // Ask the user if they'd like to remove TypeScript(currently only supported in the React build)
  const removeTypescript = framework === Framework.React ? await setTypescript() : false

  // Ask the user if they would like to change the default app-info.ts values(og:title, og:description, etc...)
  const appInfo = await setAppInfo(authFlow)

  // Run NPM validation checks against projectName
  const resolvedProjectPath = path.resolve(projectPath)
  const projectName = path.basename(resolvedProjectPath)
  const { valid, problems } = validateNpmName(projectName)
  if (!valid) {
    console.error(
      `Could not create a project called ${chalk.red(
        `'${projectName}'`
      )} because of npm naming restrictions:`
    )

    problems?.forEach((p) => console.error(` ${chalk.red.bold('*')} ${p}`))
    process.exit(1)
  }

  const packageManager = !!program.useNpm
    ? 'npm'
    : !!program.usePnpm
    ? 'pnpm'
    : getPkgManager()

  try {
    await everywhereCli({
      appInfo,
      appPath: resolvedProjectPath,
      authFlow,
      framework,
      packageManager,
      removeTypescript,
    })
  } catch (reason) {
    if (!(reason instanceof DownloadError)) {
      throw reason
    }

    await everywhereCli({
      appInfo,
      appPath: resolvedProjectPath,
      authFlow: AuthFlow.WebCrypto,
      framework: Framework.SvelteKit,
      packageManager,
      removeTypescript,
    })
  }
}

const update = checkForUpdate(packageJson).catch(() => null)

const notifyUpdate = async () => {
  try {
    const res = await update
    if (res?.latest) {
      const pkgManager = getPkgManager()
      console.log(
        chalk.yellow.bold('A new version of `create-odd-app` is available!') +
          '\n' +
          'You can update by running: ' +
          chalk.cyan(
            pkgManager === 'yarn'
              ? 'yarn global add create-odd-app'
              : `${pkgManager} install --global create-odd-app`
          ) +
          '\n'
      )
    }
    process.exit()
  } catch {
    // ignore error
  }
}

run()
  .then(notifyUpdate)
  .catch(async (reason) => {
    console.log()
    console.log('Aborting installation.')
    if (reason.command) {
      console.log(`  ${chalk.cyan(reason.command)} has failed.`)
    } else {
      console.log(
        chalk.red('Unexpected error. Please report it as a bug:') + '\n',
        reason
      )
    }
    console.log()

    await notifyUpdate()

    process.exit(1)
  })