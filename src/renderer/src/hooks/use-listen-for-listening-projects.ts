import { handlers } from '@renderer/lib/tipc'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ListneingProject, RunningProject } from '@shared/types'

import { useAppContext } from '@renderer/app-context'
import { deriveRunningProjectId, iife } from '@renderer/lib/utils'
import { flushSync } from 'react-dom'

export const useListenForListeningProjects = () => {
  const queryClient = useQueryClient()
  const { focusedProject, setFocusedProject } = useAppContext()

  useEffect(() => {
    let isSubscribed = true
    
    const handler = (project: ListneingProject) => {
      if (!isSubscribed) return
      
      console.log('project recv', project)
      console.log('focused project', focusedProject)

      const prevData = queryClient.getQueryData(['devServers']) as Array<RunningProject> | undefined
      const newData = iife(() => {
        if (prevData?.some((p) => p.runningKind === 'listening' && p.port === project.port)) return prevData
        if (!prevData) return [project]
        
        // Remove any starting projects with the same cwd and add the new listening project
        const filteredData = prevData.filter((p) => !(p.runningKind === 'starting' && p.cwd === project.cwd))
        return [...filteredData, project]
      })

      queryClient.setQueryData(['devServers'], newData)

      if (focusedProject) {
        const isStartingProject = focusedProject.projectId.startsWith('starting')

        if (isStartingProject && project.cwd === focusedProject.projectCwd) {
          setFocusedProject({
            ...focusedProject,
            projectId: deriveRunningProjectId(project)
          })
        }
      }
    }

    const unlisten = handlers.onProjectListen.listen(handler)
    
    return () => {
      isSubscribed = false
      unlisten()
    }
  }, [focusedProject, setFocusedProject])
}
