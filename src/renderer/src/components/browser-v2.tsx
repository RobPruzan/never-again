import { useState, Suspense, Children, cloneElement } from 'react'
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
import { useQuery } from '@tanstack/react-query'
import { client } from '@renderer/lib/tipc'
import { useGroupedProjects } from '@renderer/hooks/use-grouped-projects'
import { CookingPot } from 'lucide-react'

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
  console.log('is tab switcher open', tabSwitcherOpen)

  const focusedProject = useFocusedProject()
  if (projects.length === 0) {
    throw new Error('Invariant at least one tab should exist (should be default tab if none)')
  }
  // console.log('whats da deal', focusedProject.projectId, projects)

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

  console.log('whatdafuck', runningProjects)

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
        <ResizablePanel defaultSize={80}>
          <StartingProject project={runningProject}>
            {(listeningProject) =>
              deriveRunningProjectId(listeningProject) === focusedProject.projectId &&
              route === 'webview' && (
                <>
                  {
                    (console.log(
                      'focused project vs id we epxect',
                      deriveRunningProjectId(listeningProject),
                      listeningProject,
                      focusedProject
                    ),
                    null)
                  }

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
        <ResizablePanel defaultSize={20}>
          <MainSidebar />
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
  const favicon =
    faviconResult && (faviconResult as any).found ? (faviconResult as any).dataUrl : null
  switch (project.runningKind) {
    case 'listening': {
      return children(project)
    }
    case 'starting': {
      return (
        <div className="relative flex-1 h-full w-full flex items-center justify-center bg-[#0A0A0A] text-white overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.06),_transparent_60%)]" />
          </div>

          {favicon && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              aria-hidden
            >
              <img
                src={favicon}
                alt=""
                className="w-80 h-80 opacity-30 blur-3xl rounded-xl select-none"
                draggable={false}
              />
            </div>
          )}

          <div className="relative flex flex-col items-center">
            <div className="p-6 rounded-full ring-1 ring-white/10 bg-black">
              {favicon ? (
                <img
                  src={favicon}
                  alt="project favicon"
                  className="w-24 h-24 rounded-md drop-shadow-[0_0_24px_rgba(255,255,255,0.08)]"
                  draggable={false}
                />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="w-24 h-24 text-white/70 drop-shadow-[0_0_24px_rgba(255,255,255,0.08)]"
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
            </div>
          </div>
        </div>
      )
    }
  }

  // return (

  // )
}
