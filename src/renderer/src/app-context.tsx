import { Project, RunningProject } from '@shared/types'
import { Terminal } from '@xterm/xterm'
import { createContext, Dispatch, SetStateAction, useContext } from 'react'

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
  runningProjects: Array<RunningProject>
  projects: Array<Project>
  setProjects: Dispatch<SetStateAction<Project[]>>
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
  const { focusedProject, runningProjects } = useAppContext()
  if (!focusedProject) {
    return null
  }
  const project = runningProjects.find((project) => project.cwd === focusedProject?.projectId)

  return { ...project, focusedTerminalId: focusedProject?.focusedTerminalId }
}
