import fs from 'fs'
import path from 'path'
import retry from 'async-retry'
import chalk from 'chalk'
import { execa } from 'execa'
import { gracefulExit } from 'exit-hook'

import pDefer from 'p-defer'
import { GATEWAY_PORT, HOMESTAR_PORT } from '../dev.js'
import {
  downloadAndExtractRepo,
  getRepoInfo,
  hasRepo,
} from './git.js'
import installPackages from './install-packages.js'
import isWriteable from './is-writeable.js'
import makeDir from './make-dir.js'

export class DownloadError extends Error {}

const CONTROL_PANEL_REPO_URL =
  'https://github.com/everywhere-computer/control-panel'
const CONTROL_PANEL_BRANCH = 'avivash/custom-function-ui'

/**
 * Overwrite the workflow rsc value in the Control Panel's .env file
 *
 * @param {object} root0
 * @param {string} root0.root
 */
const writeEnvFile = async ({ root }) => {
  try {
    const envPath = `${root}/.env`
    const originalFile = await fs.promises.readFile(envPath, 'utf8')

    // Replace gateway endpoint
    const gatewayPortRegex = /VITE_GATEWAY_ENDPOINT="http:\/\/localhost:4337"/g
    let edits = originalFile.replaceAll(
      gatewayPortRegex,
      `VITE_GATEWAY_ENDPOINT="http://localhost:${GATEWAY_PORT}"`
    )

    await fs.promises.writeFile(envPath, edits, 'utf8')

    // Replace websocket endpoint
    const websocketRegex = /VITE_WEBSOCKET_ENDPOINT="ws:\/\/127.0.0.1:2337"/g
    edits = originalFile.replaceAll(
      websocketRegex,
      `VITE_WEBSOCKET_ENDPOINT="ws://127.0.0.1:${HOMESTAR_PORT}"`
    )

    await fs.promises.writeFile(envPath, edits, 'utf8')

    // console.log()
    // console.log(`Writing to .env at ${chalk.green(envPath)}.`)
    // console.log()
  } catch (error) {
    console.error(error)
    gracefulExit(1)
  }
}

/**
 * Kick off the Control Panagel app creation
 */
export const installControlPanel = async () => {
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

    const found = repoInfo
      ? await hasRepo({ ...repoInfo, branch: CONTROL_PANEL_BRANCH })
      : false

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

  await makeDir(root)

  process.chdir(root)

  const packageJsonPath = path.join(root, 'package.json')
  let hasPackageJson = false

  if (repoInfo && repoUrl) {
    /**
     * Clone the repo if it exists
     */
    try {
      const repoInfo2 = repoInfo
      await retry(
        () => downloadAndExtractRepo(root, repoInfo2, CONTROL_PANEL_BRANCH),
        {
          retries: 3,
        }
      )
    } catch (error) {
      /**
       *
       * @param err
       */
      function isErrorLike(err) {
        return (
          typeof err === 'object' &&
          err !== null &&
          typeof err.message === 'string'
        )
      }
      throw new DownloadError(
        isErrorLike(error) ? error.message : String(error)
      )
      // gracefulExit(1)
    }

    // Write .env values
    await writeEnvFile({ root })

    hasPackageJson = fs.existsSync(packageJsonPath)
    if (hasPackageJson) {
      await installPackages(root, null, {
        packageManager: 'npm',
        isOnline: true,
      })
    }
  }
}

/**
 * Start the control panel
 */
export async function startControlPanel() {
  await installControlPanel()
  const hs = execa('npm', ['run', 'start'])
  /** @type {import('p-defer').DeferredPromise<number>} */
  const defer = pDefer()
  hs.stdout?.on('data', (data) => {
    const str = data.toString()

    if (str.includes('Local:   http://localhost:')) {
      const port = str.match(/Local: {3}http:\/\/localhost:(\d+)/)
      defer.resolve(Number(port[1]))
    }
  })

  return defer.promise
  // console.log(chalk.green(`EC Control Panel running on port ${chalk.yellow(5178)}`))
}
