import fs from 'fs'

const isWriteable = async (directory) => {
  try {
    await fs.promises.access(directory, (fs.constants || fs).W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

export default isWriteable
