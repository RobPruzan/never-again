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
  pty: pty.IPty
  term: HeadlessTerminal
  serializer: SerializeAddon
  title: string
  cwd: string
  projectName: string
  cols: number
  rows: number
  ring: Array<DataChunk>
  seq: number
  startCommand: string | null
  startSent: boolean
}

export class TerminalManagerV2 {
  private sessions = new Map<string, TerminalV2Session>()
  private mainWindow: BrowserWindow | null = null
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
    const shell =
      options?.shell || (os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash')
    const cwd = options?.cwd || process.env.HOME || process.cwd()
    const id = terminalId || `termv2-${Date.now()}`
    const cols = 80
    const rows = 30

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

    const term = new HeadlessTerminal({
      cols,
      rows,
      allowProposedApi: true,
      scrollback: 10000
    })
    const serializer = new SerializeAddon()
    term.loadAddon(serializer)

    const ring: Array<DataChunk> = []
    const RING_MAX = 1000

    const startCmd = options?.startCommand
      ? Array.isArray(options.startCommand)
        ? options.startCommand.join(' ')
        : options.startCommand
      : null

    // Fallback: if PTY is silent, still attempt to send start after a short delay
    // if (startCmd) {
    //   setTimeout(() => {
    //     if (!startSent) {
    //       try {
    //         p.write(startCmd + '\r')
    //         startSent = true
    //       } catch {}
    //     }
    //   }, 200)
    // }

    const onData = (data: string) => {
      term.write(data)
      const session = this.sessions.get(id)
      if (!session) return
      const seq = session.seq + 1
      session.seq = seq
      session.ring.push({ seq, data })
      if (session.ring.length > RING_MAX) session.ring.shift()
      // As soon as we see first output from the shell, send start command once
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
