import { useState, useEffect, useCallback } from 'react'
// import { useAppContext } from './app-context'
import { handlers } from '../lib/tipc'
import { useQuery } from '@tanstack/react-query'
import { client } from '../lib/tipc'
import { useAppContext } from '@renderer/app-context'

const MAX_VISIBLE_TABS = 9 // Limit to prevent overflow

export const TabSwitcher = () => {
  const {
    setTabSwitcherOpen,
    recentTabs,
    runningProjects,
    setFocusedProject,
    focusedProject,
    tabSwitcherOpen
  } = useAppContext()

  const [selectedIndex, setSelectedIndex] = useState(1)

  // Fetch favicons for all projects
  const faviconQueries = runningProjects.map((project) => ({
    project,
    query: useQuery({
      queryKey: ['project-favicon', project.cwd],
      queryFn: () => client.getProjectFavicon({ projectPath: project.cwd }),
      staleTime: 60_000,
      gcTime: 5 * 60_000
    })
  }))

  // Get favicon for a project
  const getFavicon = (projectId: string) => {
    const query = faviconQueries.find((q) => q.project.cwd === projectId)
    const faviconData = query?.query.data
    return faviconData?.found ? faviconData.dataUrl : null
  }

  // Filter recent tabs to only include running projects and limit count
  const validRecentTabs = recentTabs
    .filter((tabId) => runningProjects.some((p) => p.cwd === tabId))
    .slice(0, MAX_VISIBLE_TABS)

  // Close the switcher and portal
  const closeSwitcher = useCallback(() => {
    setTabSwitcherOpen(false)
    window.api?.portal?.close('tab-switcher')
    setSelectedIndex(1)
  }, [setTabSwitcherOpen])

  // Switch to selected tab
  const switchToSelectedTab = useCallback(() => {
    if (validRecentTabs.length > selectedIndex) {
      const targetProjectId = validRecentTabs[selectedIndex]
      setFocusedProject((prev) => ({
        projectId: targetProjectId,
        focusedTerminalId: prev?.focusedTerminalId || ''
      }))
    }
    closeSwitcher()
  }, [validRecentTabs, selectedIndex, setFocusedProject, closeSwitcher])

  // Reset selected index when opened
  useEffect(() => {
    if (tabSwitcherOpen) {
      setSelectedIndex(1) // Start at previous tab
    }
  }, [tabSwitcherOpen])

  // Handle keyboard navigation when open
  useEffect(() => {
    if (!tabSwitcherOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && e.ctrlKey) {
        e.preventDefault()
        if (e.shiftKey) {
          // Backwards
          setSelectedIndex((prev) => {
            const newIndex = prev - 1
            return newIndex < 0 ? validRecentTabs.length - 1 : newIndex
          })
        } else {
          // Forwards
          setSelectedIndex((prev) => {
            const newIndex = prev + 1
            return newIndex >= validRecentTabs.length ? 0 : newIndex
          })
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        switchToSelectedTab()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeSwitcher()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      // Close when Ctrl is released (check both left and right control)
      if (e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
        if (tabSwitcherOpen) {
          console.log('Control released, switching to tab')
          switchToSelectedTab()
        }
      }
    }

    // Use capture phase to ensure we get the event
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [tabSwitcherOpen, switchToSelectedTab, validRecentTabs.length])

  // Don't render if not open or no recent tabs to switch between
  if (!tabSwitcherOpen || validRecentTabs.length === 0) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60] pointer-events-none">
      <div className="bg-black/95 rounded-lg border border-white/10 p-4 pointer-events-auto max-w-[600px]">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {validRecentTabs.map((tabId, index) => {
            const project = runningProjects.find((p) => p.cwd === tabId)
            if (!project) return null

            const projectName = project.cwd.split('/').pop() || project.cwd
            const favicon = getFavicon(tabId)
            const isSelected = index === selectedIndex
            const isCurrent = tabId === focusedProject?.projectId

            return (
              <div
                key={tabId}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer ${
                  isSelected ? 'bg-white/10' : ''
                } hover:bg-white/5`}
                onClick={() => {
                  setFocusedProject((prev) => ({
                    projectId: tabId,
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
