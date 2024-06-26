import path from 'path'
import fs from 'fs/promises'

// @ts-ignore
import tiged from 'tiged'
import { execa } from 'execa'
import pDefer from 'p-defer'

import { CONFIG_PATH } from '../../cli.js'

/**
 * @param {{homestar: number, gateway: number}} ports
 */
export async function setupControlPanel(ports) {
  const dir = path.join(CONFIG_PATH, 'control-panel')
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(path.join(CONFIG_PATH, 'control-panel'), {
    recursive: true,
  })

  await tiged('everywhere-computer/control-panel', {
    // force: true,
    // cache: false,
    // verbose: true,
    //   mode: 'git',
  }).clone(dir)

  await execa('npm', ['install'], {
    cwd: dir,
  })

  // env file
  const envPath = path.join(dir, '.env')
  let envContent = await fs.readFile(envPath, 'utf8')
  envContent = envContent.replaceAll(
    'VITE_GATEWAY_ENDPOINT="http://127.0.0.1:3000"',
    `VITE_GATEWAY_ENDPOINT="http://127.0.0.1:${ports.gateway}"`
  )
  envContent = envContent.replaceAll(
    'VITE_WEBSOCKET_ENDPOINT="ws://127.0.0.1:8020"',
    `VITE_WEBSOCKET_ENDPOINT="ws://127.0.0.1:${ports.homestar}"`
  )
  await fs.writeFile(envPath, envContent)

  // start control panel
  const cp = execa('npm', ['run', 'start'], { cwd: dir })
  /** @type {import('p-defer').DeferredPromise<number>} */
  const defer = pDefer()
  cp.stdout?.on('data', (data) => {
    const str = data.toString()

    if (str.includes('Local:   http://127.0.0.1:')) {
      const port = str.match(/Local: {3}http:\/\/127.0.0.1:(\d+)/)
      defer.resolve(Number(port[1]))
    }
  })

  return defer.promise
}
