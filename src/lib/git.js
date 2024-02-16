import { execSync } from 'child_process'
import { rimraf } from 'rimraf'
import got from 'got'
import tar from 'tar'
import { Stream } from 'stream'
import { promisify } from 'util'
import { join } from 'path'
import { tmpdir } from 'os'
import { createWriteStream, promises as fs } from 'fs'

const isInGitRepository = () => {
  try {
    execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" })
    return true
  } catch (_) {}
  return false
}

const isInMercurialRepository = () => {
  try {
    execSync("hg --cwd . root", { stdio: "ignore" })
    return true
  } catch (_) {}
  return false
}

export const tryGitInit = (root) => {
  let didInit = false
  try {
    execSync("git --version", { stdio: "ignore" })
    if (isInGitRepository() || isInMercurialRepository()) {
      return false
    }

    execSync("git init", { stdio: "ignore" })
    didInit = true

    execSync("git checkout -b main", { stdio: "ignore" })

    execSync("git add -A", { stdio: "ignore" })
    execSync('git commit -m "Initial commit from Create ODD App"', {
      stdio: "ignore",
    })
    return true
  } catch (e) {
    if (didInit) {
      try {
        rimraf.sync(join(root, ".git"))
      } catch (_) {}
    }
    return false
  }
}

const pipeline = promisify(Stream.pipeline)

// export type RepoInfo = {
//   username: string
//   name: string
//   branch: string
//   filePath: string
// }

export const isUrlOk = async (url) => {
  const res = await got.head(url).catch((e) => e)
  return res.statusCode === 200
}

export const getRepoInfo = async (url) => {
  const [, username, name, t, _branch, ...file] = url.pathname.split('/')
  const filePath = file.join('/')

  if (
    t === undefined ||
    (t === '' && _branch === undefined)
  ) {
    const infoResponse = await got(
      `https://api.github.com/repos/${username}/${name}`,
    ).catch((e) => e)
    if (infoResponse.statusCode !== 200) {
      return
    }
    const info = JSON.parse(infoResponse.body)
    return { username, name, branch: info['default_branch'], filePath }
  }

  const branch = _branch

  if (username && name && branch && t === 'tree') {
    return { username, name, branch, filePath }
  }
}

export const hasRepo = ({
  username,
  name,
  branch,
  filePath,
}) => {
  const contentsUrl = `https://api.github.com/repos/${username}/${name}/contents`
  const packagePath = `${filePath ? `/${filePath}` : ''}/package.json`

  return isUrlOk(contentsUrl + packagePath + `?ref=${branch}`)
}

export const existsInRepo = (nameOrUrl) => {
  try {
    const url = new URL(nameOrUrl)
    return isUrlOk(url.href)
  } catch {
    return isUrlOk(nameOrUrl)
  }
}

const downloadTar = async (url) => {
  const tempFile = join(tmpdir(), `cwa.temp-${Date.now()}`)
  await pipeline(got.stream(url), createWriteStream(tempFile))
  return tempFile
}

export const downloadAndExtractRepo = async (
  root,
  { username, name },
  branch = 'main'
) => {
  const tempFile = await downloadTar(
    `https://codeload.github.com/${username}/${name}/tar.gz/${branch}`,
  )

  console.log('tempFile', tempFile)

  await tar.x({
    file: tempFile,
    cwd: root,
    strip: 1,
    filter: (p) => p.startsWith(name),
  })

  await fs.unlink(tempFile)
}
