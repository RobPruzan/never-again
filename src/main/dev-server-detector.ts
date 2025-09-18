import { execFile as _execFile } from 'node:child_process'
import { realpathSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, sep, join } from 'node:path'
import { promisify } from 'node:util'
import { DevServerKind } from '../shared/types'

const execFile = promisify(_execFile)

const normalizePath = (p: string) => {
  if (!p) return ''
  try {
    return realpathSync(p)
  } catch {
    return resolve(p)
  }
}

const isSubpath = (childPath: string, parentPath: string) => {
  if (!childPath || !parentPath) return false
  const child = normalizePath(childPath)
  const parent = normalizePath(parentPath)
  if (child === parent) return true
  const suffixed = parent.endsWith(sep) ? parent : parent + sep
  return child.startsWith(suffixed)
}

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res
  } catch {
    return null
  } finally {
    clearTimeout(id)
  }
}

export const detectDevServerKind = async (
  port: number,
  timeoutMs = 300
): Promise<DevServerKind> => {
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return 'unknown'
  const base = `http://127.0.0.1:${port}`
  const vite = (async () => {
    const res = await fetchWithTimeout(`${base}/@vite/client`, timeoutMs)
    if (!res || res.status !== 200) return null
    const txt = await res.text().catch(() => '')
    return txt.includes('import.meta.hot') || txt.includes('vite:client')
      ? ('vite' as DevServerKind)
      : null
  })()
  const wds = (async () => {
    const res = await fetchWithTimeout(`${base}/webpack-dev-server`, timeoutMs)
    if (!res || res.status !== 200) return null
    const txt = await res.text().catch(() => '')
    return /webpack(-| )dev(-| )server/i.test(txt) || /Hot Module Replacement/i.test(txt)
      ? ('webpack-dev-server' as DevServerKind)
      : null
  })()
  const next = (async () => {
    const resHmr = await fetchWithTimeout(`${base}/_next/webpack-hmr`, timeoutMs)
    if (resHmr && [200, 404].includes(resHmr.status)) {
      const powered = resHmr.headers.get('x-powered-by')
      if (powered && /next\.js/i.test(powered)) return 'next' as DevServerKind
    }
    const resRoot = await fetchWithTimeout(base, timeoutMs)
    if (resRoot && resRoot.ok) {
      const powered = resRoot.headers.get('x-powered-by')
      const txt = await resRoot.text().catch(() => '')
      if ((powered && /next\.js/i.test(powered)) || /id=\"__next\"/.test(txt))
        return 'next' as DevServerKind
      if (txt.includes('/@vite/client')) return 'vite' as DevServerKind
    }
    return null
  })()
  const settled = await Promise.allSettled([vite, next, wds])
  const values = settled
    .filter((s): s is PromiseFulfilledResult<DevServerKind | null> => s.status === 'fulfilled')
    .map((s) => s.value)
    .filter((v): v is DevServerKind => v != null)
  if (values.includes('vite')) return 'vite'
  if (values.includes('next')) return 'next'
  if (values.includes('webpack-dev-server')) return 'webpack-dev-server'
  return 'unknown'
}

const getListeningProcesses = async () => {
  const { stdout } = await execFile('lsof', ['-n', '-P', '-iTCP', '-sTCP:LISTEN', '-F', 'pcPn'])
  const entries = new Map<
    number,
    { pid: number; command: string; ports: Set<number>; addresses: string[] }
  >()
  let currentPid: number | null = null
  const lines = stdout.split(/\r?\n/)
  for (const raw of lines) {
    if (!raw) continue
    const tag = raw[0]
    const value = raw.slice(1)
    if (tag === 'p') {
      currentPid = Number.parseInt(value, 10)
      if (!Number.isFinite(currentPid)) continue
      if (!entries.has(currentPid))
        entries.set(currentPid, {
          pid: currentPid,
          command: '',
          ports: new Set<number>(),
          addresses: []
        })
      continue
    }
    if (currentPid == null) continue
    const entry = entries.get(currentPid)!
    if (tag === 'c') entry.command = value
    if (tag === 'n') {
      entry.addresses.push(value)
      const matches = Array.from(value.matchAll(/:(\d+)/g))
      if (matches.length === 0) continue
      const last = matches[matches.length - 1][1]
      const portNum = Number.parseInt(last, 10)
      if (Number.isFinite(portNum) && portNum > 0 && portNum <= 65535) entry.ports.add(portNum)
    }
  }
  return entries
}

const getCwdsForPids = async (pids: number[], chunkSize = 64) => {
  const result = new Map<number, string>()
  if (!pids.length) return result
  for (let i = 0; i < pids.length; i += chunkSize) {
    const chunk = pids.slice(i, i + chunkSize)
    const { stdout } = await execFile('lsof', [
      '-a',
      '-p',
      chunk.join(','),
      '-d',
      'cwd',
      '-Fn'
    ]).catch(() => ({ stdout: '' }))
    let currentPid: number | null = null
    const lines = stdout.split(/\r?\n/)
    for (const raw of lines) {
      if (!raw) continue
      const tag = raw[0]
      const value = raw.slice(1)
      if (tag === 'p') {
        currentPid = Number.parseInt(value, 10)
        continue
      }
      if (tag === 'n' && currentPid != null) {
        const p = value.trim()
        if (p) result.set(currentPid, normalizePath(p))
      }
    }
  }
  return result
}

export const detectDevServersForDir = async (
  dir: string,
  opts?: { http?: boolean; timeoutMs?: number }
): Promise<
  Array<{
    port: number
    pid: number
    cwd: string
    command: string
    kind: DevServerKind
  }>
> => {
  if (!dir) return []
  const projectDir = normalizePath(dir)
  if (!existsSync(projectDir)) return []
  if (process.platform === 'win32') return []
  const processes = await getListeningProcesses().catch(() => new Map())
  if (!processes.size) return []
  const pairs: Array<{ pid: number; command: string; ports: number[] }> = []
  for (const entry of processes.values()) {
    const ports: Array<number> = Array.from(entry.ports)
    if (!ports.length) continue
    pairs.push({ pid: entry.pid, command: entry.command, ports })
  }
  if (!pairs.length) return []
  const pidList = pairs.map((p) => p.pid)
  const cwdMap = await getCwdsForPids(pidList)
  const http = opts?.http !== false
  const timeoutMs =
    Number.isFinite(opts?.timeoutMs as number) && (opts?.timeoutMs as number) > 0
      ? (opts?.timeoutMs as number)
      : 300
  const results: Array<{
    port: number
    pid: number
    cwd: string
    command: string
    kind: DevServerKind
  }> = []

  const mapPidToStarter = async (listeningPid: number, procCwd: string) => {
    const metaPath = join(procCwd, '.devrelay.json')
    if (!existsSync(metaPath)) return listeningPid
    const raw = await readFile(metaPath, 'utf8').catch(() => '')
    if (!raw) return listeningPid
    let starter: number | null = null
    try {
      const parsed = JSON.parse(raw) as { pid?: number }
      starter = typeof parsed.pid === 'number' ? parsed.pid : null
    } catch {
      starter = null
    }
    return starter ?? listeningPid
  }
  for (const { pid, command, ports } of pairs) {
    const cwd = cwdMap.get(pid) ?? ''
    if (!cwd || !isSubpath(cwd, projectDir)) continue
    const reportedPid = await mapPidToStarter(pid, cwd)
    const probes = ports.map(async (port) => {
      const kind = http
        ? await detectDevServerKind(port, timeoutMs).catch(() => 'unknown' as DevServerKind)
        : ('unknown' as DevServerKind)
      results.push({ port, pid: reportedPid, cwd, command, kind })
    })
    await Promise.all(probes)
  }
  results.sort((a, b) => a.port - b.port)
  return results
}

export const isDevServerRunning = async (
  dir: string,
  opts?: { http?: boolean; timeoutMs?: number }
) => {
  const results = await detectDevServersForDir(dir, opts)
  return results.length > 0
}
