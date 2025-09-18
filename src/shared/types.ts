export type Project = {
  path: string
  name: string
  devScript: string
  packageManager: 'pnpm' | 'yarn' | 'npm' | 'bun' | 'unknown'
  workspaces: boolean
  tags: string[]
}

export type ListneingProject = {
  runningKind: 'listening'
  port: number
  pid: number
  cwd: string
  kind: DevServerKind
}

export type StartingProject = {
  runningKind: 'starting'
  cwd:string 
  pid: number
  kind: DevServerKind
  startingId: string
}

export type RunningProject = ListneingProject | StartingProject
export type DevServerKind = 'vite' | 'next' | 'webpack-dev-server' | 'unknown'

export type LogsObj = {
  startingLogs: Record<string, Array<string>>
  runningProjectsLogs: Record<number, Array<string>>
  startingToRunning: Record<string, number>
}