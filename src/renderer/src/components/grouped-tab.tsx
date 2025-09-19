import { GroupedProject } from '@renderer/hooks/use-grouped-projects'
import React from 'react'
import { BrowserTab } from './browser-tab'
import { cn, deriveRunningProjectId } from '@renderer/lib/utils'
import { useAppContext } from '@renderer/app-context'

export const GroupedTab = ({ groupedProject }: { groupedProject: GroupedProject }) => {
  const { focusedProject, route } = useAppContext()

  const sortedProjects = React.useMemo(() => {
    const copy = [...groupedProject.projects]
    copy.sort((a, b) => {
      if (a.runningKind !== b.runningKind) {
        if (a.runningKind === 'starting') return -1
        if (b.runningKind === 'starting') return 1
      }
      if (a.runningKind === 'listening' && b.runningKind === 'listening') {
        return a.port - b.port
      }
      return 0
    })
    return copy
  }, [groupedProject.projects])

  const activeProjectId = focusedProject?.projectId ?? null
  const isGroupActive =
    route === 'webview' &&
    !!activeProjectId &&
    sortedProjects.some((p) => deriveRunningProjectId(p) === activeProjectId)

  const isGrouped = sortedProjects.length > 1
  const groupLabel = groupedProject.cwdGroup.split('/').pop() || groupedProject.cwdGroup

  if (!isGrouped) {
    const onlyProject = sortedProjects[0]
    return <BrowserTab projectId={deriveRunningProjectId(onlyProject)} />
  }

  return (
    <div
      className={cn(
        'h-full min-w-fit flex items-stretch relative overflow-hidden',
        isGrouped && (isGroupActive ? 'border-x border-gray-600' : 'border-x border-[#1A1A1A]')
      )}
      title={`${groupLabel} (${sortedProjects.length})`}
      data-group-size={sortedProjects.length}
      data-cwd={groupedProject.cwdGroup}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {sortedProjects.map((project) => (
        <React.Fragment key={deriveRunningProjectId(project)}>
          <BrowserTab projectId={deriveRunningProjectId(project)}>

            <span className="text-xs ml-auto text-gray-500 ">
              {project.runningKind === 'listening' && <span>:{project.port}</span>}
            </span>
          </BrowserTab>
        </React.Fragment>
      ))}
    </div>
  )
}
