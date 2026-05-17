import { cp, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appNextDir = resolve(rootDir, 'apps/next/.next')
const rootNextDir = resolve(rootDir, '.next')

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

await run('npm', ['run', 'build', '--workspace', '@ns-scrap-erp/next'])
await rm(rootNextDir, { force: true, recursive: true })
await cp(appNextDir, rootNextDir, { recursive: true })
