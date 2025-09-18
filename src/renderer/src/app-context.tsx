import { LogsObj, Project, RunningProject } from '@shared/types'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Terminal } from '@xterm/xterm'
import { createContext, Dispatch, SetStateAction, useContext } from 'react'
import { client } from './lib/tipc'
import { useRunningProjects } from './hooks/use-running-projects'
import { deriveRunningProjectId } from './lib/utils'

type ProjectID = string
export type FocusedProject = {
  projectId: ProjectID
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
  commandPaletteOpen: boolean
  setCommandPaletteOpen: Dispatch<SetStateAction<boolean>>
  recentTabs: string[] // Array of project IDs in order of recency
  setRecentTabs: Dispatch<SetStateAction<string[]>>
  tabSwitcherOpen: boolean
  setTabSwitcherOpen: Dispatch<SetStateAction<boolean>>
  swappableSidebarOpen: boolean
  setSwappableSidebarOpen: Dispatch<SetStateAction<boolean>>

}>(null!)

export const useAppContext = () => useContext(AppContext)

export const useFocusedProject = () => {
  const { focusedProject, setFocusedProject } = useAppContext()

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
    // if there is an unmatched starting project that maps to
    // valid invariant case: what if there is already one up and you are picking between 2
    // no, u will never try to create a project when there is one up for now in this flow
    // in the future you might which will be icky, can rethink it then don't need to prefire rn

    // the preference to this would be to indicate you want the starting project
    // and then you programatically listen for an event from the server when the
    // exact moment the server starts, but we can't time that we just poll so its fundamentally a race
    // so this is really the only good non effect solution i can think of which i think is fine
    // the worst part is matching the id with a string which can change and will likely cause a bug
    const isStartingProject = focusedProject.projectId.startsWith('starting')
    const listeningProjects = runningProjectsQuery.data.filter(
      (project) => project.runningKind === 'listening' && project.cwd === focusedProject.projectCwd
    )

    if (isStartingProject && listeningProjects.length > 0) {
      if (listeningProjects.length > 1) {
        throw new Error('invariant: multiple listening projects with same cwd')
      }

      const listeningProject = listeningProjects[0]
      setFocusedProject({
        ...focusedProject,
        projectId: deriveRunningProjectId(listeningProject)
      })
      return
    }

    // const oldProject = runningProjectsQuery.data.find(
    //   (project) => deriveRunningProjectId({
    //     ...project,
    //     runningKind: 'starting'
    //   }) === focusedProject?.projectId
    // )

    throw new Error('invariant tried to focus a non existent project')
  }

  return { ...project,  }
}
