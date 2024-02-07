import bodyParser from 'body-parser'
import chalk from 'chalk'
import express from 'express'

import { log } from './utils.js'

export const PORT = 4337

const app = express()

const jsonParser = bodyParser.json()

/**
 * Start Express API Gateway
 */
export const startGateway = () => {
  log('⚙️ Setting up local development server')

  // Start dev server
  const server = app.listen(PORT, () =>
    console.log(`The server is listening on port ${chalk.green(PORT)}`)
  )

  process.on('SIGINT', () => {
    server.close(() => {
      console.log(chalk.blueBright('Shutting down server'))
      process.exit()
    })
  })
}

/**
 * Post workflow to Homestar node
 */
app.post('/start-workflow', jsonParser, (req, res) => {
  const { workflow } = req.body

  res.send(workflow)  
})

export default app