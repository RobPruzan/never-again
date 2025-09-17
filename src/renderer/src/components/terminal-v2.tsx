import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon as SerializeAddonRender } from '@xterm/addon-serialize'
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

function useTerminalResize(terminal: XTerm | null, fitAddon: FitAddon | null) {
  const handleResize = useCallback(() => {
    if (terminal && fitAddon) {
      try {
        fitAddon.fit()
      } catch (error) {
        console.warn('Terminal resize failed:', error)
      }
    }
  }, [terminal, fitAddon])

  useEffect(() => {
    const resizeObserver = new ResizeObserver(handleResize)

    if (terminal) {
      const element = terminal.element
      if (element?.parentElement) {
        resizeObserver.observe(element.parentElement)
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [handleResize, terminal])

  return handleResize
}

export function Terminalv2({ terminalId, cwd, startCommand }: TerminalV2Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [terminal, setTerminal] = useState<XTerm | null>(null)
  const [fitAddon, setFitAddon] = useState<FitAddon | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isReconnecting, setIsReconnecting] = useState(false)

  const handleResize = useTerminalResize(terminal, fitAddon)

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
    const serializer = new SerializeAddonRender()

    term.loadAddon(fit)
    term.loadAddon(serializer)

    term.open(containerRef.current)

    setTerminal(term)
    setFitAddon(fit)

    setTimeout(() => fit.fit(), 0)

    return () => {
      term.dispose()
      setTerminal(null)
      setFitAddon(null)
    }
  }, [])

  useEffect(() => {
    if (!terminal || !fitAddon) return

    const initializeTerminal = async () => {
      try {
        let activeSessionId = terminalId

        if (activeSessionId) {
          setIsReconnecting(true)
          const reconnectResult = await v2Client.terminalV2Reconnect(activeSessionId)

          if (reconnectResult.success) {
            terminal.resize(reconnectResult.cols, reconnectResult.rows)
            terminal.write(reconnectResult.snapshot)
            setTimeout(() => {
              fitAddon.fit()
              if (terminal && fitAddon) {
                const { cols, rows } = terminal
                v2Client.terminalV2Resize({ id: activeSessionId!, cols, rows })
              }
            }, 10)
          } else {
            const createResult = await v2Client.terminalV2Create({
              cwd: cwd || undefined,
              startCommand
            })
            activeSessionId = createResult.id
          }
          setIsReconnecting(false)
        } else {
          const createResult = await v2Client.terminalV2Create({
            cwd: cwd || undefined,
            startCommand
          })
          activeSessionId = createResult.id
        }

        setSessionId(activeSessionId)

        terminal.onData((data) => {
          if (activeSessionId) {
            v2Client.terminalV2Write({ id: activeSessionId, data })
          }
        })

        terminal.onResize(({ cols, rows }) => {
          if (activeSessionId) {
            v2Client.terminalV2Resize({ id: activeSessionId, cols, rows })
          }
        })

      } catch (error) {
        console.error('Failed to initialize terminal:', error)
        setIsReconnecting(false)
      }
    }

    initializeTerminal()
  }, [terminal, fitAddon, terminalId, cwd, startCommand])

  useEffect(() => {
    if (!sessionId) return

    const unsubscribeData = subscribeTerminalV2Data(sessionId, ({ data }) => {
      if (terminal) {
        terminal.write(data)
      }
    })

    const unsubscribeExit = subscribeTerminalV2Exit(sessionId, ({ exitCode }) => {
      console.log(`Terminal ${sessionId} exited with code ${exitCode}`)
    })

    const unsubscribeTitle = subscribeTerminalV2Title(sessionId, ({ title }) => {
      console.log(`Terminal ${sessionId} title changed to: ${title}`)
    })

    return () => {
      unsubscribeData()
      unsubscribeExit()
      unsubscribeTitle()
    }
  }, [sessionId, terminal])

  useEffect(() => {
    if (terminal && fitAddon && !isReconnecting) {
      setTimeout(handleResize, 100)
    }
  }, [terminal, fitAddon, handleResize, isReconnecting])

  return (
    <div className="h-full w-full bg-[#0A0A0A] px-2 pt-2 flex relative">
      <div ref={containerRef} className="flex-1 min-h-0" />
      {isReconnecting && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="text-white">Reconnecting...</div>
        </div>
      )}
    </div>
  )
}
