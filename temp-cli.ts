import { connect } from 'node:net'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const cwd = process.cwd()
const sockPath = join(cwd, '.devrelay.sock')

if (!existsSync(sockPath)) {
  console.error(`[dev-relay] Socket not found at ${sockPath}. Is the dev server running?`)
  process.exit(1)
}

const client = connect(sockPath)
client.setEncoding('utf8')

client.on('connect', () => {
  console.log(`[dev-relay] Connected to ${sockPath}`)
  if (process.argv.includes('--kill')) {
    try {
      client.write('KILL\n')
      console.log('[dev-relay] Sent KILL signal')
    } catch (e) {}
  }
})

client.on('data', (data: string) => {
  try {
    process.stdout.write(data)
  } catch {}
})

client.on('error', (err) => {
  console.error(`[dev-relay] Error: ${err?.message || String(err)}`)
  process.exit(1)
})

client.on('close', () => {
  console.log('\n[dev-relay] Connection closed')
  process.exit(0)
})

process.on('SIGINT', () => {
  try {
    client.end()
  } catch {}
  process.exit(0)
})
