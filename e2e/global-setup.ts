import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default function () {
  const authFile = path.join(__dirname, '.auth/user.json')
  fs.rmSync(authFile, { force: true })
}
