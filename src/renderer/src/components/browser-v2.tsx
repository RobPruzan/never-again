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
import { TerminalSidebar } from './terminal-sidebar'
import { useAppContext, useFocusedProject } from '@renderer/app-context'
import { TabBar } from './tab-bar'
import { Home } from './home'
import { TabSwitcher } from './tab-switcher'
import { iife } from '@renderer/lib/utils'
import { ListneingProject, RunningProject } from '@shared/types'
import { useProjects } from '@renderer/hooks/use-projects'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'

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
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    route,
    tabSwitcherOpen,
    setTabSwitcherOpen
  } = useAppContext()
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
  const {  focusedProject, route } = useAppContext()
  const runningProjects = useRunningProjects().data

  // Only render when there's a focused project - this prevents WebContentView components
  // from mounting when focusedProject is null (which happens when Home is clicked)
  if (!focusedProject) {
    return null
  }

  return runningProjects.map((runningProject) => (
    // <StartingProject project={runningProject}>
    //   {(listenignProject) => (
    <div
      style={{
        display:
          runningProject.cwd !== focusedProject.projectId || route !== 'webview' ? 'none' : 'flex'
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
              listeningProject.cwd === focusedProject.projectId &&
              route === 'webview' && (
                <WebContentView
                  url={`http://localhost:${listeningProject.port}`}
                  id={listeningProject.cwd}
                />
              )
            }
          </StartingProject>
        </ResizablePanel>

        <ResizableHandle className="bg-[#1A1A1A]" withHandle={false} />
        <ResizablePanel defaultSize={20}>
          <TerminalSidebar />
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

          <div className="relative flex flex-col items-center">
            <div className="p-6 rounded-full ring-1 ring-white/10">
              <svg
                viewBox="0 0 100 87"
                className="w-24 h-24 text-white/90 drop-shadow-[0_0_24px_rgba(255,255,255,0.08)] animate-pulse"
                aria-label="Vercel"
                role="img"
              >
                <polygon points="50,0 100,86.6 0,86.6" fill="currentColor" />
              </svg>
            </div>
          </div>
        </div>
      )
    }
  }

  // return (

  // )
}
