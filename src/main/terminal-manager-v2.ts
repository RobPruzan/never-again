import { BrowserWindow } from 'electron'
import { getRendererHandlers } from '@egoist/tipc/main'
import * as pty from 'node-pty'
import * as os from 'os'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import type { RendererHandlers } from './renderer-handlers'

type DataChunk = { seq: number; data: string }

type TerminalV2Session = {
  id: string
  // what responsibilities do these have/why do they both exist
  pty: pty.IPty
  term: HeadlessTerminal
  // okay
  serializer: SerializeAddon
  title: string
  cwd: string
  projectName: string
  cols: number
  rows: number
  ring: Array<DataChunk>
  seq: number
  // okay
  startCommand: string | null
  // waht
  startSent: boolean
}

/**
 * it would be nice to pre warm terminals and just cd into the right directory :think-dumbass
 *
 * this is actually obviously correct
 *
 * the simple answer is to model it identically to the buffer service
 *
 * i mean it would be even cooler if we could have that be one thing that just
 * starts long running things ahead of time and then dependency injects implementation
 * but i have a feeling they will be different enough that it will just be hard to
 *
 * but we can follow the approach
 *
 * - seed the cache
 * - have a buffer
 * - persist it to disk
 * - start from disk
 *
 * the start command can really just be a cd && claude, which is cool
 *
 * i would like to kill 2 birds with one stone here and make it so i can track the
 * dev server immediately, but maybe that's not feasible to do here
 *
 * lets think for one minute what would take to do that
 *
 * maybe a global map of connections that you're accumulating?
 *
 * actually no its a terminal instance that's preloaded that runs the connect, which
 * should absolutely be available if we are starting it, we can order the events
 * so that's guaranteed
 *
 *
 *
 * so if we have the ability to preload terminals with a start command, why can't
 * we do that here?
 *
 * well this is simple and we built the infra to do this from the start
 *
 * we just have a list of terminals on the client
 *
 * and those can be used to preload/ look up and we have pointers to them
 *
 * then on the server we have a buffer on unallocated termianls that we can assign
 * on request, which we already have implemented and can reference
 *
 * so visually that might be
 *
 */

export class TerminalManagerV2 {
  private sessions = new Map<string, TerminalV2Session>()
  private mainWindow: BrowserWindow | null = null
  // why
  private static instance: TerminalManagerV2 | null = null
  private handlers: ReturnType<typeof getRendererHandlers<RendererHandlers>>

  constructor(handlers: ReturnType<typeof getRendererHandlers<RendererHandlers>>) {
    TerminalManagerV2.instance = this
    this.handlers = handlers
  }

  static getInstance(): TerminalManagerV2 | null {
    return TerminalManagerV2.instance
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  create(
    options?: { cwd?: string; shell?: string; startCommand?: string | string[] },
    terminalId?: string,
    projectName?: string
  ) {
    const startTime = performance.now()
    const timings: Record<string, number> = {}

    const shell =
      options?.shell || (os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash')
    const cwd = options?.cwd || process.env.HOME || process.cwd()
    const id = terminalId || `termv2-${crypto.randomUUID()}`
    const cols = 80
    const rows = 30

    timings.setup = performance.now() - startTime

    const ptyStart = performance.now()
    const shellArgs = os.platform() === 'win32' ? [] : ['-il']
    const p = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM_PROGRAM: 'IDE Terminal',
        PROMPT_COMMAND: 'echo -ne "\x1b]0;${USER}@${HOSTNAME}: ${PWD}\x07"'
      } as { [key: string]: string }
    })
    timings.ptySpawn = performance.now() - ptyStart

    const termStart = performance.now()
    const term = new HeadlessTerminal({
      cols,
      rows,
      allowProposedApi: true,
      scrollback: 10000
    })
    const serializer = new SerializeAddon()
    term.loadAddon(serializer)
    timings.terminalSetup = performance.now() - termStart

    const ring: Array<DataChunk> = []
    const RING_MAX = 1000

    const startCmd = options?.startCommand
      ? Array.isArray(options.startCommand)
        ? options.startCommand.join(' ')
        : options.startCommand
      : null

    const handlersStart = performance.now()
    const onData = (data: string) => {
      term.write(data)
      const session = this.sessions.get(id)
      if (!session) return
      const seq = session.seq + 1
      session.seq = seq
      session.ring.push({ seq, data })
      if (session.ring.length > RING_MAX) session.ring.shift()
      if (startCmd && !session.startSent) {
        try {
          p.write(startCmd + '\r')
          session.startSent = true
        } catch {}
      }
      if (
        this.mainWindow &&
        !this.mainWindow.isDestroyed() &&
        !this.mainWindow.webContents.isDestroyed()
      ) {
        this.handlers.terminalV2Data.send({ id, data, seq })
      }
      const titleMatch = data.match(/\x1b\](?:0|2);([^\x07\x1b]+)(?:\x07|\x1b\\)/)
      if (titleMatch) {
        const newTitle = titleMatch[1]
        const s = this.sessions.get(id)
        if (s && s.title !== newTitle) {
          s.title = newTitle
          if (
            this.mainWindow &&
            !this.mainWindow.isDestroyed() &&
            !this.mainWindow.webContents.isDestroyed()
          ) {
            this.handlers.terminalV2TitleChanged.send({ id, title: newTitle })
          }
        }
      }
    }

    p.onData(onData)

    p.onExit(({ exitCode, signal }) => {
      if (
        this.mainWindow &&
        !this.mainWindow.isDestroyed() &&
        !this.mainWindow.webContents.isDestroyed()
      ) {
        this.handlers.terminalV2Exit.send({ id, exitCode, signal: signal ?? 0 })
      }
      this.sessions.delete(id)
    })
    timings.eventHandlers = performance.now() - handlersStart

    const sessionStart = performance.now()
    const session: TerminalV2Session = {
      id,
      pty: p,
      term,
      serializer,
      title: shell.split('/').pop() || `Terminal ${this.sessions.size + 1}`,
      cwd,
      projectName: projectName || 'default',
      cols,
      rows,
      ring,
      seq: 0,
      startCommand: startCmd,
      startSent: false
    }

    this.sessions.set(id, session)
    timings.sessionSetup = performance.now() - sessionStart

    const totalTime = performance.now() - startTime
    timings.total = totalTime

    // console.table({
    //   Setup: `${timings.setup.toFixed(2)}ms`,
    //   'PTY Spawn': `${timings.ptySpawn.toFixed(2)}ms`,
    //   'Terminal Setup': `${timings.terminalSetup.toFixed(2)}ms`,
    //   'Event Handlers': `${timings.eventHandlers.toFixed(2)}ms`,
    //   'Session Setup': `${timings.sessionSetup.toFixed(2)}ms`,
    //   Total: `${totalTime.toFixed(2)}ms`
    // })

    return { id, title: session.title, cwd: session.cwd, projectName: session.projectName }
  }

  list() {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      title: s.title,
      cwd: s.cwd,
      projectName: s.projectName
    }))
  }

  write(id: string, data: string) {
    const session = this.sessions.get(id)
    if (!session) return { ok: false as const }
    session.pty.write(data)
    return { ok: true as const }
  }

  resize(id: string, cols: number, rows: number) {
    const session = this.sessions.get(id)
    if (!session) return { ok: false as const }
    if (session.cols === cols && session.rows === rows) return { ok: true as const }
    session.cols = cols
    session.rows = rows
    session.term.resize(cols, rows)
    session.pty.resize(cols, rows)
    return { ok: true as const }
  }

  destroy(id: string) {
    const session = this.sessions.get(id)
    if (!session) return false
    session.pty.kill()
    this.sessions.delete(id)
    return true
  }

  reconnect(id: string) {
    // > It's recommended that you write the serialized data into a terminal of the same size in which it originated from and then resize it after if needed.
    const session = this.sessions.get(id)
    if (!session) return { success: false as const }
    const snapshot = session.serializer.serialize()
    return {
      success: true as const,
      id: session.id,
      cols: session.cols,
      rows: session.rows,
      title: session.title,
      snapshot,
      seq: session.seq
    }
  }

  getSnapshot(id: string) {
    const session = this.sessions.get(id)
    if (!session) return { ok: false as const }
    const snapshot = session.serializer.serialize()
    return { ok: true as const, snapshot }
  }

  getSince(id: string, since: number) {
    const session = this.sessions.get(id)
    if (!session) return { ok: false as const, chunks: [] as Array<DataChunk> }
    const chunks = session.ring.filter((c) => c.seq > since)
    return { ok: true as const, chunks }
  }

  destroyAll() {
    this.sessions.forEach((s) => {
      try {
        s.pty.kill()
      } catch {}
    })
    this.sessions.clear()
    if (
      this.mainWindow &&
      !this.mainWindow.isDestroyed() &&
      !this.mainWindow.webContents.isDestroyed()
    ) {
      this.handlers.terminalV2Exit.send({ id: 'all', exitCode: 0, signal: 0 })
    }
  }
}
