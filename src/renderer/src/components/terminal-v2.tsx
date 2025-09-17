import { useEffect, useRef, useState } from 'react'
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
  onReady?: (id: string) => void
  onExit?: () => void
  onTitleChange?: (title: string) => void
  isActive?: boolean
  startCommand?: string | string[]
}

export function Terminalv2({
  terminalId,
  cwd,
  onReady,
  onExit,
  onTitleChange,
  isActive = true,
  startCommand
}: TerminalV2Props) {
  const log = (m: string) => console.log('termv2 ' + m)
  // Tracks whether an xterm instance is currently attached (helps cleanup but not to skip init)
  const hasTermRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const serializeRef = useRef<SerializeAddonRender | null>(null)
  const [sessionId, setSessionId] = useState<string | undefined>(terminalId)
  const lastSeqRef = useRef<number>(0)
  const isConnectedRef = useRef(false)
  const lastColsRef = useRef<number | null>(null)
  const lastRowsRef = useRef<number | null>(null)
  const resizeDebounceRef = useRef<number | null>(null)
  const suppressNextResizeRef = useRef(false)
  const lastSizeRef = useRef<{ w: number; h: number } | null>(null)
  const hasRunStartRef = useRef(false)
  const [showStartPrompt, setShowStartPrompt] = useState(false)
  const [startConfirm, setStartConfirm] = useState(false)

  //
  //
  const onExitRef = useRef(onExit)
  useEffect(() => {
    onExitRef.current = onExit
  }, [onExit])
  const onTitleRef = useRef(onTitleChange)
  useEffect(() => {
    onTitleRef.current = onTitleChange
  }, [onTitleChange])

  useEffect(() => {
    if (!containerRef.current) return

    // Always recreate xterm instance for a clean slate on every effect run (mount/HMR)
    if (xtermRef.current) {
      try {
        xtermRef.current.dispose()
      } catch {}
    }

    const xterm = new XTerm({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      theme: {
        background: '#0A0A0A',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4'
      },
      cursorBlink: true,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    const serialize = new SerializeAddonRender()
    xterm.loadAddon(fit)
    xterm.loadAddon(serialize)
    xtermRef.current = xterm
    fitRef.current = fit
    serializeRef.current = serialize

    xterm.open(containerRef.current)
    try {
      fit.fit()
      lastColsRef.current = xterm.cols
      lastRowsRef.current = xterm.rows
    } catch {}
    console.log('termv2 init: open+fit cols=' + xterm.cols + ' rows=' + xterm.rows)

    hasTermRef.current = true

    const safeFit = () => {
      const el = containerRef.current
      if (!el || !fitRef.current || !xtermRef.current) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return // skip hidden container
      const dims = (fitRef.current as any)?.proposeDimensions?.()
      if (!dims || !Number.isInteger(dims.cols) || !Number.isInteger(dims.rows)) return
      if (lastColsRef.current === dims.cols && lastRowsRef.current === dims.rows) return
      suppressNextResizeRef.current = true
      try {
        xtermRef.current.resize(dims.cols, dims.rows)
      } catch {}
      lastColsRef.current = dims.cols
      lastRowsRef.current = dims.rows
      const idNow = sessionId || terminalId
      if (isConnectedRef.current && idNow) {
        v2Client.terminalV2Resize({ id: idNow, cols: dims.cols, rows: dims.rows })
      }
    }

    requestAnimationFrame(safeFit)

    const attach = async () => {
      let id = terminalId || sessionId
      if (id) {
        const res = await v2Client.terminalV2Reconnect(id)
        if (res.success) {
          setSessionId(id)
          try {
            const deser = (serializeRef.current as any)?.deserialize
            if (typeof deser === 'function') {
              deser.call(serializeRef.current, res.snapshot)
            } else {
              xtermRef.current?.write(res.snapshot)
            }
            //
          } catch {}
          console.log(
            `termv2 reconnect: deserialized snapshot len=${(res as any)?.snapshot?.length ?? 0}`
          )
          //
          lastSeqRef.current = res.seq
          //
          //
          lastColsRef.current = res.cols
          lastRowsRef.current = res.rows
          // Prefer local fit size; if it differs, resize PTY to local for best visual fit
          const dims = (fitRef.current as any)?.proposeDimensions?.()
          if (
            xtermRef.current &&
            dims &&
            Number.isInteger(dims.cols) &&
            Number.isInteger(dims.rows) &&
            (dims.cols !== res.cols || dims.rows !== res.rows)
          ) {
            suppressNextResizeRef.current = true
            try {
              xtermRef.current.resize(dims.cols, dims.rows)
            } catch {}
            lastColsRef.current = dims.cols
            lastRowsRef.current = dims.rows
            v2Client.terminalV2Resize({
              id,
              cols: Math.floor(dims.cols),
              rows: Math.floor(dims.rows)
            })
            console.log(
              `termv2 reconnect: resized PTY to local cols=${dims.cols} rows=${dims.rows}`
            )
          }
          console.log(
            //
            `termv2 reconnect ok id=${id} cols=${res.cols} rows=${res.rows} seq=${res.seq}`
          )
          onReady?.(id)
        } else {
          const created = await v2Client.terminalV2Create(
            cwd || startCommand
              ? {
                  cwd: cwd ?? undefined,
                  startCommand: startConfirm ? undefined : startCommand
                }
              : undefined
          )
          id = created.id
          setSessionId(id)
          const snap = await v2Client.terminalV2Reconnect(id)
          if (snap.success) {
            try {
              const deser = (serializeRef.current as any)?.deserialize
              if (typeof deser === 'function') {
                deser.call(serializeRef.current, snap.snapshot)
              } else {
                xtermRef.current?.write(snap.snapshot)
              }
            } catch {}
            console.log(
              `termv2 new: deserialized snapshot len=${(snap as any)?.snapshot?.length ?? 0}`
            )
            lastSeqRef.current = snap.seq
            lastColsRef.current = snap.cols
            lastRowsRef.current = snap.rows
            const dims = (fitRef.current as any)?.proposeDimensions?.()
            if (
              xtermRef.current &&
              dims &&
              Number.isInteger(dims.cols) &&
              Number.isInteger(dims.rows) &&
              (dims.cols !== snap.cols || dims.rows !== snap.rows)
            ) {
              suppressNextResizeRef.current = true
              try {
                xtermRef.current.resize(dims.cols, dims.rows)
              } catch {}
              lastColsRef.current = dims.cols
              lastRowsRef.current = dims.rows
              v2Client.terminalV2Resize({
                id,
                cols: Math.floor(dims.cols),
                rows: Math.floor(dims.rows)
              })
            }
            console.log(
              `termv2 create->reconnect id=${id} cols=${snap.cols} rows=${snap.rows} seq=${snap.seq}`
            )
          }
          onReady?.(id)
        }
      } else {
        const created = await v2Client.terminalV2Create(
          cwd || startCommand
            ? { cwd: cwd ?? undefined, startCommand: startConfirm ? undefined : startCommand }
            : undefined
        )
        id = created.id
        setSessionId(id)
        const snap = await v2Client.terminalV2Reconnect(id)
        if (snap.success) {
          try {
            const deser2 = (serializeRef.current as any)?.deserialize
            if (typeof deser2 === 'function') {
              deser2.call(serializeRef.current, snap.snapshot)
            } else {
              xtermRef.current?.write(snap.snapshot)
            }
          } catch {}
          lastSeqRef.current = snap.seq
          lastColsRef.current = snap.cols
          lastRowsRef.current = snap.rows
          const dims = (fitRef.current as any)?.proposeDimensions?.()
          if (
            xtermRef.current &&
            dims &&
            Number.isInteger(dims.cols) &&
            Number.isInteger(dims.rows) &&
            (dims.cols !== snap.cols || dims.rows !== snap.rows)
          ) {
            suppressNextResizeRef.current = true
            try {
              xtermRef.current.resize(dims.cols, dims.rows)
            } catch {}
            lastColsRef.current = dims.cols
            lastRowsRef.current = dims.rows
            v2Client.terminalV2Resize({
              id,
              cols: Math.floor(dims.cols),
              rows: Math.floor(dims.rows)
            })
            console.log(`termv2 new: resized PTY to local cols=${dims.cols} rows=${dims.rows}`)
          }
        }
        console.log(`termv2 new id=${id}`)
        onReady?.(id)
      }
    }

    attach()

    const dispResize = xtermRef.current?.onResize(({ cols, rows }) => {
      if (suppressNextResizeRef.current) {
        suppressNextResizeRef.current = false
        return
      }
      const id = sessionId || terminalId
      if (!id) return
      if (!isConnectedRef.current) return
      if (resizeDebounceRef.current) window.clearTimeout(resizeDebounceRef.current)
      resizeDebounceRef.current = window.setTimeout(() => {
        if (!isConnectedRef.current) return
        if (!Number.isInteger(cols) || !Number.isInteger(rows)) return
        if (lastColsRef.current === cols && lastRowsRef.current === rows) return
        lastColsRef.current = cols
        lastRowsRef.current = rows
        v2Client.terminalV2Resize({ id, cols: Math.floor(cols), rows: Math.floor(rows) })
        console.log(`termv2 xterm:onResize cols=${cols} rows=${rows}`)
      }, 80)
    })

    const handleResize = () => safeFit()
    window.addEventListener('resize', handleResize)

    const observer = new ResizeObserver(() => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const prev = lastSizeRef.current
      if (prev && prev.w === rect.width && prev.h === rect.height) return
      lastSizeRef.current = { w: rect.width, h: rect.height }
      safeFit()
    })
    observer.observe(containerRef.current)

    return () => {
      window.removeEventListener('resize', handleResize)

      observer.disconnect()
      dispResize?.dispose?.()
      if (resizeDebounceRef.current) window.clearTimeout(resizeDebounceRef.current)
      if (xtermRef.current) {
        try {
          xtermRef.current.dispose()
        } catch {}
      }
      xtermRef.current = null
      hasTermRef.current = false
      lastColsRef.current = null
      lastRowsRef.current = null
      lastSizeRef.current = null
    }
  }, [terminalId])

  useEffect(() => {
    //
    const id = sessionId || terminalId
    if (!id || !xtermRef.current || !isActive) return

    let unData: null | (() => void) = null
    let unExit: null | (() => void) = null
    let unTitle: null | (() => void) = null
    let cancelled = false

    ;(async () => {
      // Bring local xterm to server-reported size before any data playback
      const info = await v2Client.terminalV2Reconnect(id)
      if (!cancelled && info.success && xtermRef.current) {
        if (xtermRef.current.cols !== info.cols || xtermRef.current.rows !== info.rows) {
          suppressNextResizeRef.current = true
          try {
            xtermRef.current.resize(info.cols, info.rows)
          } catch {}
        }
        lastColsRef.current = info.cols
        lastRowsRef.current = info.rows
        if (info.seq > lastSeqRef.current) lastSeqRef.current = info.seq
      }

      // Apply any missed chunks since lastSeq
      const gap = await v2Client.terminalV2GetSince({ id, since: lastSeqRef.current })
      if (!cancelled && gap.ok && gap.chunks.length > 0) {
        console.log(`termv2 activate: gap count=${gap.chunks.length}`)
        for (const chunk of gap.chunks) {
          xtermRef.current?.write(chunk.data)
          lastSeqRef.current = chunk.seq
        }
      }

      if (cancelled) return

      // Subscribe to live events, guard by seq
      unData = subscribeTerminalV2Data(id, (p) => {
        if (p.seq <= lastSeqRef.current) return
        xtermRef.current?.write(p.data)
        lastSeqRef.current = p.seq
        const titleMatch = p.data.match(/\x1b\](?:0|2);([^\x07\x1b]+)(?:\x07|\x1b\\)/)
        if (titleMatch) onTitleRef.current?.(titleMatch[1])
      })
      unExit = subscribeTerminalV2Exit(id, () => onExitRef.current?.())
      unTitle = subscribeTerminalV2Title(id, (p) => onTitleRef.current?.(p.title))
      isConnectedRef.current = true
      if (startCommand && !hasRunStartRef.current && startConfirm) {
        setShowStartPrompt(true)
      }
      console.log('termv2 activate: subscribed')
    })()

    return () => {
      cancelled = true
      if (unData) unData()
      if (unExit) unExit()
      if (unTitle) unTitle()
      isConnectedRef.current = false
    }
  }, [sessionId, terminalId, isActive, startCommand])

  useEffect(() => {
    if (!isActive) return
    if (!xtermRef.current) return
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {}
    })
  }, [isActive, sessionId, terminalId])

  useEffect(() => {
    const id = sessionId || terminalId
    //
    if (!id) return
    if (!xtermRef.current) return
    const disp = xtermRef.current.onData((data) => {
      v2Client.terminalV2Write({ id, data })
    })
    return () => {
      try {
        disp.dispose()
      } catch {}
    }
  }, [sessionId, terminalId])

  const runStartNow = () => {
    const id = sessionId || terminalId
    if (!id || !startCommand) return
    const cmd = Array.isArray(startCommand) ? startCommand.join(' ') : startCommand
    v2Client.terminalV2Write({ id, data: cmd + '\r' })
    hasRunStartRef.current = true
    setShowStartPrompt(false)
  }

  return (
    <div className="h-full w-full bg-[#0A0A0A] px-2 pt-2 flex relative">
      <div ref={containerRef} className="flex-1 min-h-0" />
      {showStartPrompt && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg border border-white/10 bg-[#111111] text-white shadow-xl p-4 w-[520px] max-w-[92%]">
            <div className="text-sm text-white/80 mb-2">Run start command?</div>
            <div className="font-mono text-xs bg-black/60 border border-white/10 rounded px-2 py-2 mb-3 break-all">
              {Array.isArray(startCommand) ? startCommand.join(' ') : startCommand}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-white text-sm"
                onClick={() => setShowStartPrompt(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded bg-white text-black text-sm"
                onClick={runStartNow}
              >
                Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
