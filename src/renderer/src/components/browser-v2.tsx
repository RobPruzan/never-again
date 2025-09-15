import { useState, unstable_Activity as Activity, Suspense, Children, cloneElement } from 'react'
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

  return runningProjects.map((project) => (
    <ProjectContext
      key={project.cwd}
      value={{
        projectId: project.cwd,
        url: `http://localhost:${project.port}`
      }}
    >
      <div
        style={{
          display: project.cwd !== focusedProject.projectId || route !== 'webview' ? 'none' : 'flex'
        }}
        className="flex flex-1 overflow-hidden"
      >
        <ResizablePanelGroup
          autoSaveId={`${project.cwd}-${route}`}
          storage={localStorage}
          direction="horizontal"
        >
          <ResizablePanel defaultSize={80}>
            {project.cwd === focusedProject.projectId && route === 'webview' && (
              <WebContentView url={`http://localhost:${project.port}`} id={project.cwd} />
            )}
          </ResizablePanel>
          <ResizableHandle className="bg-[#1A1A1A]" withHandle={false} />
          <ResizablePanel defaultSize={20}>
            <TerminalSidebar />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </ProjectContext>
  ))
}
