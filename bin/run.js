#!/usr/bin/env node
import { argv } from 'process'
import updateNotifier from 'update-notifier'

import { createEveryCommand } from '../dist/commands/index.js'
import { exit, getPackageJson } from '../dist/utils.js'

// 12 hours
const UPDATE_CHECK_INTERVAL = 432e5
const pkg = await getPackageJson()

try {
  updateNotifier({
    pkg,
    updateCheckInterval: UPDATE_CHECK_INTERVAL,
  }).notify()
} catch (error) {
  console.error(error)
}

const program = createEveryCommand()

try {
  await program.parseAsync(argv)
  // exit()
} catch (error) {
  console.error(error)
  exit()
}