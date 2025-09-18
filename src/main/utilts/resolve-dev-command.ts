import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'

export type ResolvedDevCommand =
  | { kind: 'bin'; cmd: string; args: string[] }
  | { kind: 'fallback'; cmd: string; args: string[] }

const binPath = (cwd: string, bin: string) => join(cwd, 'node_modules', '.bin', bin)

const tokenize = (str: string): string[] => str.trim().split(/\s+/).filter(Boolean)

const resolveProgramFromScript = (
  cwd: string,
  devScript: string,
  scripts: Record<string, string> | undefined
): { cmd: string | null; args: string[] } => {
  if (!devScript) return { cmd: null, args: [] }
  let tokens = tokenize(devScript)
  if (tokens.length === 0) return { cmd: null, args: [] }

  const wrappers = new Set(['pnpm', 'npm', 'yarn', 'npx'])
  let i = 0

  if (wrappers.has(tokens[i])) {
    const isRun = tokens[i + 1] === 'run'
    const scriptName = tokens[i + 2]
    if (isRun && scriptName && scripts && typeof scripts[scriptName] === 'string') {
      tokens = tokenize(scripts[scriptName]!)
      i = 0
    } else if (tokens[i] === 'npx') {
      i++
    } else {
      return { cmd: null, args: [] }
    }
  }

  if (i >= tokens.length) return { cmd: null, args: [] }
  const prog = tokens[i]
  const args = tokens.slice(i + 1)

  if (isAbsolute(prog) || prog.includes('/')) {
    const full = isAbsolute(prog) ? prog : join(cwd, prog)
    return existsSync(full) ? { cmd: full, args } : { cmd: null, args: [] }
  }

  const local = binPath(cwd, prog)
  if (existsSync(local)) return { cmd: local, args }
  return { cmd: null, args: [] }
}

export const resolveDevCommand = async (
  cwd: string,
  _port?: number
): Promise<ResolvedDevCommand> => {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) return { kind: 'fallback', cmd: 'pnpm', args: ['run', 'dev'] }
  const raw = await readFile(pkgPath, 'utf8')
  const pkg = JSON.parse(raw) as { scripts?: Record<string, string> }
  const dev = pkg.scripts?.dev ?? ''

  const resolved = resolveProgramFromScript(cwd, dev, pkg.scripts)
  console.log('RESOLVED COMMAND', resolved.cmd);
  
  if (resolved.cmd) return { kind: 'bin', cmd: resolved.cmd, args: resolved.args }
  return { kind: 'fallback', cmd: 'pnpm', args: ['run', 'dev'] }
}
