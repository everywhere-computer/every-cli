import { unixfs } from '@helia/unixfs'
import { FsBlockstore } from 'blockstore-fs'
import chalk from 'chalk'
import execa from 'execa'
import { createHelia } from 'helia'

import app, { PORT } from '../server.js'
import { log } from '../utils.js'

export const dev = async (options, command) => {
  log('⚙️  Setting up local development server')

  // Start dev server
  const server = app.listen(PORT, () =>
    console.log(`The server is listening on port ${chalk.green(PORT)}`)
  )

  process.on('SIGINT', function () {
    server.close(() => {
      console.log(chalk.blueBright('Shutting down server'))
      process.exit()
    })
  })

  app.get('/', (req, res) => {
    res.send('Hello')
  })

  // Start IPFS
  const blockstore = new FsBlockstore('./block-store')
  const helia = await createHelia({
    blockstore
  })
  const fs = unixfs(helia)
  const cid = await fs.addBytes(new TextEncoder().encode('Hello World 201'))

  console.log('Added file:', cid.toString())

  // Start Homestar
  execa('npm', ['run', 'homestar'], { stdio: 'inherit' })
}

export const createDevCommand = (program) => program
  .command('dev')
  .alias('develop')
  .description(
    `Local dev server\nThe dev command will run a local dev server`,
  )
  .option(
    '-l, --live [subdomain]',
    'start a public live session; optionally, supply a subdomain to generate a custom URL',
    false,
  )
  .action(dev)

