import { useMemo } from 'react'
import { RunningProject, ListneingProject } from '@shared/types'
import { useRunningProjects } from './use-running-projects'

export type GroupedProject = {
  cwd: string
  ports: Array<{
    port: number
    project: ListneingProject
  }>
  defaultPort: number
}

export function useGroupedProjects() {
  const runningProjects = useRunningProjects()

  const groupedProjects = useMemo(() => {
    if (!runningProjects.data) return []

    const groups = new Map<string, GroupedProject>()

    for (const project of runningProjects.data) {
      // Only include listening projects that have ports
      if (project.runningKind !== 'listening') continue

      const existing = groups.get(project.cwd)

      if (existing) {
        existing.ports.push({ port: project.port, project })
      } else {
        groups.set(project.cwd, {
          cwd: project.cwd,
          ports: [{ port: project.port, project }],
          defaultPort: project.port
        })
      }
    }

    return Array.from(groups.values()).map(group => ({
      ...group,
      ports: group.ports.sort((a, b) => a.port - b.port)
    }))
  }, [runningProjects.data])

  return {
    ...runningProjects,
    data: groupedProjects
  }
}