import { Suspense, useState, useEffect, useRef } from 'react'
// import { AppLayout } from './components/AppLayout'
// import { AppContext, FocusedProject, TerminalInstance } from './components/app-context'
import { QueryClient, QueryClientProvider, useSuspenseQuery } from '@tanstack/react-query'
// import { client, handlers, v2Client } from './lib/tipc'
import { Terminal } from '@xterm/xterm'

import { Project, RunningProject } from '@shared/types'
// import { useListenForProjects } from './components/use-listen-for-projects'
import { client, handlers, v2Client } from '@renderer/lib/tipc'
import { TerminalInstance, FocusedProject, AppContext } from '@renderer/app-context'
import { AppLayout } from './app-layout'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'
import { useProjects } from '@renderer/hooks/use-projects'

export default function App() {
  const client = new QueryClient()

  return (
    <QueryClientProvider client={client}>
      {/* nice black loading screen */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen bg-[#0A0A0A]">
            <div className="text-white text-2xl font-bold">Loading...</div>
          </div>
        }
      >
        <AppLoader />
      </Suspense>
    </QueryClientProvider>
  )
}

const AppLoader = () => {
  // const portsQuery = useSuspenseQuery({
  //   queryKey: ['ports'],
  //   queryFn: () => client.getPorts()
  // })

  const projectsQuery = useProjects()
  const devServersQuery = useRunningProjects()

  // Query existing v2 terminal sessions
  const terminalsQuery = useSuspenseQuery({
    queryKey: ['terminals'],
    queryFn: async () => v2Client.terminalV2List()
  })

  // const runningProjects = Object.entries(portsQuery.data).map(
  //   ([port, data]) =>
  //     ({
  //       cwd: data.cwd,
  //       port: Number(port),
  //       name: data.name,
  //       projectId: data.name // should be something else
  //     }) satisfies RunningProject
  // )

  // Map terminal sessions to terminal instances
  const initialTerminals: TerminalInstance[] = terminalsQuery.data.map((session) => ({
    terminalId: session.id,
    projectId: session.cwd
  }))

  // console.log('projects', projects)
  // console.log('terminals', initialTerminals)

  // State that needs to be available even when no projects are running
  const [projects, setProjects] = useState<Project[]>(projectsQuery.data)
  const [route, setRoute] = useState<'home' | 'webview'>('home')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [terminals, setTerminals] = useState<TerminalInstance[]>(initialTerminals)
  const [focusedProject, setFocusedProject] = useState<FocusedProject | null>(null)
  const [recentTabs, setRecentTabs] = useState<string[]>([]) // Start empty, only track actual navigation
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false)
  const creatingTerminalsRef = useRef<Set<string>>(new Set())

  // Listen for menu events via tipc handlers
  useEffect(() => {
    const unlistenNewTab = handlers.menuNewTab.listen(() => {
      setCommandPaletteOpen(true)
    })

    const unlistenTabSwitcher = handlers.tabSwitcher.listen(() => {
      // Only open if we have tabs to switch between
      if (recentTabs.length > 0) {
        setTabSwitcherOpen(true)
      }
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
          terminals,
          focusedProject,
          setTerminals,
          commandPaletteOpen,
          setCommandPaletteOpen,
          recentTabs,
          setRecentTabs,
          tabSwitcherOpen,
          setTabSwitcherOpen
        }}
      >
        <AppLayout />
      </AppContext.Provider>
    )
  }

  // Find the first terminal for the first project to set as focused
  const firstProject = devServersQuery.data[0]
  const firstProjectTerminals = initialTerminals.filter((t) => t.projectId === firstProject.cwd)

  // Update focused project now that we have running projects
  useEffect(() => {
    if (firstProject && !focusedProject) {
      setFocusedProject({
        focusedTerminalId:
          firstProjectTerminals.length > 0 ? firstProjectTerminals[0].terminalId : '',
        projectId: firstProject.cwd
      })
    }
  }, [firstProject, firstProjectTerminals])

  // Ensure at least one terminal exists per running project (auto-spawn)
  useEffect(() => {
    const run = async () => {
      try {
        const running = devServersQuery.data
        if (!Array.isArray(running) || running.length === 0) return

        const byProject: Record<string, number> = {}
        for (const t of terminals) byProject[t.projectId] = (byProject[t.projectId] || 0) + 1

        const missing = running
          .map((p) => p.cwd)
          .filter((cwd) => !byProject[cwd] && !creatingTerminalsRef.current.has(cwd))

        if (missing.length === 0) return

        missing.forEach((cwd) => creatingTerminalsRef.current.add(cwd))

        await Promise.all(
          missing.map(async (cwd) => {
            try {
              const created = await v2Client.terminalV2Create({ cwd })
              setTerminals((prev) => [...prev, { terminalId: created.id, projectId: cwd }])
              setFocusedProject((prev) => {
                if (!prev || prev.projectId === cwd) {
                  return { projectId: cwd, focusedTerminalId: created.id }
                }
                return prev
              })
            } catch {
            } finally {
              creatingTerminalsRef.current.delete(cwd)
            }
          })
        )
      } catch {}
    }

    run()
  }, [devServersQuery.data, terminals])

  // Ensure focused terminal is set if it's empty
  useEffect(() => {
    if (!focusedProject?.focusedTerminalId && terminals.length > 0) {
      const projectTerminals = terminals.filter((t) => t.projectId === focusedProject?.projectId)
      if (projectTerminals.length > 0) {
        // console.log('Setting focusedTerminalId via useEffect:', projectTerminals[0].terminalId)
        setFocusedProject((prev) => {
          if (!prev) return null
          return {
            ...prev,
            focusedTerminalId: projectTerminals[0].terminalId
          }
        })
      }
    }
  }, [terminals, focusedProject?.projectId, focusedProject?.focusedTerminalId])

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
        terminals, // should sync terminal state from server to restore
        focusedProject,
        setTerminals,
        commandPaletteOpen,
        setCommandPaletteOpen,
        recentTabs,
        setRecentTabs,
        tabSwitcherOpen,
        setTabSwitcherOpen
      }}
    >
      <AppLayout />
    </AppContext.Provider>
  )
}
