import { Project, StartingProject } from '../shared/types'

export type RendererHandlers = {
  terminalData: (payload: { id: string; data: string }) => void
  terminalExit: (payload: { id: string; exitCode: number; signal: number }) => void
  terminalTitleChanged: (payload: { id: string; title: string }) => void
  terminalV2Data: (payload: { id: string; data: string; seq: number }) => void
  terminalV2Exit: (payload: { id: string; exitCode: number; signal: number }) => void
  terminalV2TitleChanged: (payload: { id: string; title: string }) => void
  browserUrlChanged: (payload: { tabId: string; url: string }) => void
  terminalResize: (payload: { id: string; cols: number; rows: number }) => void
  menuNewTab: () => void
  menuNextItem: () => void
  menuPreviousItem: () => void
  menuSelectItem: () => void
  changeURL: () => void
  projectsFound: (payload: { projects: Project[] }) => void
  tabSwitcher: () => void
  onProjectStart: (project: StartingProject) => void
}
