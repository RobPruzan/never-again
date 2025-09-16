import { Project, RunningProject } from '@shared/types'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Terminal } from '@xterm/xterm'
import { createContext, Dispatch, SetStateAction, useContext } from 'react'
import { client } from './lib/tipc'
import { useRunningProjects } from './hooks/use-running-projects'

type ProjectID = string
// export type RunningProject = {
//   projectId: ProjectID
//   cwd: string
//   port: number
//   name: string
// }
export type FocusedProject = {
  projectId: ProjectID
  focusedTerminalId: string
}

export type TerminalInstance = {
  terminalId: string
  projectId: string
}
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
  console.log('running projecst query', runningProjectsQuery)
  console.log('focused project', focusedProject)

  const project = runningProjectsQuery.data.find(
    (project) => project.cwd === focusedProject?.projectId
  )
  if (!project) {
    throw new Error('invariant tried to focus a non existent project')
  }

  return { ...project, focusedTerminalId: focusedProject?.focusedTerminalId }
}
