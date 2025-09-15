import { execFile as _execFile, spawn as _spawn, exec as _exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { browserController } from './browser-controller'

const execFile = promisify(_execFile)

const exec = promisify(_exec)
type BufferedMeta = { id: string; dir: string; pid: number; port: number; createdAt: number }

// this is truly an awful name that makes 0 sense to any reasonable person reading this

// enumerate, list, explore

export class ProjectBufferService {
  private bufferRoot: string
  private projectsRoot: string
  private templateRoot: string
  private indexFile: string
  private basePort: number
  private portRangeEnd: number
  private dotDirRoot: string

  constructor(opts?: {
    rootDir?: string // okay
    projectsDir?: string // okay, where would we prefer this is?
    templateDir?: string // okay, need to handle built case
    basePort?: number // what does this mean
    portRangeEnd?: number // ah i see start and end port, i don't like calling that base port
  }) {
    const root = opts?.rootDir
      ? resolve(opts.rootDir)
      : resolve(process.env.HOME || '.', '.zenbu-buffer')
    this.dotDirRoot = root
    console.log('brotha', this.dotDirRoot)

    this.bufferRoot = join(root, 'project-buffer')
    console.log('what is buffer root', this.bufferRoot)

    this.projectsRoot = opts?.projectsDir ? resolve(opts.projectsDir) : join(root, 'projects')
    this.templateRoot = opts?.templateDir
      ? resolve(opts.templateDir)
      : join(__dirname, '../../resources/template-vite-react-tailwind')
    this.indexFile = join(this.bufferRoot, 'buffer-index.json') // hm what is this index file, buffer root is..., okay its really gonna be home dir in zenbu buffer, but whats in here, i assume metadata for the buffer which is fine
    /**
   * ───────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       │ File: buffer-index.json
───────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   1   │ [
   2   │   {
   3   │     "id": "1757701054430",
   4   │     "dir": "/Users/robby/.zenbu-buffer/project-buffer/inst-1757701054430",
   5   │     "pid": 35074,
   6   │     "port": 5179,
   7   │     "createdAt": 1757701056999
   8   │   }
   9   │ ]
   */
    this.basePort = opts?.basePort ?? 5173 // fine
    this.portRangeEnd = opts?.portRangeEnd ?? 5300 // may want to raise this
    this.ensureDir(this.bufferRoot) // okay
    this.ensureDir(this.projectsRoot) // okay
  }
  async kill() {
    const buffer = this.listBuffer()
    const promises = buffer.map(async (b) => {
      // this may not be sound, almost certainly isn't with the project buffer, maybe we just kill the zenbu buffer entirely and we start fresh?
      await exec(`kill -9 ${b.pid}`)
      // await exec(`rm -rf ${b.dir}`)
    })
    await exec(`rm -rf ${this.dotDirRoot}`) // be very careful u don't accidentally rm rf someones home dir
    await Promise.all(promises)
  }

  async ensureTemplate(): Promise<boolean> {
    if (existsSync(join(this.templateRoot, 'package.json'))) return true
    const parent = resolve(this.templateRoot, '..')
    this.ensureDir(parent)
    const name = basename(this.templateRoot)
    const created = await this.execOk(
      'pnpm',
      ['create', 'vite@latest', name, '--template', 'react-ts'], // need this to be more general over the template, but fine for now
      { cwd: parent }
    )
    if (!created) return false
    const installed = await this.execOk('pnpm', ['install'], { cwd: this.templateRoot }) // should be bun really but if we copy on write its fine and doing a miss basically never happens, good to know when something is fucked up i think
    if (!installed) return false
    // lol we can just set this up ahead of time what is it doing
    // await this.execOk('pnpm', ['add', '-D', 'tailwindcss', 'postcss', 'autoprefixer'], { // wait what there is no way this is needed
    //   cwd: this.templateRoot
    // })
    // await this.execOk('pnpx', ['--yes', 'tailwindcss', 'init', '-p'], { cwd: this.templateRoot })
    return true
  }

  async seed(count: number): Promise<BufferedMeta[]> {
    // i mean should be parallel but fine
    const metas: BufferedMeta[] = []
    for (let i = 0; i < count; i++) {
      const meta = await this.createBufferedProject()
      if (meta) {
        const url = `http://localhost:${meta.port}`
        const tabId = meta.dir
        await browserController.createTab({
          tabId,
          url
        })
        await browserController.loadUrl({ tabId, url })
        metas.push(meta)
      }
    }
    return metas
  }
  // need to test miss case
  async create() {
    // fine
    if (this.listBuffer().length === 0) {
      const meta = await this.createMiss()

      if (!meta) {
        throw new Error("tood validate this earlier, but this shouldn't happen")
      }

      await browserController.createTab({
        tabId: meta.dir,
        url: meta.url
      })
      await browserController.loadUrl({ tabId: meta.dir, url: meta.url })
      this.seed(1)
      return meta
    }
    const meta = this.instantCreate()

    this.seed(1)
    return meta
  }

  instantCreate() {
    // not great but fine
    const meta = this.shiftIndex()
    if (!meta) return null
    return meta
  }

  async createMiss(
    targetDir?: string,
    port?: number
  ): Promise<{ url: string; copyMs: number; startMs: number; dir: string } | null> {
    const dest = targetDir ? resolve(targetDir) : join(this.projectsRoot, `proj-${Date.now()}`) // thats concerning
    const copy = await this.cpCOW(this.templateRoot, dest)
    if (!copy.ok) return null
    const started = await this.startDev(dest, port)
    if (!started.port) return null
    return {
      url: `http://localhost:${started.port}`,
      copyMs: copy.ms,
      startMs: started.ms,
      dir: dest
    }
  }

  async assign(targetDir?: string, _port?: number): Promise<string | null> {
    const dest = targetDir ? resolve(targetDir) : join(this.projectsRoot, `proj-${Date.now()}`)
    const meta = this.shiftIndex()
    if (meta) {
      const moved = await this.moveDir(meta.dir, dest)
      if (moved) return `http://localhost:${meta.port}`
    }
    const fallback = await this.createBufferedProject()
    if (!fallback) return null
    const moved = await this.moveDir(fallback.dir, dest)
    if (!moved) return null
    return `http://localhost:${fallback.port}`
  }

  listBuffer(): BufferedMeta[] {
    return this.readIndex()
  }

  async ensureBufferStarted() {
    const buffer = this.listBuffer()

    const promises = buffer.map((b) => {
      return this.httpOk(`http://127.0.0.1:${b.port}/@vite/client`).then(async (isRunning) => {
        if (!isRunning) {
          const started = await this.startDev(b.dir, b.port)
          if (started.pid) {
            b.pid = started.pid
          }
        }
      })
    })
    await Promise.all(promises)
  }

  genName() {
    const adjectives = [
      'happy',
      'brave',
      'silly',
      'clever',
      'fuzzy',
      'swift',
      'lucky',
      'quiet',
      'lively',
      'shiny',
      'gentle',
      'bold',
      'jolly',
      'sunny',
      'witty',
      'zesty',
      'breezy',
      'snappy',
      'quirky',
      'mellow'
    ]
    const animals = [
      'puppy',
      'kitten',
      'bunny',
      'fox',
      'panda',
      'otter',
      'tiger',
      'lion',
      'bear',
      'wolf',
      'owl',
      'eagle',
      'shark',
      'whale',
      'dolphin',
      'moose',
      'goose',
      'duck',
      'crab',
      'frog'
    ]
    function pick(arr: string[]) {
      return arr[Math.floor(Math.random() * arr.length)]
    }
    const num = Math.floor(Math.random() * 900) + 100
    return `${pick(adjectives)}-${pick(animals)}-${num}`
  }
  async createBufferedProject(): Promise<BufferedMeta | null> {
    const ok = await this.ensureTemplate()
    if (!ok) return null
    const id = String(Date.now())
    const dir = join(this.bufferRoot, this.genName())
    this.ensureDir(dir)
    const copy = await this.cpCOW(this.templateRoot, dir)
    if (!copy.ok) return null
    const started = await this.startDev(dir)
    if (!started.port || !started.pid) return null
    const meta: BufferedMeta = {
      id,
      dir,
      pid: started.pid,
      port: started.port,
      createdAt: Date.now()
    }
    try {
      writeFileSync(join(dir, '.buffer-meta.json'), JSON.stringify(meta), 'utf8')
    } catch {}
    const idx = this.readIndex()
    idx.push(meta)
    this.writeIndex(idx)
    return meta
  }

  // internals
  private ensureDir(p: string) {
    if (!existsSync(p)) mkdirSync(p, { recursive: true })
  }

  private async execOk(file: string, args: string[], opts?: { cwd?: string }): Promise<boolean> {
    try {
      await execFile(file, args, { cwd: opts?.cwd })
      return true
    } catch {
      return false
    }
  }

  private async cpCOW(
    src: string,
    dest: string
  ): Promise<{ ok: boolean; method: 'cp-c' | 'cp-reflink' | 'cp-copy' | 'none'; ms: number }> {
    // im confident some of this is nonsense/not needed but seems to work
    // todo: yoink buns logic
    const t0 = Date.now()
    this.ensureDir(dest)
    const s = resolve(src)
    const d = resolve(dest)
    const r1 = await this.execOk('/bin/cp', ['-Rc', s + '/.', d])
    if (r1) return { ok: true, method: 'cp-c', ms: Date.now() - t0 }
    const r2 = await this.execOk('/bin/cp', ['-R', '--reflink', s + '/.', d])
    if (r2) return { ok: true, method: 'cp-reflink', ms: Date.now() - t0 }
    const r3 = await this.execOk('/bin/cp', ['-R', s + '/.', d])
    if (r3) return { ok: true, method: 'cp-copy', ms: Date.now() - t0 }
    return { ok: false, method: 'none', ms: Date.now() - t0 }
  }

  private readIndex(): BufferedMeta[] {
    try {
      const txt = readFileSync(this.indexPath(), 'utf8')
      const arr = JSON.parse(txt)
      if (Array.isArray(arr)) return arr as BufferedMeta[]
      return []
    } catch {
      return []
    }
  }

  private writeIndex(arr: BufferedMeta[]) {
    try {
      this.ensureDir(this.bufferRoot)
      writeFileSync(this.indexPath(), JSON.stringify(arr, null, 2), 'utf8')
    } catch {}
  }

  private shiftIndex(): BufferedMeta | null {
    const arr = this.readIndex()
    if (arr.length === 0) return null
    const first = arr.shift()!
    this.writeIndex(arr)
    return first
  }

  private indexPath() {
    return this.indexFile
  }

  private async startDev(
    dir: string,
    port?: number
  ): Promise<{ pid: number | null; port: number | null; ms: number }> {
    const chosen =
      port && Number.isFinite(port)
        ? port
        : await this.pickPortFromRange(this.basePort, this.portRangeEnd)
    if (!chosen) return { pid: null, port: null, ms: 0 }
    const t0 = Date.now()
    const child = _spawn('pnpm', ['run', 'dev', '--', '--port', String(chosen), '--strictPort'], {
      // this might work generally now that we are deriving directly from the os and not relying on process tracking or spawned project ports, noice
      cwd: dir,
      stdio: 'ignore',
      detached: false
    })
    await this.waitForReady(chosen, 1500)
    return { pid: child.pid ?? null, port: chosen, ms: Date.now() - t0 }
  }

  private async waitForReady(port: number, timeoutMs: number): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const ok = await this.httpOk(`http://127.0.0.1:${port}/@vite/client`)
      if (ok) return true
      await new Promise((r) => setTimeout(r, 120))
    }
    return false
  }

  async httpOk(url: string): Promise<boolean> {
    // i don't really like this strat i rather just be able to connect but this probably will need to evolve
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 300)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(t)
      return !!res && res.status === 200
    } catch {
      return false
    }
  }

  private async moveDir(src: string, dest: string): Promise<boolean> {
    try {
      await execFile('/bin/mv', [src, dest])
      return true
    } catch {
      const cp = await this.cpCOW(src, dest)
      if (cp.ok) {
        try {
          await execFile('/bin/rm', ['-rf', src]) // kinda scary be careful
        } catch {}
        return true
      }
      return false
    }
  }

  private async listListeningPorts(): Promise<Set<number>> {
    try {
      // okay, seems to be doing something similar to what dev server detector is doing
      const { stdout } = await execFile('lsof', ['-n', '-P', '-iTCP', '-sTCP:LISTEN', '-Fn'])
      const ports = new Set<number>()
      for (const line of stdout.split(/\r?\n/)) {
        if (!line || line[0] !== 'n') continue
        const value = line.slice(1)
        const matches = Array.from(value.matchAll(/:(\d+)/g))
        if (!matches.length) continue
        const last = matches[matches.length - 1][1]
        const n = Number.parseInt(last, 10)
        if (Number.isFinite(n) && n > 0 && n <= 65535) ports.add(n)
      }
      return ports
    } catch {
      return new Set<number>()
    }
  }

  private async pickPortFromRange(start: number, end: number): Promise<number> {
    const used = await this.listListeningPorts()
    for (let p = start; p <= end; p++) {
      if (!used.has(p)) return p
    }
    return 0
  }
}
