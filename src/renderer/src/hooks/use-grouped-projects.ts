import { useMemo } from 'react'
import { RunningProject, ListneingProject } from '@shared/types'
import { useRunningProjects } from './use-running-projects'
import { iife } from '@renderer/lib/utils'

export type GroupedProject = {}

export function useGroupedProjects() {
  const runningProjects = useRunningProjects()
  const groupedProjects = iife(() => {
    if (!runningProjects.data) return []
    const groups = new Map<string, GroupedProject>()

    for (const project of runningProjects.data) {
    }
    return null!
  })

  return {
    ...runningProjects,
    data: groupedProjects
  }
}
