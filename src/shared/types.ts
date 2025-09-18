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
  // startingId: string // we really want this to map back but i dont want to do that rn but will need to, slightly tricky because we need to handle all cases even projects we didn't start or projects we fresh started
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