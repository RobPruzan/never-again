import { ListneingProject, ProcessLogsMapping, Project, RunningProject } from '@shared/types'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Terminal } from '@xterm/xterm'
import { createContext, Dispatch, SetStateAction, useContext } from 'react'
import { client } from './lib/tipc'
import { useRunningProjects } from './hooks/use-running-projects'
import { deriveRunningProjectId, toFocusedProject } from './lib/utils'
import { flushSync } from 'react-dom'

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
  const { focusedProject, setFocusedProject, route, setRoute } = useAppContext()

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
      // this is not an invariant but maybe concerning
      // if (listeningProjects.length > 1) {
      //   throw new Error('invariant: multiple listening projects with same cwd')
      // }

      const listeningProject = listeningProjects.reduce((lowest, current) => {
        return current.port < lowest.port ? current : lowest
      })
      const newFocusedProject: FocusedProject = {
        projectId: deriveRunningProjectId(listeningProject),
        runningKind: 'listening',
        port: listeningProject.port,
        projectCwd: listeningProject.cwd
      }
      // flushSync(() => {
      console.log('setting to first call')
      console.table(newFocusedProject)

      setFocusedProject(newFocusedProject)
      // })
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

    const isSyncNeeded =
      focusedProject.runningKind === 'listening' &&
      !listeningProjects.some((p) => p.port === focusedProject.port)

    if (isSyncNeeded) {
      const projectWithSameCwd = runningProjectsQuery.data.find(
        (p) => p.cwd === focusedProject.projectCwd
      )
      if (projectWithSameCwd) {
        setFocusedProject(toFocusedProject(projectWithSameCwd))
        return projectWithSameCwd
      } else {
        // we should tell the user something, ideally, this means that the project got destroyed behind the scenes
        // really the user would want a button to click "restart and not do what we're doing now", but that's a todo
        console.log('set route home 1')

        setRoute('home')
        return null
      }
    } else if (focusedProject.runningKind === 'starting') {
      const projectWithSameCwd = runningProjectsQuery.data.find(
        (p) => p.cwd === focusedProject.projectCwd
      )

      if (!projectWithSameCwd) {
        // this is a destroy case, same as below, we should have ui for this case but too lazy will do that when i fix this monstrosity of a hook
        console.log(
          'set route home 2, we did it because there is no project mapping to this foucsed project',
          focusedProject,
          runningProjectsQuery.data
        )
        setFocusedProject(null)

        setRoute('home')
        return null
      }
      return projectWithSameCwd
    } else {
      const associatedProject = runningProjectsQuery.data.find(
        (p) => deriveRunningProjectId(p) === focusedProject.projectId
      )
      if (!associatedProject) {
        throw new Error(
          'invariant we just said this project exists, since sync is not needed and its listening'
        )
      }
      // then we don't need to setState in render and we're fine, this __should__ be base case
      return associatedProject
    }

    // if (projectsWithSameCwd.length > 0) {
    //   const listeningProjects = projectsWithSameCwd.filter((p) => p.runningKind === 'listening')
    //   const startingProjects = projectsWithSameCwd.filter((p) => p.runningKind === 'starting')

    //   let newFocusedProject: typeof focusedProject
    //   let projectUsed: RunningProject

    //   if (listeningProjects.length > 0) {
    //     const projectWithLowestPort = listeningProjects.reduce((lowest, current) =>
    //       current.port < lowest.port ? current : lowest
    //     )
    //     newFocusedProject = toFocusedProject(projectWithLowestPort)
    //     projectUsed = projectWithLowestPort
    //   } else {
    //     newFocusedProject = toFocusedProject(startingProjects[0])
    //     projectUsed = startingProjects[0]
    //   }

    //   console.log('setting to second call');
    //   console.table(newFocusedProject)
    //   // flushSync(() => {
    //   setFocusedProject(newFocusedProject)
    //   // })
    //   return projectUsed
    // }

    // const oldProject = runningProjectsQuery.data.find(
    //   (project) => deriveRunningProjectId({
    //     ...project,
    //     runningKind: 'starting'
    //   }) === focusedProject?.projectId
    // )
  }
  throw new Error('invariant tried to focus a non existent project')
}
