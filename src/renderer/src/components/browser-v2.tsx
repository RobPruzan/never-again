import { useState, Suspense, Children, cloneElement } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable'
import { WebContentView } from './web-content-view'
// import { TerminalSidebar } from './TerminalSidebar'
import { WindowPortal } from '@renderer/window-portal'
// import { useAppContext, useFocusedProject } from './app-context'
import { CommandPalette } from './command-pallete'
import { UpdateURLPalette } from './update-url'
import { ProjectContext } from './project-context'
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
    runningProjects: projects,
    route,
    tabSwitcherOpen,
    setTabSwitcherOpen
  } = useAppContext()
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
  const { runningProjects, focusedProject, route } = useAppContext()

  // Only render when there's a focused project - this prevents WebContentView components
  // from mounting when focusedProject is null (which happens when Home is clicked)
  if (!focusedProject) {
    return null
  }

  return runningProjects.map((runningProject) => (
    <StartingProject project={runningProject}>
      {(listenignProject) => (
        <ProjectContext
          key={listenignProject.cwd}
          value={{
            projectId: listenignProject.cwd,
            url: `http://localhost:${listenignProject.port}`
          }}
        >
          <div
            style={{
              display:
                listenignProject.cwd !== focusedProject.projectId || route !== 'webview'
                  ? 'none'
                  : 'flex'
            }}
            className="flex flex-1 overflow-hidden"
          >
            <ResizablePanelGroup
              autoSaveId={`${listenignProject.cwd}-${route}`}
              storage={localStorage}
              direction="horizontal"
            >
              <ResizablePanel defaultSize={80}>
                {listenignProject.cwd === focusedProject.projectId && route === 'webview' && (
                  <WebContentView
                    url={`http://localhost:${listenignProject.port}`}
                    id={listenignProject.cwd}
                  />
                )}
              </ResizablePanel>
              <ResizableHandle className="bg-[#1A1A1A]" withHandle={false} />
              <ResizablePanel defaultSize={20}>
                <TerminalSidebar />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ProjectContext>
      )}
    </StartingProject>
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
        <div className="flex-1 flex items-center justify-center bg-[#0A0A0A] text-white">
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-600 border-t-blue-500 mx-auto"></div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">Starting Project</h3>
              <p className="text-gray-400">Initializing {project.kind} dev server...</p>
              <p className="text-sm text-gray-500">{project.cwd}</p>
            </div>
          </div>
        </div>
      )
    }
  }

  // return (

  // )
}
