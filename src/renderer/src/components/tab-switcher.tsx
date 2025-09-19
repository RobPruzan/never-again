import { useState, useEffect, useCallback } from 'react'
// import { useAppContext } from './app-context'
import { handlers } from '../lib/tipc'
import { useQuery } from '@tanstack/react-query'
import { client } from '../lib/tipc'
import { useAppContext } from '@renderer/app-context'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'
import { deriveRunningProjectId, toFocusedProject } from '@renderer/lib/utils'
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

  const [selectedIndex, setSelectedIndex] = useState(0)

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
    setSelectedIndex(0)
  }, [setTabSwitcherOpen])

  useEffect(() => {
    if (tabSwitcherOpen) {
      setSelectedIndex(validRecentTabs.length > 1 ? 1 : 0)
    }
  }, [tabSwitcherOpen, validRecentTabs.length])
  const { winRef } = useWindowContext()

  useEffect(() => {
    if (!winRef.current || !tabSwitcherOpen) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      // TODO: these shortcuts should be in application menu, window handlers here are wrong
      if (event.key === 'Escape') {
        closeSwitcher()
      } else if (event.key === 'Enter') {
        const selectedProject = validRecentTabs[selectedIndex]
        if (selectedProject) {
          const projectId = deriveRunningProjectId(selectedProject)
          setRoute('webview')
          setFocusedProject((prev) => toFocusedProject(selectedProject))
          closeSwitcher()
        }
      } else if (event.key === 'Tab') {
        event.preventDefault()
        if (validRecentTabs.length === 0) return
        if (event.shiftKey) {
          setSelectedIndex((prev) => (prev - 1 + validRecentTabs.length) % validRecentTabs.length)
        } else {
          setSelectedIndex((prev) => (prev + 1) % validRecentTabs.length)
        }
      }
    }

    winRef.current.addEventListener('keydown', handleKeyDown)
    return () => {
      winRef.current?.removeEventListener('keydown', handleKeyDown)
    }
  }, [winRef, tabSwitcherOpen, selectedIndex, validRecentTabs])

  useEffect(() => {
    if (!tabSwitcherOpen) return
    if (validRecentTabs.length === 0) return
    setSelectedIndex((prev) => {
      if (prev < 0) return 0
      if (prev >= validRecentTabs.length) return validRecentTabs.length - 1
      return prev
    })
  }, [validRecentTabs.length, tabSwitcherOpen])
  console.log('im definitely rendered, window focused:', document.hasFocus())

  // const [shit, fuck] = useState('')
  if (!tabSwitcherOpen || validRecentTabs.length === 0) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60] pointer-events-none">
      <div className="bg-black rounded-xl border border-white/10 p-8 pointer-events-auto max-w-[1000px] shadow-2xl">
        <div className="flex items-center gap-6 flex-wrap justify-center">
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
                className={`flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer ${
                  isSelected ? 'bg-white/10' : ''
                } hover:bg-white/5`}
                onClick={() => {
                  setRoute('webview')
                  setFocusedProject((prev) => toFocusedProject(project))
                  closeSwitcher()
                }}
              >
                {/* Favicon */}
                <div
                  className={`w-20 h-20 flex items-center justify-center rounded-xl ${
                    isCurrent ? 'ring-2 ring-white/20' : ''
                  }`}
                >
                  {favicon ? (
                    <img src={favicon} alt="" className="w-16 h-16 rounded-xl" draggable={false} />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center">
                      <div className="w-8 h-8 rounded bg-white/20" />
                    </div>
                  )}
                </div>

                {/* Project name */}
                <div className="text-sm text-white/70 max-w-[120px] truncate">{projectName}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
