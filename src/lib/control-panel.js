import retry from 'async-retry'
import chalk from 'chalk'
import { execa } from 'execa'
import { gracefulExit } from 'exit-hook'
import fs from 'fs'
import path from 'path'

import { GATEWAY_PORT, HOMESTAR_PORT } from '../dev.js'
import {
  tryGitInit,
  downloadAndExtractRepo,
  getRepoInfo,
  hasRepo,
} from './git.js'
import installPackages from './install-packages.js'
import isWriteable from './is-writeable.js'
import makeDir from './make-dir.js'

export class DownloadError extends Error {}

const CONTROL_PANEL_REPO_URL = 'https://github.com/everywhere-computer/control-panel'
const CONTROL_PANEL_BRANCH = 'avivash/custom-function-ui'
const DEFAUL_ENV_INFO = {
  VITE_WORKFLOW_RESOURCE: 'ipfs://bafybeig6u35v6t3f4j3zgz2jvj4erd45fbkeolioaddu3lmu6uxm3ilb7a'
}

/**
 * Overwrite the workflow rsc value in the Control Panel's .env file 
 */
const writeEnvFile = async ({
  root,
  cid,
}) => {
  try {
    const envPath = `${root}/.env`
    const originalFile = await fs.promises.readFile(envPath, 'utf8')

    // Replace workflow resource CID
    const workflowResourceRegex = new RegExp(
      `VITE_WORKFLOW_RESOURCE="${DEFAUL_ENV_INFO.VITE_WORKFLOW_RESOURCE}"`,
      'g',
    )
    let edits = originalFile.replace(
      workflowResourceRegex,
      `VITE_WORKFLOW_RESOURCE="ipfs://${cid}"`,
      )
      
    await fs.promises.writeFile(envPath, edits, 'utf8')

    // Replace gateway endpoint
    const gatewayPortRegex = new RegExp(
      `VITE_GATEWAY_ENDPOINT="http://localhost:4337"`,
      'g',
    )
    edits = originalFile.replace(
      gatewayPortRegex,
      `VITE_GATEWAY_ENDPOINT="http://localhost:${GATEWAY_PORT}"`,
    )

    await fs.promises.writeFile(envPath, edits, 'utf8')

    // Replace websocket endpoint
    const websocketRegex = new RegExp(
      `VITE_WEBSOCKET_ENDPOINT="ws://127.0.0.1:2337"`,
      'g',
    )
    edits = originalFile.replace(
      websocketRegex,
      `VITE_WEBSOCKET_ENDPOINT="ws://127.0.0.1:${HOMESTAR_PORT}"`,
    )

    await fs.promises.writeFile(envPath, edits, 'utf8')

    console.log()
    console.log(`Writing to .env at ${chalk.green(envPath)}.`)
    console.log()
  } catch (err) {
    console.error(err)
    exit()
  }
}

/**
 * Kick off the Control Panagel app creation
 * @param {string} cid
 */
export const installControlPanel = async (cid) => {
  const appPath = `${process.cwd()}/control-panel`
  let repoInfo
  let repoUrl

  try {
    repoUrl = new URL(CONTROL_PANEL_REPO_URL)
  } catch (error) {
    if (error.code !== 'ERR_INVALID_URL') {
      console.error(error)
      gracefulExit(1)
    }
  }

  if (repoUrl) {
    repoInfo = await getRepoInfo(repoUrl)

    if (!repoInfo) {
      console.error(
        `Found invalid GitHub URL: ${chalk.red(
          `'${repoUrl}'`
        )}. Please fix the URL and try again.`
      )
      gracefulExit(1)
    }

    const found = repoInfo ? await hasRepo({ ...repoInfo, branch: CONTROL_PANEL_BRANCH }) : false;

    if (!found) {
      console.error(
        `Could not locate the repository for ${chalk.red(
          `'${repoUrl}'`
        )}. Please check that the repository exists and try again.`
      )
      gracefulExit(1)
    }
  }

  const root = path.resolve(appPath)

  if (!(await isWriteable(path.dirname(root)))) {
    console.error(
      'The application path is not writable, please check folder permissions and try again.'
    )
    console.error(
      'It is likely you do not have write permissions for this folder.'
    )
    gracefulExit(1)
  }

  const appName = path.basename(root)

  await makeDir(root)

  const originalDirectory = process.cwd()

  console.log()
  console.log(`Creating a Control Panel in ${chalk.green(root)}.`)
  console.log()

  process.chdir(root)

  const packageJsonPath = path.join(root, 'package.json')
  let hasPackageJson = false

  if (repoInfo && repoUrl) {
    /**
     * Clone the repo if it exists
     */
    try {
      console.log(
        `Downloading files from repo ${chalk.green(
          `${repoUrl}`,
        )}. This might take a moment.`,
      )
      console.log()
      const repoInfo2 = repoInfo
      await retry(() => downloadAndExtractRepo(root, repoInfo2, CONTROL_PANEL_BRANCH), {
        retries: 3,
      })
    } catch (reason) {
      function isErrorLike(err) {
        return (
          typeof err === 'object' &&
          err !== null &&
          typeof err.message === 'string'
        )
      }
      throw new DownloadError(
        isErrorLike(reason) ? reason.message : reason + '',
      )
      // gracefulExit(1)
    }

    // Write .env values
    if (cid) {
      await writeEnvFile({ root, cid })
    }

    hasPackageJson = fs.existsSync(packageJsonPath)
    if (hasPackageJson) {
      console.log()
      console.log('Installing packages. This might take a couple of minutes...')
      console.log()

      await installPackages(root, null, { packageManager: 'npm', isOnline: true })
    }
  }

  if (tryGitInit(root)) {
    console.log('Initialized a git repository.')
    console.log()
  }

  let cdpath
  if (path.join(originalDirectory, appName) === appPath) {
    cdpath = appName
  } else {
    cdpath = appPath
  }

  console.log(`${chalk.green('Success!')} Created ${chalk.green(appName)} at ${chalk.green(appPath)}`)

  console.log()
}

/**
 * Start the control panel
 * @param {string} cid
 * @returns* 
 */
export default async (cid) => {
  await installControlPanel(cid)
  execa('npm', ['run', 'dev'], { stdio: 'inherit' })
  // console.log(chalk.green(`EC Control Panel running on port ${chalk.yellow(5178)}`))
}
