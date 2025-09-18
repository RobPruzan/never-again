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
import { ListneingProject, RunningProject } from '@shared/types'
import { useProjects } from '@renderer/hooks/use-projects'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'
import { useLogObj } from '@renderer/hooks/use-log-obj'
import Ansi from 'ansi-to-react'
import { useBrowserState } from './use-browser-state'
import { LeafyGreen } from 'lucide-react'

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

const PhaseHeader = ({ phase }: { phase: 'starting' | 'loading' }) => {
  return (
    <div className="mb-3 flex items-center justify-center">
      <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.04] border border-white/10 text-xs text-white/70">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
        {phase === 'starting' ? 'Starting server…' : 'Server ready — loading page…'}
      </span>
    </div>
  )
}

// Centralized, type-safe log selection to avoid frame regressions
const selectLogsForProject = (
  logsObj: ReturnType<typeof useLogObj>['data'] | undefined,
  project: RunningProject,
  savedStartingId: string | null,
  stableRunningLogsRef: React.MutableRefObject<string[]>
): string[] => {
  if (!logsObj) return stableRunningLogsRef.current.length > 0 ? stableRunningLogsRef.current : []

  if (project.runningKind === 'starting') {
    return logsObj.startingLogs[project.startingId] ?? []
  }

  // listening
  const mappedPort = savedStartingId ? logsObj.startingToRunning[savedStartingId] : undefined
  const mappedLogs = mappedPort != null ? logsObj.runningProjectsLogs[mappedPort] : undefined
  const portLogs = logsObj.runningProjectsLogs[project.port]
  const startingLogs = savedStartingId ? logsObj.startingLogs[savedStartingId] : undefined

  let candidate = mappedLogs ?? portLogs ?? startingLogs ?? []

  // If mapping exists but not yet populated, prefer showing prior starting logs asap
  if (mappedPort != null && mappedLogs === undefined && Array.isArray(startingLogs)) {
    candidate = startingLogs
  }

  // Sticky last known logs to prevent blank frames
  if (candidate.length === 0 && stableRunningLogsRef.current.length > 0) {
    candidate = stableRunningLogsRef.current
  } else if (candidate.length > 0) {
    stableRunningLogsRef.current = candidate
  }

  return candidate
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
      // key={runningProject.cwd}
      // like really we want to say the cwd but we want to invalide the web content on new url, but right we dont have okay yeah thats it
      //
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
                    key={deriveRunningProjectId(runningProject)} // i think?
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
  const logsObjQuery = useLogObj()
  const browserStateQuery = useBrowserState()
  const savedStartingIdRef = useRef<string | null>(null)
  const stableRunningLogsRef = useRef<string[]>([])
  const prevCwdRef = useRef<string>(project.cwd)

  console.log('logs obj', logsObjQuery.data)
  console.log('saved starting id', savedStartingIdRef.current)
  console.log('project', project)

  /**
   *
   * if i had the browser query then i could know reactively
   * if the project is loading
   * and i could guard listening to be on both
   */

  if (prevCwdRef.current !== project.cwd) {
    prevCwdRef.current = project.cwd
    console.log('SETTING TO NULL', prevCwdRef.current, project.cwd)

    savedStartingIdRef.current = null
    stableRunningLogsRef.current = []
  }
  if (project.runningKind === 'starting') {
    savedStartingIdRef.current = project.startingId
  }

  switch (project.runningKind) {
    case 'listening': {
      const isLoaded = Boolean(browserStateQuery.data?.isLoaded)
      const runningLogs = selectLogsForProject(
        logsObjQuery.data,
        project,
        savedStartingIdRef.current,
        stableRunningLogsRef
      )
      return (
        <div className="relative flex-1 h-full w-full bg-[#0A0A0A] overflow-hidden">
          {children(project)}
          <div
            className={
              'absolute inset-0 flex items-center justify-center transition-opacity duration-300 ' +
              (isLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100')
            }
          >
            <div className="w-[min(900px,92vw)] max-w-[92vw]">
              <PhaseHeader phase="loading" />
              <StartingLogViewer lines={runningLogs} />
            </div>
          </div>
        </div>
      )
    }
    case 'starting': {
      const logs = selectLogsForProject(
        logsObjQuery.data,
        project,
        savedStartingIdRef.current,
        stableRunningLogsRef
      )
      return (
        <div className="relative flex-1 h-full w-full flex items-center justify-center bg-[#0A0A0A] text-white overflow-hidden">
          <div className="relative w-[min(900px,92vw)] max-w-[92vw]">
            <PhaseHeader phase="starting" />
            <StartingLogViewer lines={logs} />
          </div>
        </div>
      )
    }
  }

  // return (

  // )
}

const StartingLogViewer = ({ lines }: { lines: string[] }) => {
  if (lines.length === 0) {
    console.log('NOOOOOOOOOO LINESSSSSSSSSSSSSSS')
  } else {
    console.log('LINESSSSSSSSSSSSSSSS')
  }

  const wrap = true
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!autoScroll) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lines.length, autoScroll])

  const handleScroll = () => {
    // keep autoScroll always-on; ignore manual scroll pause
    const el = scrollRef.current
    if (!el) return
    setAutoScroll(true)
  }

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
    } catch (err) {
      // ignore
    }
  }

  const cleanedLines = useMemo(() => lines.map((raw) => raw.replace(/\r/g, '')), [lines])

  // (levels removed to keep UI simple and robust)

  return (
    <div className="relative rounded-lg border border-[#1A1A1A] bg-[#0A0A0A] overflow-hidden h-[min(380px,45vh)]">
      {/* controls removed for a calmer, focused view */}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={
          'relative h-full overflow-y-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed text-white/80 ' +
          (wrap ? 'whitespace-pre-wrap' : 'whitespace-pre')
        }
        style={{ scrollbarGutter: 'stable' }}
      >
        {cleanedLines.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center text-white/50">
            Waiting for logs…
          </div>
        ) : (
          <div className="space-y-1">
            {cleanedLines.map((line, idx) => (
              <div key={idx} className="min-w-0 break-words text-white/75">
                <Ansi>{line}</Ansi>
              </div>
            ))}
          </div>
        )}

        {/* bottom fade */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0A0A0A] to-transparent" />
      </div>

      {/* always autoscroll; no jump control */}
    </div>
  )
}
