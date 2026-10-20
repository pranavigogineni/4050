// Browser tests should exercise the production frontend while using test-only
// backend email capture and disposable schemas.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const root = dirname(fileURLToPath(import.meta.url))
let child
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child?.kill(signal))
function run(file, args, env) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [file, ...args], { cwd: root, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Test server process exited: ${code ?? signal}`)))
  })
}
try {
  await run(join(root, 'node_modules/vite/bin/vite.js'), ['build'], { ...process.env, NODE_ENV: 'production' })
  await run(join(root, '../backend/db/isolated-schema.js'), ['serve', 'test_browser'], { ...process.env, NODE_ENV: 'test' })
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
