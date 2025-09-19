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

  // const focusedProject = useFocusedProject()
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

  /**
   * this SHOULD be
   *
   * projects.map(project => project.process.ports.map(port => ))
   *
   * then what? how is the problem solved
   *
   * then we show a <StartingProcess></StartingProcess> wrapper which reads port.parentProcess
   *
   * then all ports for the process read the same stdout
   *
   * right, then what's the id
   *
   * well you have valid id's in all cases
   *
   * project.cwd
   * process.pid
   * port.value
   *
   *
   * a project is a static thing (something you can index statically once)
   * a process is something either starting or listening
   * a port is something definitely listening
   *
   *
   * so how do you know if something is starting or listening?
   * does it have any ports?
   *
   * no that's not valid. that's what we're already doing though, we just can't know
   *
   * we need to define an invariant: a process must be listening on a port
   *
   * then we can assert the prior state- if a process has no ports its still starting
   *
   * how do we handle focused projects? ah this is the correct model
   *
   * you focus a PROJECT, but then you need some state that represents what port you want since that's what matters
   *
   * you don't want this to be effect based. so you have a selection that can be swapped out at will, that's unique
   *
   * then you just need sync which is what we already fucking did
   *
   * how close are we to this existing model? like what would it take to go from where we are now to that model
   *
   * its like projects are really just flattened projects for their ports
   *
   * okay then the fundamnetal problem is that we're mapping logs to ports, when it should be processes, which are really
   * just projects
   *
   * oh wait a project can TOTALLY have mutliple processes, that have different stdout. so we absolutely want to map
   * to pid
   *
   *
   * fuck but how do we define equality here
   *
   * we would need to say its the starting id, but then if there was ever a starting id we back reference that still ug
   * maybe something we have to do but not confident
   *
   * lets just see why it completely doesn't work
   */

  return runningProjects.map((runningProject) => (
    // <StartingProject project={runningProject}>
    //   {(listenignProject) => (
    <div
      key={runningProject.cwd} // the lowest common denominator, the project. we want to maintain this parent layout for the project level, which is currently nothing meangifull
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
          {/* // the shell specifically can be any website being exposed from a process */}
          <StartingProject key={runningProject.pid} project={runningProject}>
            {(listeningProject) =>
              deriveRunningProjectId(listeningProject) === focusedProject.projectId && // maybe this is kinda fucked????????????????/
              route === 'webview' && (
                <>
                  <WebContentView
                    key={deriveRunningProjectId(listeningProject)} // this id is load bearing over the port, i need to think harder if the cwd ever helps (maybe edge cases) but base case no
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
          <MainSidebar
            key={runningProject.cwd} // we want this to be persistent across different procesess, ports (so intra)
            // technically we are scoping the sidebar to the process, and its an invariant that we wont spawn another process with the dev server
            // wait that makes no sense, that can't be an invariant the user can totally do it
            // okay problem, the user may spawn another process, and then the pid is no longer valid
            // fucker

            runningProject={runningProject}
          />
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
  // const isTabLoaded = browserStateQuery.data.tabs.find(tab => tab.)
  console.log('browser state', browserStateQuery.data)

  // console.log('the logs obj', logsObjQuery.data)
  // console.log('the project', project)

  // console.log('is it loaded?', browserStateQuery.data.isLoaded)
  // console.log('logs?', logsObjQuery.data[project.pid])

  /**
   * now what we want to do is get the logs for the parent process
   */

  switch (project.runningKind) {
    case 'listening': {
      const ourTab = browserStateQuery.data.tabs.find(
        (tab) => tab.tabId === deriveRunningProjectId(project)
      )
      console.log('our tab?', ourTab)

      const isLoaded = Boolean(ourTab?.isLoaded)
      const logs = logsObjQuery.data[project.pid] ?? []
      if (!isLoaded) {
        return (
          <div className="relative flex-1 h-full w-full bg-[#0A0A0A] overflow-hidden">
            {children(project)}
            <div
              className={
                'absolute inset-0 flex items-center justify-center transition-opacity duration-300 ' +
                (isLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100')
              }
            >
              <div className="w-[min(900px,calc(100%-2rem))] max-w-full">
                <PhaseHeader phase="loading" />
                <StartingLogViewer lines={logs} />
              </div>
            </div>
          </div>
        )
      }

      return children(project)
    }
    case 'starting': {
      const logs = logsObjQuery.data[project.pid] ?? []
      return (
        <div className="relative flex-1 h-full w-full flex items-center justify-center bg-[#0A0A0A] text-white overflow-hidden">
          <div className="relative w-[min(900px,calc(100%-2rem))] max-w-full">
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
    const el = scrollRef.current
    if (!el) return
    setAutoScroll(true)
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
