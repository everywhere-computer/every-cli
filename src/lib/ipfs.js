import path from 'path'
import fs from 'fs/promises'
import { $, execa } from 'execa'
import { create } from 'kubo-rpc-client'

import { __dirname } from '../../cli.js'

/**
 * Start up the IPFS node
 *
 * @param {number} ipfsPort
 */
export async function startIPFS(ipfsPort) {
  // Kill any existing IPFS processes so config changes can be applied
  try {
    if (process.platform === 'win32') {
      await $`taskkill /IM ipfs.exe /F`
    } else {
      await $`killall ipfs -9`
    }
  } catch {}

  // Set IPFS port in IPFS config
  const configArgs = [
    'config',
    'Addresses.API',
    `/ip4/127.0.0.1/tcp/${ipfsPort}`,
  ]

  try {
    // Apply config changes(this will fail if ipfs init has not been run on the machine before)
    await $`${__dirname}/node_modules/.bin/ipfs ${configArgs}`
  } catch {
    // Run ipfs init before applying config changes if necessary
    await $`${__dirname}/node_modules/.bin/ipfs init`

    // Apply config changes
    await $`${__dirname}/node_modules/.bin/ipfs ${configArgs}`
  }

  // Start IPFS daemon
  execa(`${__dirname}/node_modules/.bin/ipfs`, ['daemon'])
}

/**
 * Add file to IPFS
 *
 * @param {string} filePath - path to file ie. '/small.png'
 * @param {number} ipfsPort
 */
export async function addFSFileToIPFS(filePath, ipfsPort) {
  return new Promise(async (resolve) => {
    const ipfsUrl = `http://127.0.0.1:${ipfsPort}/api/v0`
    const ipfs = create({
      port: ipfsPort,
      url: ipfsUrl,
    })
    /** @type {boolean} */
    let ipfsConnected = false
    const pingIpfs = async () => {
      try {
        ipfsConnected = !!(
          await (await fetch(`${ipfsUrl}/id`, { method: 'POST' }))?.json()
        )?.ID
      } catch {}
    }

    await pingIpfs()

    // Poll until IPFS is connected
    const interval = setInterval(async () => {
      await pingIpfs()

      if (ipfsConnected) {
        const { cid } = await ipfs.add(
          {
            content: await fs.readFile(
              path.relative(process.cwd(), path.resolve(filePath))
            ),
          },
          {
            cidVersion: 1,
          }
        )

        clearInterval(interval)

        return resolve(cid)
      }
    }, 100)
  })
}
