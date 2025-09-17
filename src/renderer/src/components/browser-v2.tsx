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

          {/* Cloudy mysterious glow */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden
          >
            <div
              className="w-96 h-48 opacity-30 blur-3xl bg-gradient-to-r from-red-500/50 via-yellow-500/50 via-green-500/50 via-blue-500/50 to-purple-500/50"
              style={{
                animation: 'float1 8s ease-in-out infinite',
                borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%'
              }}
            />
            <div
              className="w-80 h-40 opacity-35 blur-2xl bg-gradient-to-l from-pink-500/60 via-purple-500/60 via-blue-500/60 via-cyan-500/60 to-green-500/60 absolute"
              style={{
                animation: 'float2 6s ease-in-out infinite',
                borderRadius: '40% 60% 70% 30% / 40% 70% 30% 60%',
                animationDelay: '-1s'
              }}
            />
            <div
              className="w-72 h-36 opacity-25 blur-xl bg-gradient-to-br from-orange-400/40 via-red-400/40 via-pink-400/40 via-purple-400/40 to-indigo-400/40 absolute"
              style={{
                animation: 'float3 7s ease-in-out infinite',
                borderRadius: '70% 30% 40% 60% / 30% 60% 40% 70%',
                animationDelay: '-3s'
              }}
            />
          </div>

          <style jsx>{`
            @keyframes float1 {
              0% { transform: translateY(0px) translateX(0px) rotate(-15deg) scale(1); }
              25% { transform: translateY(-30px) translateX(15px) rotate(-5deg) scale(1.1); }
              50% { transform: translateY(-10px) translateX(-20px) rotate(5deg) scale(0.9); }
              75% { transform: translateY(20px) translateX(10px) rotate(-10deg) scale(1.05); }
              100% { transform: translateY(0px) translateX(0px) rotate(-15deg) scale(1); }
            }
            @keyframes float2 {
              0% { transform: translateY(0px) translateX(0px) rotate(25deg) scale(1); }
              30% { transform: translateY(25px) translateX(-15px) rotate(35deg) scale(0.95); }
              60% { transform: translateY(-15px) translateX(20px) rotate(15deg) scale(1.08); }
              100% { transform: translateY(0px) translateX(0px) rotate(25deg) scale(1); }
            }
            @keyframes float3 {
              0% { transform: translateY(0px) translateX(0px) rotate(45deg) scale(1); }
              40% { transform: translateY(-20px) translateX(-10px) rotate(55deg) scale(1.12); }
              80% { transform: translateY(15px) translateX(25px) rotate(35deg) scale(0.88); }
              100% { transform: translateY(0px) translateX(0px) rotate(45deg) scale(1); }
            }
          `}</style>

          <div className="relative flex flex-col items-center">
            <div className="p-6 rounded-full ring-1 ring-white/10 bg-black">
              <svg
                viewBox="0 0 100 87"
                className="w-24 h-24 text-white/90 drop-shadow-[0_0_24px_rgba(255,255,255,0.08)]"
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
