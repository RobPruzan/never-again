import { Suspense, useState, useEffect } from 'react'
// import { AppLayout } from './components/AppLayout'
// import { AppContext, FocusedProject, TerminalInstance } from './components/app-context'
import { QueryClient, QueryClientProvider, useSuspenseQuery } from '@tanstack/react-query'
// import { client, handlers, v2Client } from './lib/tipc'
// import { Terminal } from '@xterm/xterm'

import { Project, RunningProject } from '@shared/types'
// import { useListenForProjects } from './components/use-listen-for-projects'
import { client, handlers, v2Client } from '@renderer/lib/tipc'
import { TerminalInstance, FocusedProject, AppContext } from '@renderer/app-context'
import { AppLayout } from './app-layout'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'
import { useProjects } from '@renderer/hooks/use-projects'
import { deriveRunningProjectId } from '@renderer/lib/utils'

import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ErrorBoundary } from './error-boundary'
import { useLogObjUpdate } from '@renderer/hooks/use-log-obj'
export default function App() {
  const client = new QueryClient()

  return (
    <QueryClientProvider client={client}>
      <ReactQueryDevtools />

      {/* nice black loading screen */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen bg-[#0A0A0A]">
            <div className="text-white text-2xl font-bold">Loading...</div>
          </div>
        }
      >
        <ErrorBoundary fallback={(error) => <>error noo: {error.message}</>}>
          <AppLoader />
        </ErrorBoundary>
      </Suspense>
    </QueryClientProvider>
  )
}

const AppLoader = () => {
  // this is a bad abstraction that technically cause waterfalls but fine for now since its like sub 1ms ipc
  const devServersQuery = useRunningProjects()
  useLogObjUpdate()

  const [route, setRoute] = useState<'home' | 'webview'>('home')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [focusedProject, setFocusedProject] = useState<FocusedProject | null>(null)
  const [recentTabs, setRecentTabs] = useState<string[]>([]) // Start empty, only track actual navigation
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false)
  const [swappableSidebarOpen, setSwappableSidebarOpen] = useState(false)

  useEffect(() => {
    const unlistenNewTab = handlers.menuNewTab.listen(() => {
      setCommandPaletteOpen(true)
    })

    const unlistenTabSwitcher = handlers.tabSwitcher.listen(() => {
      console.log('listen for recent tabs')

      setTabSwitcherOpen(true)
    })

    return () => {
      unlistenNewTab()
      unlistenTabSwitcher()
    }
  }, [recentTabs.length])

  if (devServersQuery.data.length === 0) {
    return (
      <AppContext.Provider
        value={{
          route,
          setRoute,
          setFocusedProject,
          focusedProject,
          commandPaletteOpen,
          setCommandPaletteOpen,
          recentTabs,
          setRecentTabs,
          tabSwitcherOpen,
          setTabSwitcherOpen,
          swappableSidebarOpen,
          setSwappableSidebarOpen
        }}
      >
        <AppLayout />
      </AppContext.Provider>
    )
  }

  // Find the first terminal for the first project to set as focused
  const firstProject = devServersQuery.data[0]

  // Update focused project now that we have running projects
  useEffect(() => {
    if (firstProject && !focusedProject) {
      setFocusedProject({
        projectId: deriveRunningProjectId(firstProject),
        projectCwd: firstProject.cwd
      })
    }
  }, [firstProject])

  // Don't initialize recent tabs - only track actual navigation

  // Update recent tabs when focused project changes
  useEffect(() => {
    if (focusedProject?.projectId) {
      setRecentTabs((prev) => {
        const filtered = prev.filter((id) => id !== focusedProject.projectId)
        return [focusedProject.projectId, ...filtered]
      })
    }
  }, [focusedProject?.projectId])

  return (
    <AppContext.Provider
      value={{
        route,
        setRoute,
        setFocusedProject,
        focusedProject,
        commandPaletteOpen,
        setCommandPaletteOpen,
        recentTabs,
        setRecentTabs,
        tabSwitcherOpen,
        setTabSwitcherOpen,
        swappableSidebarOpen,
        setSwappableSidebarOpen
      }}
    >
      <AppLayout />
    </AppContext.Provider>
  )
}
