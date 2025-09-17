// import { BrowserTab } from './BrowserTab'
import { HomeIcon, Loader2, Plus } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
// import { useAppContext } from './app-context'
import { client } from '@renderer/lib/tipc'
import { Button } from './ui/button'
import { cn } from '@renderer/lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppContext } from '@renderer/app-context'
import { BrowserTab } from './browser-tab'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'
import { useCreateProjectMutation } from '@renderer/hooks/use-create-project-mutation'
import { useGroupedProjects } from '@renderer/hooks/use-grouped-projects'
import { GroupedTab } from './grouped-tab'

interface Tab {
  id: string
  url: string
  title: string
  port?: string
  cwd?: string
}

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
  onHomeClick?: () => void
  isHomeActive?: boolean
}

export function TabBar() {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  // same issue, this should be grouped projects we map over the wrong item and are really creating the wrong item all together
  const runningProjects = useRunningProjects().data

  const groupedProjects = useGroupedProjects()
  const { setRoute, setFocusedProject, route } = useAppContext()

  const createProjectMutation = useCreateProjectMutation()
  const showSpinner = useMinTimeSpinner({ createProjectMutation })

  return (
    <div
      className="flex items-center bg-[#0A0A0A] border-b border-[#1A1A1A] overflow-x-auto max-w-[calc(100vw-50px)]"
      style={
        {
          height: '36px',
          WebkitAppRegion: 'drag',
          paddingLeft: isMac ? '30px' : '0'
        } as React.CSSProperties
      }
    >
      <div
        className="flex h-full overflow-x-auto"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <React.Fragment key="home">
          <Button
            onClick={async () => {
              setRoute('home')
              setFocusedProject(null)
            }}
            variant="ghost"
            size="icon"
            className={cn(
              'h-full px-4 text-gray-500 hover:bg-[#0F0F0F] hover:text-gray-300 border-l border-[#1A1A1A] rounded-none',
              {
                'bg-[#1A1A1A] text-gray-200 hover:bg-[#1A1A1A] hover:text-gray-200':
                  route === 'home',
                'bg-[#0A0A0A]': route !== 'home'
              }
            )}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            title="Home"
          >
            <HomeIcon className="w-4 h-4" />
          </Button>
        </React.Fragment>
        {groupedProjects.map((groupedProject) => (
          <GroupedTab key={groupedProject.cwdGroup} groupedProject={groupedProject} />
        ))}
      </div>
      <button
        onClick={async () => {
          const start = performance.now()
          await createProjectMutation.mutate()

          console.log('end', performance.now() - start, 'ms')
        }}
        className="h-full px-4 hover:bg-[#0F0F0F] text-gray-500 hover:text-gray-300 border-l border-[#1A1A1A] "
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title="New Tab"
      >
        {createProjectMutation.isPending && showSpinner ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
      </button>
    </div>
  )
}

export const useMinTimeSpinner = ({
  createProjectMutation
}: {
  createProjectMutation: ReturnType<typeof useCreateProjectMutation>
}) => {
  const [showSpinner, setShowSpinner] = useState(false)
  const spinnerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevPending = useRef(false)

  useEffect(() => {
    if (createProjectMutation.isPending && !prevPending.current) {
      spinnerTimeout.current = setTimeout(() => {
        setShowSpinner(true)
      }, 50)
    }
    if (!createProjectMutation.isPending && prevPending.current) {
      setShowSpinner(false)
      if (spinnerTimeout.current) {
        clearTimeout(spinnerTimeout.current)
        spinnerTimeout.current = null
      }
    }
    prevPending.current = createProjectMutation.isPending
    return () => {
      if (spinnerTimeout.current) {
        clearTimeout(spinnerTimeout.current)
        spinnerTimeout.current = null
      }
    }
  }, [createProjectMutation.isPending])

  return showSpinner
}
