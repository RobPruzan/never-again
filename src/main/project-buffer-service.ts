import { execFile as _execFile, spawn as _spawn, exec as _exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { browserController } from './browser-controller'
import { browserViews } from '.'
import { DevRelayService } from './dev-relay-service'
import { RunningProject } from '../shared/types'

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

    this.bufferRoot = join(root, 'project-buffer')

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

      await exec(`kill -9 ${b.pid}`).catch(() => {})
      // await exec(`rm -rf ${b.dir}`)
    })
    await Promise.all(promises)
    await exec(`rm -rf ${this.dotDirRoot}`).catch((e) => {
      console.log('failed to rm rf', e)
    }) // be very careful u don't accidentally rm rf someones home dir
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

  async seed(
    count: number,
    opts: {
      devRelayService: DevRelayService
    }
  ): Promise<BufferedMeta[]> {
    // i mean should be parallel but fine
    const metas: BufferedMeta[] = []
    for (let i = 0; i < count; i++) {
      const meta = await this.createBufferedProject({ ...opts, isSeeding: true })
      if (meta) {
        const url = `http://localhost:${meta.port}`
        const tabId = deriveRunningProjectId({
          runningKind: 'listening',
          cwd: meta.dir,
          kind: 'unknown', // idc
          pid: meta.pid,
          port: meta.port,
        })
        await browserController.createTab({
          tabId,
          url
        })

        metas.push(meta)
      }
    }

    return metas
  }
  // need to test miss case
  async create(opts: {
    port?: number
    startDev?: (arg: { port: number; cwd: string }) => Promise<{ pid: number }>
    devRelayService: DevRelayService
  }) {
    // fine
    if (this.listBuffer().length === 0) {
      const meta = await this.createMiss(opts)

      if (!meta) {
        throw new Error("tood validate this earlier, but this shouldn't happen")
      }

      const tabId = deriveRunningProjectId({
        runningKind: 'listening',
        cwd: meta.dir,
        kind: 'unknown', // idc
        pid: meta.pid,
        port: meta.port,
      })
      await browserController.createTab({
        tabId,
        url: meta.url
      })
      this.seed(1, opts)
      return meta
    }
    const meta = this.instantCreate()

    this.seed(1, opts)
    return meta
  }

  instantCreate() {
    // not great but fine
    const meta = this.shiftIndex()
    if (!meta) return null
    return meta
  }

  async createMiss(
    // port?: number
    opts: {
      port?: number
      startDev?: (arg: { port: number; cwd: string }) => Promise<{ pid: number }>
      targetDir?: string
      devRelayService: DevRelayService
    }
  ): Promise<{
    url: string
    copyMs: number
    startMs: number
    dir: string
    port: number
    pid: number
  } | null> {
    const dest = opts?.targetDir
      ? resolve(opts.targetDir)
      : join(this.projectsRoot, `proj-${Date.now()}`) // thats concerning
    const copy = await this.cpCOW(this.templateRoot, dest)
    if (!copy.ok) return null
    const started = await this.startDev(dest, opts)
    if (!started.port) return null
    return {
      url: `http://localhost:${started.port}`,
      copyMs: copy.ms,
      startMs: started.startedAt!, // daijobu
      dir: dest,
      port: started.port,
      pid: started.pid! // whatever fix later izza fine
    }
  }

  /**
   *
   * yeah actually you don't want to move and block on that because you pay the copy cost
   *
   * you could move ahead of time, then you're doing that for every seeded item. It may be fine to make that
   * hetergenous
   *
   * the known downside here is that the project is in this weird directory and around a bunch
   * of other projects that aren't claimed and the user shouldn't know about
   *
   * i don't think copying async works, that would absolutely break some things
   *
   * so maybe just the option to copy over somewhere? Ehhhhhhhhhhhhhhh
   *
   * maybe a specified dir, plus renaming on the fly? i think renaming is totally fine, hm
   *
   *
   * and this isn't even a problem mv is just updating metadata
   *
   * right but you have the issue of moving the project while its up, which is a genuine problem
   *
   * okay maybe heterogenous is fine? like maybe you have realisticly a few items in the buffer, and you have dozens of projects and you don't really care
   * okay yeah we stick with this unless its a really a problem which i don't suspect it will be
   *
   *
   *
   */
  // async assign(targetDir?: string, _port?: number): Promise<string | null> {
  //   const dest = targetDir ? resolve(targetDir) : join(this.projectsRoot, `proj-${Date.now()}`)
  //   const meta = this.shiftIndex()
  //   if (meta) {
  //     const moved = await this.moveDir(meta.dir, dest)
  //     if (moved) return `http://localhost:${meta.port}`
  //   }
  //   const fallback = await this.createBufferedProject()
  //   if (!fallback) return null
  //   const moved = await this.moveDir(fallback.dir, dest)
  //   if (!moved) return null
  //   return `http://localhost:${fallback.port}`
  // }

  listBuffer(): BufferedMeta[] {
    return this.readIndex()
  }

  async ensureBufferStarted({ devRelayService }: { devRelayService: DevRelayService }) {
    const buffer = this.listBuffer()

    const promises = buffer.map((b) => {
      return this.httpOk(`http://127.0.0.1:${b.port}/@vite/client`).then(async (isRunning) => {
        if (!isRunning) {
          const started = await this.startDev(b.dir, {
            port: b.port,
            devRelayService,
            isSeeding: true
          })
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
  async createBufferedProject({
    devRelayService,
    isSeeding
  }: {
    devRelayService: DevRelayService
    isSeeding?: boolean
  }): Promise<BufferedMeta | null> {
    const ok = await this.ensureTemplate()
    if (!ok) return null
    const id = String(Date.now())
    const dir = join(this.bufferRoot, this.genName())
    this.ensureDir(dir)
    const copy = await this.cpCOW(this.templateRoot, dir)
    if (!copy.ok) return null
    const started = await this.startDev(dir, { devRelayService, isSeeding })
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
    opts: {
      port?: number
      devRelayService: DevRelayService
      isSeeding?: boolean
    }
  ): Promise<{ pid: number | null; port: number | null; ms: number; startedAt: number | null }> {
    const chosen =
      opts?.port && Number.isFinite(opts?.port)
        ? opts.port
        : await this.pickPortFromRange(this.basePort, this.portRangeEnd)
    if (!chosen) return { pid: null, port: null, ms: 0, startedAt: null }
    const t0 = Date.now()

    const child = await opts.devRelayService.start(dir, { port: chosen, isSeeding: opts.isSeeding })
    // const child = await (async () => {
    //   if (opts?.startDev) {
    //     const child = await opts.startDev({ port: chosen, cwd: dir })
    //     return child
    //   }

    //   const devArgs = ['run', 'dev', '--port', String(chosen)]
    //   const child = _spawn('pnpm', devArgs, {
    //     cwd: dir,
    //     stdio: ['ignore', 'pipe', 'pipe'],
    //     detached: false
    //   })
    //   if (child.stdout) {
    //     child.stdout.on('data', (data) => {
    //       console.log(`[dev stdout ${chosen}]`, data.toString())
    //     })
    //   }
    //   if (child.stderr) {
    //     child.stderr.on('data', (data) => {
    //       console.error(`[dev stderr ${chosen}]`, data.toString())
    //     })
    //   }
    //   return child
    // })()

    await this.waitForReady(chosen, 1500)
    // okay do we need to create/load tab here?
    // todo: do we need the double i don't think so this is probably not needed

    const startedAt = Date.now()
    const tabId = deriveRunningProjectId({
      runningKind: 'listening',
      cwd: dir,
      kind: 'unknown', // idc
      pid: child.pid,
      port: chosen,
    })
    browserController.createTab({ tabId, url: `http://localhost:${chosen}` })

    return { pid: child.pid ?? null, port: chosen, ms: Date.now() - t0, startedAt }
  }

  private async waitForReady(port: number, timeoutMs: number): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const ok = await this.httpOk(`http://127.0.0.1:${port}/@vite/client`)
      // console.log('is it okay like wut', ok)

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
    throw new Error('invariant')
  }
}

export const deriveRunningProjectId = (project: RunningProject) => {
  switch (project.runningKind) {
    case 'listening': {
      return `${project.cwd}-${project.port}`
    }
    case 'starting': {
      return `starting-${project.cwd}`
    }
  }
}
