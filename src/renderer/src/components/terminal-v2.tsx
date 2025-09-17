import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import '@xterm/xterm/css/xterm.css'
import {
  v2Client,
  subscribeTerminalV2Data,
  subscribeTerminalV2Exit,
  subscribeTerminalV2Title
} from '../lib/tipc'

type TerminalV2Props = {
  terminalId?: string
  cwd?: string | null
  startCommand?: string | string[]
}

function useTerminalSetup(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [terminal, setTerminal] = useState<XTerm | null>(null)
  const [fitAddon, setFitAddon] = useState<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      theme: {
        background: '#0A0A0A',
        foreground: '#ffffff',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
        black: '#000000',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#bfbfbf',
        brightBlack: '#4d4d4d',
        brightRed: '#ff6e67',
        brightGreen: '#5af78e',
        brightYellow: '#f4f99d',
        brightBlue: '#caa9fa',
        brightMagenta: '#ff92d0',
        brightCyan: '#9aedfe',
        brightWhite: '#e6e6e6'
      },
      fontFamily: '"Cascadia Code", "SF Mono", Monaco, Inconsolata, "Roboto Mono", "Source Code Pro", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 10000
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new SerializeAddon())
    term.open(containerRef.current)
    fit.fit()

    setTerminal(term)
    setFitAddon(fit)

    return () => {
      term.dispose()
      setTerminal(null)
      setFitAddon(null)
    }
  }, [containerRef])

  return { terminal, fitAddon }
}

function useTerminalSession(terminal: XTerm | null, terminalId?: string, cwd?: string | null, startCommand?: string | string[]) {
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    if (!terminal) return

    const initSession = async () => {
      if (terminalId) {
        const reconnect = await v2Client.terminalV2Reconnect(terminalId)
        if (reconnect.success) {
          terminal.resize(reconnect.cols, reconnect.rows)
          terminal.write(reconnect.snapshot)
          setSessionId(terminalId)
          return
        }
      }

      const session = await v2Client.terminalV2Create({
        cwd: cwd || undefined,
        startCommand
      })
      setSessionId(session.id)
    }

    initSession()
  }, [terminal, terminalId, cwd, startCommand])

  return sessionId
}

function useTerminalEvents(terminal: XTerm | null, sessionId: string | null) {
  useEffect(() => {
    if (!terminal || !sessionId) return

    terminal.onData((data) => {
      v2Client.terminalV2Write({ id: sessionId, data })
    })

    terminal.onResize(({ cols, rows }) => {
      v2Client.terminalV2Resize({ id: sessionId, cols, rows })
    })
  }, [terminal, sessionId])

  useEffect(() => {
    if (!sessionId) return

    const unsubs = [
      subscribeTerminalV2Data(sessionId, ({ data }) => terminal?.write(data)),
      subscribeTerminalV2Exit(sessionId, () => {}),
      subscribeTerminalV2Title(sessionId, () => {})
    ]

    return () => unsubs.forEach(unsub => unsub())
  }, [sessionId, terminal])
}

function useTerminalResize(terminal: XTerm | null, fitAddon: FitAddon | null) {
  useEffect(() => {
    if (!terminal || !fitAddon) return

    const handleResize = () => fitAddon.fit()
    const resizeObserver = new ResizeObserver(handleResize)

    if (terminal.element?.parentElement) {
      resizeObserver.observe(terminal.element.parentElement)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [terminal, fitAddon])
}

export function Terminalv2({ terminalId, cwd, startCommand }: TerminalV2Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { terminal, fitAddon } = useTerminalSetup(containerRef)
  const sessionId = useTerminalSession(terminal, terminalId, cwd, startCommand)

  useTerminalEvents(terminal, sessionId)
  useTerminalResize(terminal, fitAddon)

  return (
    <div className="h-full w-full bg-[#0A0A0A] px-2 pt-2 flex relative">
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  )
}
