import { Project, RunningProject } from '@shared/types'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Terminal } from '@xterm/xterm'
import { createContext, Dispatch, SetStateAction, useContext } from 'react'
import { client } from './lib/tipc'
import { useRunningProjects } from './hooks/use-running-projects'
import { deriveRunningProjectId } from './lib/utils'

type ProjectID = string
export type FocusedProject = {
  projectId: ProjectID
  focusedTerminalId: string
  projectCwd: string // denormalized ref to the parent
}

export type TerminalInstance = {
  terminalId: string
  projectId: string
}

/**
 *
 * we will need to store some state for port, i think, gonna do that later because its influential and also may be wrong
 */
export const AppContext = createContext<{
  route: 'home' | 'webview'
  setRoute: Dispatch<SetStateAction<'home' | 'webview'>>
  // todo: remove project state derive directly from react query
  focusedProject: FocusedProject | null
  setFocusedProject: Dispatch<SetStateAction<FocusedProject | null>>
  terminals: Array<TerminalInstance>
  setTerminals: Dispatch<SetStateAction<TerminalInstance[]>>
  commandPaletteOpen: boolean
  setCommandPaletteOpen: Dispatch<SetStateAction<boolean>>
  recentTabs: string[] // Array of project IDs in order of recency
  setRecentTabs: Dispatch<SetStateAction<string[]>>
  tabSwitcherOpen: boolean
  setTabSwitcherOpen: Dispatch<SetStateAction<boolean>>
}>(null!)

export const useAppContext = () => useContext(AppContext)

export const useFocusedProject = () => {
  const { focusedProject } = useAppContext()
  
  const runningProjectsQuery = useRunningProjects()
  if (!focusedProject) {
    return null
  }
  console.log('running projecst query', runningProjectsQuery.data)
  console.log('focused project', focusedProject)

  const project = runningProjectsQuery.data.find(
    (project) => deriveRunningProjectId(project) === focusedProject?.projectId
  )
  if (!project) {
    throw new Error('invariant tried to focus a non existent project')
  }

  return { ...project, focusedTerminalId: focusedProject?.focusedTerminalId }
}
