import { useState, useEffect, useCallback } from 'react'
// import { useAppContext } from './app-context'
import { handlers } from '../lib/tipc'
import { useQuery } from '@tanstack/react-query'
import { client } from '../lib/tipc'
import { useAppContext } from '@renderer/app-context'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'
import { deriveRunningProjectId } from '@renderer/lib/utils'
import { RunningProject } from '@shared/types'
import { useWindowContext } from '@renderer/window-context'

const MAX_VISIBLE_TABS = 9 // Limit to prevent overflow

export const TabSwitcher = () => {
  const runningProjects = useRunningProjects().data
  const {
    setTabSwitcherOpen,
    recentTabs,
    setFocusedProject,
    focusedProject,
    tabSwitcherOpen,
    setRoute
  } = useAppContext()

  const [selectedIndex, setSelectedIndex] = useState(1)

  // use

  const faviconQueries = runningProjects.map((project) => ({
    project,
    query: useQuery({
      queryKey: ['project-favicon', project.cwd],
      queryFn: () => client.getProjectFavicon({ projectPath: project.cwd }),
      staleTime: 60_000,
      gcTime: 5 * 60_000
    })
  }))

  const getFavicon = (project: RunningProject) => {
    const query = faviconQueries.find((q) => q.project.cwd === project.cwd)
    const faviconData = query?.query.data
    return faviconData?.found ? faviconData.dataUrl : null
  }

  const validRecentTabs = recentTabs
    .map((tabId) => runningProjects.find((p) => deriveRunningProjectId(p) === tabId))
    .filter((project): project is RunningProject => project !== undefined)
    .slice(0, MAX_VISIBLE_TABS)

  const closeSwitcher = useCallback(() => {
    setTabSwitcherOpen(false)
    window.api?.portal?.close('tab-switcher')
    setSelectedIndex(1)
  }, [setTabSwitcherOpen])

  useEffect(() => {
    if (tabSwitcherOpen) {
      setSelectedIndex(1)
    }
  }, [tabSwitcherOpen])
  const { winRef } = useWindowContext()

  useEffect(() => {
    if (!winRef.current) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      console.log('keydown', event)

      if (event.key === 'Escape') {
        closeSwitcher()
        console.log('closing switcher pls')
      } else if (event.key === 'Enter') {
        const selectedProject = validRecentTabs[selectedIndex]
        if (selectedProject) {
          const projectId = deriveRunningProjectId(selectedProject)
          setRoute('webview')
          setFocusedProject((prev) => ({
            projectId: projectId,
            projectCwd: selectedProject.cwd,
            focusedTerminalId: prev?.focusedTerminalId || ''
          }))
          closeSwitcher()
        }
      }
    }

    if (winRef.current) {
      winRef.current.addEventListener('keydown', handleKeyDown)
      return () => {
        winRef.current?.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [])
  console.log('im definitely rendered, window focused:', document.hasFocus())

  // const [shit, fuck] = useState('')
  if (!tabSwitcherOpen || validRecentTabs.length === 0) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60] pointer-events-none">
      <div className="bg-black/95 rounded-lg border border-white/10 p-4 pointer-events-auto max-w-[600px]">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {/* <input
            ref={(ref) => ref?.focus()}
            placeholder="heya"
            className="text-white"
            value={shit}
            onChange={(e) => fuck(e.target.value)}
          /> */}
          {validRecentTabs.map((project, index) => {
            const projectId = deriveRunningProjectId(project)
            const projectName = project.cwd.split('/').pop() || project.cwd
            const favicon = getFavicon(project)
            const isSelected = index === selectedIndex
            const isCurrent = projectId === focusedProject?.projectId

            return (
              <div
                key={projectId}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer ${
                  isSelected ? 'bg-white/10' : ''
                } hover:bg-white/5`}
                onClick={() => {
                  setRoute('webview')
                  setFocusedProject((prev) => ({
                    projectId: projectId,
                    projectCwd: project.cwd,
                    focusedTerminalId: prev?.focusedTerminalId || ''
                  }))
                  closeSwitcher()
                }}
              >
                {/* Favicon */}
                <div
                  className={`w-12 h-12 flex items-center justify-center rounded-lg ${
                    isCurrent ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  {favicon ? (
                    <img src={favicon} alt="" className="w-10 h-10 rounded-lg" draggable={false} />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                      <div className="w-5 h-5 rounded bg-white/20" />
                    </div>
                  )}
                </div>

                {/* Project name */}
                <div className="text-[10px] text-white/60 max-w-[60px] truncate">{projectName}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
