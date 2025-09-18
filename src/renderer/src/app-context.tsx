import { ListneingProject, LogsObj, Project, RunningProject } from '@shared/types'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Terminal } from '@xterm/xterm'
import { createContext, Dispatch, SetStateAction, useContext } from 'react'
import { client } from './lib/tipc'
import { useRunningProjects } from './hooks/use-running-projects'
import { deriveRunningProjectId, toFocusedProject } from './lib/utils'

type ProjectID = string
export type FocusedProject =
  | {
      projectId: ProjectID
      projectCwd: string // denormalized ref to the parent
      runningKind: 'starting'
    }
  | {
      runningKind: 'listening'
      projectId: ProjectID
      projectCwd: string // denormalized ref to the parent
      port: number
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

export const useFocusedProject = (): RunningProject | null => {
  const { focusedProject, setFocusedProject, route } = useAppContext()

  const runningProjectsQuery = useRunningProjects()
  if (!focusedProject) {
    return null
  }

  const project = runningProjectsQuery.data.find(
    (project) => deriveRunningProjectId(project) === focusedProject?.projectId
  )
  if (project) {
    return project
  }

  // console.log('focused', focusedProject)
  // console.log('running', runningProjectsQuery.data)

  if (!project && route !== 'home') {
    // if there is an unmatched starting project that maps to
    // valid invariant case: what if there is already one up and you are picking between 2
    // no, u will never try to create a project when there is one up for now in this flow
    // in the future you might which will be icky, can rethink it then don't need to prefire rn

    // the preference to this would be to indicate you want the starting project
    // and then you programatically listen for an event from the server when the
    // exact moment the server starts, but we can't time that we just poll so its fundamentally a race
    // so this is really the only good non effect solution i can think of which i think is fine
    // the worst part is matching the id with a string which can change and will likely cause a bug
    const isStartingProject = focusedProject.runningKind === 'starting'
    const listeningProjects = runningProjectsQuery.data.filter(
      (project): project is Extract<typeof project, { runningKind: 'listening' }> =>
        project.runningKind === 'listening' && project.cwd === focusedProject.projectCwd
    )

    if (isStartingProject && listeningProjects.length > 0) {
      if (listeningProjects.length > 1) {
        throw new Error('invariant: multiple listening projects with same cwd')
      }

      const listeningProject = listeningProjects.reduce((lowest, current) => {
        return current.port < lowest.port ? current : lowest
      })
      const newFocusedProject = {
        ...focusedProject,
        projectId: deriveRunningProjectId(listeningProject)
      }
      setFocusedProject(newFocusedProject)
      return listeningProject
    }

    /**
     * there is a case where we set a project, and it dissapears, we shuld be listening to that destroy, and reacting
     * to it cleanly, gr
     *
     * we dont have a destroy event, and we can't reliably track that without polling
     *
     * we could do this on the server, but we're already polling on the client so we can just keep doing that
     *
     * maybe we want to derive the polling from the server and listen to that, TBD
     *
     *
     * for now we will just handle the ugly sync, the case is
     *
     * - if we are focused on a project cwd
     * - and the port no longer exists
     * - and we are focused on a running project
     * - the running project port no longer exists FUCK
     * - then we want to switch to any other project with the same cwd, preference to one already running, preference to the one with the lower port
     *
     *
     */

    const projectsWithSameCwd = runningProjectsQuery.data.filter(
      (project) => project.cwd === focusedProject.projectCwd
    )

    if (projectsWithSameCwd.length > 0) {
      const listeningProjects = projectsWithSameCwd.filter((p) => p.runningKind === 'listening')
      const startingProjects = projectsWithSameCwd.filter((p) => p.runningKind === 'starting')

      let newFocusedProject: typeof focusedProject
      let projectUsed: RunningProject

      if (listeningProjects.length > 0) {
        const projectWithLowestPort = listeningProjects.reduce((lowest, current) =>
          current.port < lowest.port ? current : lowest
        )
        newFocusedProject = toFocusedProject(projectWithLowestPort)
        projectUsed = projectWithLowestPort
      } else {
        newFocusedProject = toFocusedProject(startingProjects[0])
        projectUsed = startingProjects[0]
      }

      setFocusedProject(newFocusedProject)
      return projectUsed
    }

    // const oldProject = runningProjectsQuery.data.find(
    //   (project) => deriveRunningProjectId({
    //     ...project,
    //     runningKind: 'starting'
    //   }) === focusedProject?.projectId
    // )
  }
  throw new Error('invariant tried to focus a non existent project')
}
