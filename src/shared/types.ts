export type Project = {
  path: string
  name: string
  devScript: string
  packageManager: 'pnpm' | 'yarn' | 'npm' | 'bun' | 'unknown'
  workspaces: boolean
  tags: string[]
}


export type RunningProject = {
  port: number
  pid: number
  cwd: string
  kind: DevServerKind
}
export type DevServerKind = 'vite' | 'next' | 'webpack-dev-server' | 'unknown'