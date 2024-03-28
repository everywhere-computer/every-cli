import path from 'path'
import fs from 'fs/promises'
import { execa } from 'execa'
import chalk from 'chalk'
import ora from 'ora'
import { gracefulExit } from 'exit-hook'
import { Homestar } from '@fission-codes/homestar'
import { WebsocketTransport } from '@fission-codes/channel/transports/ws.js'
import { listen } from 'listhen'
import { getRequestListener } from '@hono/node-server'
import TOML from '@iarna/toml'

import { CONFIG_PATH, __dirname } from '../cli.js'
import { generateApp } from './lib/app.js'
import { setupControlPanel } from './lib/cp.js'
import { startIPFS } from './lib/ipfs.js'
import { parseFns } from './lib/fn.js'
import { deepAssign } from './utils/deepAssign.js'

/** @type {number} */
const GATEWAY_PORT = 3000

/** @type {number} */
let HOMESTAR_PORT = 8020
/** @type {string} */
let HOMESTAR_WEBSERVER_HOST = '127.0.0.1'
/** @type {number} */
let IPFS_PORT

/**
 *
 * @param {import('./types.js').ConfigDev} opts
 */
async function getHomestarConfig(opts) {
  IPFS_PORT = opts.ipfsPort

  let useOfflineVersion = false
  let homestarToml = `
[node]
[node.network.metrics]
port = 4020

[node.network.rpc]
port = 9820

[node.network.webserver]
host = "127.0.0.1"
port = ${HOMESTAR_PORT}

[node.network.ipfs]
host = "127.0.0.1"
port = ${IPFS_PORT}
      `
  const parsedHomestarToml = TOML.parse(homestarToml)

  // If a --config file is set, read those values and apply them to the one in the `config` directory
  if (opts.config) {
    const userConfigFile = await fs.readFile(opts.config, 'utf-8')
    let parsedUserToml = TOML.parse(userConfigFile)

    // If the user has set a keypair_config, update the path to point to the original file
    const originalKeypairPath =
      // @ts-ignore
      parsedUserToml?.node?.network?.keypair_config?.existing?.path
    if (originalKeypairPath) {
      const userTomlDir = path.dirname(opts.config)
      // @ts-ignore
      parsedUserToml.node.network.keypair_config.existing.path = path.resolve(
        path.join(userTomlDir, originalKeypairPath)
      )
    }

    // If the user has specified a different Homestar port, load the local control panel
    useOfflineVersion =
      // @ts-ignore
      parsedUserToml?.node?.network?.webserver?.port &&
      // @ts-ignore
      parsedUserToml.node.network.webserver.port !==
        // @ts-ignore
        parsedHomestarToml.node.network.webserver.port

    const merged = deepAssign(parsedHomestarToml, parsedUserToml)

    HOMESTAR_PORT = merged.node.network.webserver.port
    HOMESTAR_WEBSERVER_HOST = merged.node.network.webserver.host
    IPFS_PORT = merged.node.network.ipfs.port

    homestarToml = TOML.stringify(merged)
  }

  return {
    homestarToml,
    useOfflineVersion,
  }
}

/**
 *
 * @param {string} homestarToml
 */
async function startHomestar(homestarToml) {
  const config1 = path.join(CONFIG_PATH, 'homestar.toml')

  // Write homestar.toml to config directory
  await fs.writeFile(config1, homestarToml)

  // Specify path to homestar.db in the config directory
  const db1 = path.join(CONFIG_PATH, 'homestar.db')

  // Start Homestar
  execa(
    `${__dirname}/node_modules/.bin/homestar`,
    ['start', '-c', config1, '--db', db1],
    {
      preferLocal: true,
      stdio: 'inherit',
      env: {
        ...('RUST_LOG' in process.env
          ? { EVERY_CLI: 'false', RUST_LOG: process.env.RUST_LOG }
          : { EVERY_CLI: 'true' }),
      },
    }
  )

  // Init Homestar client
  const hs = new Homestar({
    transport: new WebsocketTransport(
      `ws://${HOMESTAR_WEBSERVER_HOST}:${HOMESTAR_PORT}`
    ),
  })

  return hs
}

/**
 *
 * @param {import('./types.js').ConfigDev} opts
 */
export async function dev(opts) {
  const spinner = ora('Starting IPFS').start()

  const { homestarToml, useOfflineVersion } = await getHomestarConfig(opts)

  await startIPFS(IPFS_PORT)
  spinner.succeed(
    `IPFS is running at ${chalk.cyan(`http://127.0.0.1:${IPFS_PORT}/debug/vars`)}`
  )

  spinner.start('Processing functions')
  const fns = await parseFns(opts, IPFS_PORT)
  spinner.succeed('Functions parsed and compiled')

  spinner.start('Starting Homestar')
  const hs = await startHomestar(homestarToml)
  const health = await hs.health()

  if (health.error) {
    console.error('❌ Homestar did not start correctly')
    return gracefulExit(1)
  }
  spinner.succeed(
    `Homestar is running at ${chalk.cyan(`http://${HOMESTAR_WEBSERVER_HOST}:${HOMESTAR_PORT}`)}`
  )

  spinner.start('Starting Control Panel')
  if (useOfflineVersion) {
    const controlPanelPort = await setupControlPanel({
      gateway: GATEWAY_PORT,
      homestar: HOMESTAR_PORT,
    })
    spinner.succeed(
      `Control Panel is running at ${chalk.cyan(`http://127.0.0.1:${controlPanelPort}`)}`
    )
  } else {
    spinner.succeed(
      `Control Panel is running at ${chalk.cyan(`https://control.everywhere.computer`)}`
    )
  }

  const app = generateApp(opts, hs, fns)

  await listen(getRequestListener(app.fetch), {
    hostname: '127.0.0.1',
    public: true, // This triggers a one line warning in the terminal when using public: true and specifying a `hostname`, but we'll circle back to that after demos
    port: GATEWAY_PORT,
    tunnel: true,
  })
}
