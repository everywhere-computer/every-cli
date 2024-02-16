import fs from 'fs'

const makeDir = async (
  root,
  options = { recursive: true }
) => {
  try {
    await fs.promises.stat(root)
  } catch (error) {
    // @ts-ignore-next-line
    if (error.code === "ENOENT") {
      try {
        await fs.promises.mkdir(root, options)
      } catch (err) {
        // @ts-ignore-next-line
        console.error(err.message)
      }
    }
  }  
}

export default makeDir
