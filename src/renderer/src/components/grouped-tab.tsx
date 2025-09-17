import { GroupedProject } from '@renderer/hooks/use-grouped-projects'
import React from 'react'
import { BrowserTab } from './browser-tab'
import { cn, deriveRunningProjectId } from '@renderer/lib/utils'
import { useAppContext, useFocusedProject } from '@renderer/app-context'

export const GroupedTab = ({ groupedProject }: { groupedProject: GroupedProject }) => {
  console.log('our grouped proejcts', groupedProject.projects)

  return (
    <div
      className={cn(['h-full min-w-fit flex', groupedProject.projects.length > 1 && 'border-blue-500 border-2'])}
    >
      {groupedProject.projects.map((project) => (
        <React.Fragment key={deriveRunningProjectId(project)}>
          <BrowserTab projectId={deriveRunningProjectId(project)}>
            {groupedProject.projects.length > 1 && project.runningKind === 'listening' && (
              <span>:{project.port}</span>
            )}
          </BrowserTab>
        </React.Fragment>
      ))}
    </div>
  )
}
