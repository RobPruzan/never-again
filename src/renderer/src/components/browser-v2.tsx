import { useState, useEffect, useMemo, useRef, Suspense, Children, cloneElement } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable'
import { WebContentView } from './web-content-view'
// import { TerminalSidebar } from './TerminalSidebar'
import { WindowPortal } from '@renderer/window-portal'
// import { useAppContext, useFocusedProject } from './app-context'
import { CommandPalette } from './command-pallete'
import { UpdateURLPalette } from './update-url'
// import { TabBar } from './TabBar'
// import { Home } from '@renderer/home'
// import { iife } from '@renderer/lib/utils'
// import { TabSwitcher } from './TabSwitcher'
import { MainSidebar } from './terminal-sidebar'
import { useAppContext, useFocusedProject } from '@renderer/app-context'
import { TabBar } from './tab-bar'
import { Home } from './home'
import { TabSwitcher } from './tab-switcher'
import { deriveRunningProjectId, iife } from '@renderer/lib/utils'
import { ListneingProject, RunningProject, LogsObj } from '@shared/types'
import { useProjects } from '@renderer/hooks/use-projects'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'
import { useQuery } from '@tanstack/react-query'
import { client } from '@renderer/lib/tipc'
import { useGroupedProjects } from '@renderer/hooks/use-grouped-projects'
import { CookingPot } from 'lucide-react'
import { useLogObj } from '@renderer/hooks/use-log-obj'
import Ansi from 'ansi-to-react'
import stripAnsi from 'strip-ansi'

const DisplayNoneActivity = ({
  children,
  mode
}: {
  children: React.ReactNode
  mode: 'visible' | 'hidden'
}) => {
  const child = Children.only(children) as React.ReactElement<{ style?: React.CSSProperties }>
  return cloneElement(child, {
    style: {
      ...child.props.style,
      display: mode === 'visible' ? 'block' : 'none'
    }
  })
}

export const BrowserV2 = () => {
  const { commandPaletteOpen, setCommandPaletteOpen, route, tabSwitcherOpen, setTabSwitcherOpen } =
    useAppContext()
  const projects = useProjects().data

  const focusedProject = useFocusedProject()
  if (projects.length === 0) {
    throw new Error('Invariant at least one tab should exist (should be default tab if none)')
  }

  return (
    <div className="flex flex-col flex-1 h-full bg-[#0A0A0A] ">
      <TabBar />

      {iife(() => {
        switch (route) {
          case 'home':
            return <Home />
          case 'webview':
            return <WebContentViewArea />
        }
      })}
      {commandPaletteOpen && (
        <WindowPortal
          anchor={{
            kind: 'percent',
            leftPct: 0,
            topPct: 0,
            widthPct: 100,
            heightPct: 100
          }}
          id="command-palette-poop"
          onDismiss={() => {
            setCommandPaletteOpen(false)
          }}
        >
          <Suspense>
            <CommandPalette />
          </Suspense>
        </WindowPortal>
      )}

      {tabSwitcherOpen && (
        <WindowPortal
          anchor={{
            kind: 'percent',
            leftPct: 0,
            topPct: 0,
            widthPct: 100,
            heightPct: 100
          }}
          id="tab-switcher"
          onDismiss={() => {
            setTabSwitcherOpen(false)
          }}
        >
          <Suspense>
            <TabSwitcher />
          </Suspense>
        </WindowPortal>
      )}

      <UpdateURLPalette />
    </div>
  )
}

const WebContentViewArea = () => {
  const { focusedProject, route } = useAppContext()
  const runningProjects = useRunningProjects().data

  // Only render when there's a focused project - this prevents WebContentView components
  // from mounting when focusedProject is null (which happens when Home is clicked)
  if (!focusedProject) {
    return null
  }

  // const groupedProjects = useGroupedProjects()

  // issue of course there could be one project with multiple ports
  // it would also be nice to give it a little http client at that port, that should be quite trivial to do

  return runningProjects.map((runningProject) => (
    // <StartingProject project={runningProject}>
    //   {(listenignProject) => (
    <div
      key={deriveRunningProjectId(runningProject)}
      style={{
        display:
          deriveRunningProjectId(runningProject) !== focusedProject.projectId || route !== 'webview'
            ? 'none'
            : 'flex'
      }}
      className="flex flex-1 h-full overflow-hidden"
    >
      <ResizablePanelGroup
        // autoSaveId={`${runningProject.cwd}-${route}`}
        // storage={localStorage}
        direction="horizontal"
      >
        <ResizablePanel defaultSize={75}>
          <StartingProject project={runningProject}>
            {(listeningProject) =>
              deriveRunningProjectId(listeningProject) === focusedProject.projectId &&
              route === 'webview' && (
                <>
                  <WebContentView
                    url={`http://localhost:${listeningProject.port}`}
                    id={deriveRunningProjectId(listeningProject)}
                  />
                </>
              )
            }
          </StartingProject>
        </ResizablePanel>

        <ResizableHandle className="bg-[#1A1A1A]" withHandle={false} />
        <ResizablePanel defaultSize={25}>
          <MainSidebar runningProject={runningProject} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
    // )}
    // </StartingProject>
  ))
}

const StartingProject = ({
  project,
  children
}: {
  project: RunningProject
  children: (listeningProject: ListneingProject) => React.ReactNode
}) => {
  const { data: faviconResult } = useQuery({
    queryKey: ['project-favicon', project.cwd],
    queryFn: () => client.getProjectFavicon({ projectPath: project.cwd }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    enabled: project.runningKind === 'starting'
  })
  const logsObjQuery = useLogObj()
  const favicon =
    faviconResult && (faviconResult as any).found ? (faviconResult as any).dataUrl : null

  switch (project.runningKind) {
    case 'listening': {
      return children(project)
    }
    case 'starting': {
      console.group()

      console.log('lod id', project.startingId)

      console.log('logs', logsObjQuery.data.startingLogs[project.startingId])
      console.log('project id', deriveRunningProjectId(project))
      console.groupEnd()
      const logs = (logsObjQuery.data?.startingLogs?.[project.startingId] ?? []) as string[]
      return (
        <div className="relative flex-1 h-full w-full flex items-center justify-center bg-[#0A0A0A] text-white overflow-hidden">
          <div className="relative flex flex-col items-center">
            {favicon ? (
              <img
                src={favicon}
                alt="project favicon"
                className="w-20 h-20 rounded-md border border-white/10"
                draggable={false}
              />
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="w-20 h-20 text-white/60"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            )}

            <div className="mt-4 flex items-center gap-2 text-white/70">
              <CookingPot className="w-4 h-4 text-white/60" />
              <span className="text-sm tracking-wide">Starting dev server…</span>
            </div>

            <div className="mt-6 w-[min(900px,92vw)] max-w-[92vw]">
              <StartingLogViewer lines={logs} />
            </div>
          </div>
        </div>
      )
    }
  }

  // return (

  // )
}

const StartingLogViewer = ({ lines }: { lines: string[] }) => {
  const [wrap, setWrap] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!autoScroll) return
    const el = scrollRef.current
    if (!el) return
    // Jump to present on new logs
    el.scrollTop = el.scrollHeight
  }, [lines.length, autoScroll])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 16
    setAutoScroll(nearBottom)
  }

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
    } catch (err) {
      // ignore
    }
  }

  const decorated = useMemo(() => {
    return lines.map((raw) => {
      const plain = stripAnsi(raw).replace(/\r/g, '')
      let level: 'error' | 'warn' | 'info' | 'normal' = 'normal'
      if (/error|failed|exception|trace|eaddrinuse|not\s+found|stack/i.test(plain)) level = 'error'
      else if (/warn|deprecated|slow|retry|warning/i.test(plain)) level = 'warn'
      else if (/ready|listening|compiled|started|server|vite|next|webpack/i.test(plain))
        level = 'info'
      return { raw, plain, level }
    })
  }, [lines])

  const levelAccent = (level: 'error' | 'warn' | 'info' | 'normal') => {
    switch (level) {
      case 'error':
        return 'bg-red-500/30'
      case 'warn':
        return 'bg-amber-500/30'
      case 'info':
        return 'bg-emerald-500/30'
      default:
        return 'bg-white/15'
    }
  }

  return (
    <div className="relative rounded-lg border border-[#1A1A1A] bg-[#0A0A0A] overflow-hidden h-[min(380px,45vh)]">
      <div className="absolute top-3 right-3 z-[1] flex items-center gap-2 text-xs">
        <button
          onClick={() => setAutoScroll((v) => !v)}
          className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 transition"
          title={autoScroll ? 'Pause autoscroll' : 'Resume autoscroll'}
        >
          {autoScroll ? 'Autoscroll' : 'Paused'}
        </button>
        <button
          onClick={() => setWrap((v) => !v)}
          className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 transition"
          title={wrap ? 'Disable word wrap' : 'Enable word wrap'}
        >
          {wrap ? 'Wrap' : 'No wrap'}
        </button>
        <button
          onClick={copyAll}
          className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 transition"
          title="Copy all logs"
        >
          Copy
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={
          'relative h-full overflow-y-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed text-white/80 ' +
          (wrap ? 'whitespace-pre-wrap' : 'whitespace-pre')
        }
        style={{ scrollbarGutter: 'stable' }}
      >
        {decorated.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center text-white/50">
            Waiting for logs…
          </div>
        ) : (
          <div className="space-y-1">
            {decorated.map(({ raw, level }, idx) => (
              <div key={idx} className="grid grid-cols-[auto,1fr] items-start gap-3">
                <span
                  className={
                    'mt-[0.35rem] inline-block w-1.5 h-3.5 rounded-full ' + levelAccent(level)
                  }
                />
                <div className="min-w-0 break-words text-white/75">
                  <Ansi>{raw.replace(/\r/g, '')}</Ansi>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* bottom fade */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0A0A0A] to-transparent" />
      </div>

      {!autoScroll && (
        <div className="absolute bottom-3 right-3 z-[1]">
          <button
            onClick={() => setAutoScroll(true)}
            className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 text-white/90 text-xs transition shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]"
          >
            Jump to present
          </button>
        </div>
      )}
    </div>
  )
}
