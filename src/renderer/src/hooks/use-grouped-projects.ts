import { useMemo } from 'react'
import { RunningProject, ListneingProject } from '@shared/types'
import { useRunningProjects } from './use-running-projects'
import { iife } from '@renderer/lib/utils'

// do need a created/started at or something to be able to sort here
export type GroupedProject = {
  cwdGroup: string
  projects: Array<RunningProject>
}

export function useGroupedProjects() {
  const runningProjects = useRunningProjects()
  // console.log('running projects', runningProjects.data)

  const groupedProjects = iife(() => {
    const groups = new Map<string, GroupedProject>()

    runningProjects.data.forEach((project) => {
      /**
       * what is the starting project case?
       *
       * when we're starting we should be able to open the tab (wait, that's handled), right so grouped project
       * is just a pure wrapper over runningproject and then we use the same handler to handle the starting project case
       *
       *
       * okay that's fine
       */

      const existing = groups.get(project.cwd)

      if (!existing) {
        const newItem: GroupedProject = {
          cwdGroup: project.cwd,
          projects: [project]
        }

        groups.set(project.cwd, newItem)
        return
      }

      existing.projects.push(project)
    })
    return [...groups.values()]
  })

  return groupedProjects
}
