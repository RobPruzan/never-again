import { createContext } from 'react'
export type Project = {
  projectId: string
  url: string
}

export const ProjectContext = createContext<Project>(null!)
// fuck you
