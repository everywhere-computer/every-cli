import path from 'path'
import fs from 'fs/promises'
import degit from 'degit'
import { execa } from 'execa'
import pDefer from 'p-defer'

/**
 * @param {import('../types.ts').ConfigDev} opts
 * @param {{homestar: number, gateway: number}} ports
 */
export async function setupControlPanel(opts, ports) {
  const dir = path.join(opts.config, 'control-panel')
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(path.join(opts.config, 'control-panel'), {
    recursive: true,
  })

  await degit('everywhere-computer/control-panel#avivash/custom-function-ui', {
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
  const hs = execa('npm', ['run', 'start'], { cwd: dir })
  /** @type {import('p-defer').DeferredPromise<number>} */
  const defer = pDefer()
  hs.stdout?.on('data', (data) => {
    const str = data.toString()

    if (str.includes('Local:   http://127.0.0.1:')) {
      const port = str.match(/Local: {3}http:\/\/127.0.0.1:(\d+)/)
      defer.resolve(Number(port[1]))
    }
  })

  return defer.promise
}
