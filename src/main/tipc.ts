import { getRendererHandlers, RendererHandlersCaller, tipc } from '@egoist/tipc/main'
import type { PortsManager } from './ports-manager'
// import type { TerminalManager } from './terminal-manager-v2'
import { TerminalManagerV2 } from './terminal-manager-v2'
import { BrowserController } from './browser-controller'
import {
  ensuredListeningProjects,
  mainWindow,
  portalViews,
  startingProjects,
  startProjectIndexing
} from './index'
import path, { join, resolve } from 'path'
import { homedir } from 'os'
import { access as fsAccess, readFile, readdir, appendFile, writeFile } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { ListneingProject, Project, RunningProject, StartingProject } from '../shared/types'
// import { resolveProjectFavicon } from './utils/favicon'
import { DevRelayService } from './dev-relay-service'
import { detectDevServersForDir } from './dev-server-detector'
import { setTimeout as delay } from 'timers/promises'
import { ProjectBufferService } from './project-buffer-service'
import { exec } from 'child_process'
import { promisify } from 'util'
import { findProjectsBFS } from '../utility/index-projects'
import { resolveProjectFavicon } from './utilts/favicon'
import { RendererHandlers } from './renderer-handlers'

export const writeToStitchedLog = async (data: any) => {
  const logPath = '/Users/robby/ide/src/main/stitched-lop.jsonl'
  const jsonLine = JSON.stringify(data) + '\n'
  await appendFile(logPath, jsonLine)
}
const logToFile = async (message: any) => {
  const logFile = join(process.cwd(), 'log.txt')
  const safeStringify = (obj: any) => {
    const seen = new Set()
    return JSON.stringify(
      obj,
      (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]'
          }
          seen.add(value)
        }
        return value
      },
      2
    )
  }
  await appendFile(logFile, safeStringify(message) + '\n')
}

// Workspace storage helpers
type WorkspaceRecord = {
  id: string
  label: string
}
type WorkspacesFile = {
  workspaces: WorkspaceRecord[]
  assignments: Record<string, string[]> // workspaceId -> projectPath[]
}

const workspacesFilePath = join(process.cwd(), 'workspaces.json')

async function loadWorkspaces(): Promise<WorkspacesFile> {
  try {
    const content = await readFile(workspacesFilePath, 'utf8')
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid')
    return {
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      assignments:
        parsed.assignments && typeof parsed.assignments === 'object' ? parsed.assignments : {}
    }
  } catch {
    return { workspaces: [], assignments: {} }
  }
}

async function saveWorkspaces(data: WorkspacesFile): Promise<void> {
  const serialized = JSON.stringify(data, null, 2)
  await writeFile(workspacesFilePath, serialized, 'utf8')
}

function createWorkspaceId(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s_]+/g, '')
    .replace(/[\s_]+/g, '-')
    .slice(0, 40)
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${slug || 'workspace'}-${suffix}`
}

const killProcess = async (pid: number) => {
  try {
    console.log('killing pid', pid)
    await execAsync(`kill -9 ${pid}`)
    console.log(`Successfully killed process: ${pid}`)
  } catch (error: any) {
    console.error(`Error killing process: ${pid}:`, error.message)
    throw error
  }
}

const execAsync = promisify(exec)

const t = tipc.create()

export const createRouter = ({
  // portsManager,
  browser,
  terminalManager,
  devRelayService,
  bufferService,
  handlers
}: {
  // portsManager: PortsManager
  browser: BrowserController
  terminalManager: TerminalManagerV2
  bufferService: ProjectBufferService
  handlers: RendererHandlersCaller<RendererHandlers>

  devRelayService: DevRelayService
}) => ({
  writeToStitchedLog: t.procedure.input<any>().action(async ({ input }) => {
    await writeToStitchedLog(input)
  }),
  getProcessLogsMapping: t.procedure.action(async () => {
    return devRelayService.processLogsMapping
  }),

  getWorkspaces: t.procedure.action(async () => {
    return loadWorkspaces()
  }),
  createWorkspace: t.procedure.input<{ label: string }>().action(async ({ input }) => {
    const data = await loadWorkspaces()
    const id = createWorkspaceId(input.label)
    const ws: WorkspaceRecord = { id, label: input.label }
    data.workspaces.push(ws)
    if (!data.assignments[id]) data.assignments[id] = []
    await saveWorkspaces(data)
    return { workspace: ws }
  }),
  renameWorkspace: t.procedure.input<{ id: string; label: string }>().action(async ({ input }) => {
    const data = await loadWorkspaces()
    const ws = data.workspaces.find((w) => w.id === input.id)
    if (!ws) throw new Error('Workspace not found')
    ws.label = input.label
    await saveWorkspaces(data)
    return { workspace: ws }
  }),
  deleteWorkspace: t.procedure.input<{ id: string }>().action(async ({ input }) => {
    const data = await loadWorkspaces()
    data.workspaces = data.workspaces.filter((w) => w.id !== input.id)
    delete data.assignments[input.id]
    await saveWorkspaces(data)
    return { ok: true as const }
  }),
  assignProjectToWorkspace: t.procedure
    .input<{ workspaceId: string; projectPath: string }>()
    .action(async ({ input }) => {
      const data = await loadWorkspaces()
      if (!data.workspaces.some((w) => w.id === input.workspaceId)) {
        throw new Error('Workspace not found')
      }
      const list = (data.assignments[input.workspaceId] ||= [])
      if (!list.includes(input.projectPath)) list.push(input.projectPath)
      await saveWorkspaces(data)
      return { ok: true as const }
    }),
  unassignProjectFromWorkspace: t.procedure
    .input<{ workspaceId: string; projectPath: string }>()
    .action(async ({ input }) => {
      const data = await loadWorkspaces()
      const list = data.assignments[input.workspaceId]
      if (Array.isArray(list)) {
        data.assignments[input.workspaceId] = list.filter((p) => p !== input.projectPath)
        await saveWorkspaces(data)
      }
      return { ok: true as const }
    }),
  killProject: t.procedure.input<{ pid: number }>().action(async ({ input }) => {
    await killProcess(input.pid)
  }),
  createProject: t.procedure.action(async () => {
    // well really we want a similar process to below, i wish we didn't have so many servers started it makes
    // this debugging process icky. Maybe i just kill everything... gg
    // i wish i had an easy kill button
    // maybe i can just do that eh

    const t0 = Date.now()
    let t1, t2, t3, t4

    t1 = Date.now()

    const meta = await bufferService.create({ devRelayService })
    t2 = Date.now()

    if (!meta) {
      throw new Error('oh no') // i assume this just forwards it hopefully
    }

    /**
     *
     * TODO: this should be instant, and no flicker, currently there's a flicker which makes no sense
     */
    const url = `http://localhost:${meta.port}`
    await bufferService.httpOk(url)

    try {
      // await browser.loadUrl({ tabId: meta.dir, url })
    } catch (e) {
      console.warn('[createProject] Browser loadUrl failed:', e)
    }

    t3 = Date.now()
    console.log('looking for project here', meta)

    const project = (await findProjectsBFS(meta.dir)).at(0) // this is too slow
    t4 = Date.now()

    // what the fuck why
    if (!project) {
      console.error('[createProject] No project found at directory:', meta.dir)
      throw new Error(
        'Invariant, if you just created a project at a dir, there of course should be a found project at that dir'
      )
    }

    // this is there shouldn't be this transform, should be one data type moving throughout the pipeline
    const runningProject: RunningProject = {
      runningKind: 'listening',
      cwd: meta.dir,
      kind: 'vite',
      pid: meta.pid,
      port: meta.port
    }

    const totalMs = t4 - t0
    const report = {
      totalMs,
      steps: {
        bufferServiceCreateMs: t2 - t1,
        browserCreateTabMs: t3 - t2,
        findProjectsBfsMs: t4 - t3
      }
    }
    console.table(report)
    console.log('[createProject] Performance report:')
    console.table(report)

    return {
      project,
      runningProject,
      timing: report
    }
  }),

  backNav: t.procedure.action(async () => {
    return browser.backNav()
  }),
  forwardNav: t.procedure.action(async () => {
    return browser.forwardNav()
  }),

  startDevRelay: t.procedure.input<{ projectPath: string }>().action(async ({ input }) => {
    let startProjectResolve: null | ((p: StartingProject) => void) = null
    const startingProjectPromise = new Promise<StartingProject>(
      (res) => (startProjectResolve = res)
    )
    const startRes = await devRelayService.start(input.projectPath, {
      onProjectStart: (startingProject) => {
        startingProjects.add(startingProject)
        handlers.onProjectStart.send(startingProject)

        startProjectResolve?.(startingProject)
      }
      // onStdout: (chunk) => {
      //   console.log('stdout', chunk)
      // },
      // onStderr: (chunk) => {j
      //   console.error('stderr', chunk)
      // }
    })

    // i could do a start update? and just do streaming that might be fine... i think
    const runningProject: ListneingProject = {
      ...startRes.project,
      runningKind: 'listening'
    }
    // console.log('SENDING LISTENING PROJECT, ALL RETURN ENTRIES AFTER THIS MUST HAVE THIS PROJECT',runningProject);

    // invoke is breaking, why? otherwise we have a race
    ensuredListeningProjects.add(runningProject)
    handlers.onProjectListen.send(runningProject)

    // await delay(1000) // hacky for now
    // const serverFromPath = await detectDevServersForDir(input.projectPath)

    // should promisify this or something
    // const project = await new Promise<Project>((res) => {
    //   startProjectIndexing((projects) => {
    //     const project = projects.find((p) => p.path === input.projectPath)
    //     if (!project) throw new Error('Invariant no project found')
    //     res(project)
    //   }, input.projectPath)
    // })
    // const startedProjectCwd = startRes.project.cwd

    // i dont think this is needed anymor

    // // this ensures that the project is discoverable as a started project before we determine if its in listening state
    // // previously we relied on the startProjectIndexing race condition
    // await new Promise<Awaited<ReturnType<typeof detectDevServersForDir>>>((resolve) => {
    //   const poll = async () => {
    //     const servers = await detectDevServersForDir(homedir())
    //     const matchingServer = servers.find((server) => server.cwd === startedProjectCwd)

    //     if (matchingServer) {
    //       resolve(servers)
    //       return
    //     }

    //     setTimeout(poll, 100)
    //   }
    //   poll()
    // })
    // what if the endpoint was the one that had to delete this object?
    // but then it would be wrong and would have to switch to listening
    // i don't understand the ordering enough, why would it not return it if it executed after
    const startingProjectObj = await startingProjectPromise
    startingProjects.delete(startingProjectObj)

    await browser.createTab({
      tabId: input.projectPath,
      url: `http://localhost:${runningProject.port}?wrapper=false`
    })

    // await browser.createTab({
    //   tabId: input.projectPath,
    //   url: `http://localhost:${started.sock}?wrapper=false`
    // })
    return { runningProject }
  }),
  stopDevRelay: t.procedure.input<{ projectPath: string }>().action(async ({ input }) => {
    return devRelayService.stop(input.projectPath)
  }),
  getDevServers: t.procedure.action(async () => {
    const devServers = await detectDevServersForDir(homedir())
    await logToFile(devServers)
    const buffer = await bufferService.listBuffer()
    // console.log(' the current buffer', buffer)
    const starting: Array<RunningProject> = [...startingProjects.values()]
    const listening: Array<RunningProject> = devServers
      .filter(
        (server) =>
          (server.command == 'node' || server.kind !== 'unknown') && // hm forgot why we did this but i think it was a valid early case to ignore but not logner term
          !buffer.some((b) => b.dir === server.cwd)
      )
      .map((project) => ({
        ...project,
        runningKind: 'listening' as const
      }))
    // .sort((a, b) => a.cwd.localeCompare(b.cwd)) // for stability, id prefer alpahbetical name or port but this is fine for nwo // nvm thsi doens't work for some reason need to investigate

    // dedup: if there's a listening project, discard the starting one
    const filteredStarting = starting.filter(
      (startingProject) =>
        !listening.some((listeningProject) => listeningProject.cwd === startingProject.cwd)
    )

    const runningProjects = filteredStarting.concat(listening)
    // .sort((a, b) => a.cwd.localeCompare(b.cwd)) // i don't care rn

    // Handle ensured listening projects to avoid race conditions
    // This should be handled by canceling any requests instead of doing this
    for (const ensuredProject of ensuredListeningProjects) {
      const existsInRunning = runningProjects.some((project) => project.cwd === ensuredProject.cwd)
      if (!existsInRunning) {
        runningProjects.push(ensuredProject)
      }
      ensuredListeningProjects.delete(ensuredProject)
    }

    return runningProjects
    // for now filter unknown but this needs to be much better
  }),
  reIndexProjects: t.procedure.action(async () => {
    const projects = await new Promise<Array<Project>>((res) => {
      startProjectIndexing((projects) => {
        res(projects)
      })
    })

    return projects
  }),
  getProjects: t.procedure.action(async () => {
    const path = join(process.cwd(), 'projects.json')

    const pollForFile = async (maxAttempts = 30, intervalMs = 1000): Promise<string> => {
      for (let i = 0; i < maxAttempts; i++) {
        try {
          return await readFile(path, 'utf8')
        } catch {
          if (i === maxAttempts - 1) {
            throw new Error(`projects.json not found after ${maxAttempts} attempts`)
          }
          await new Promise((resolve) => setTimeout(resolve, intervalMs))
        }
      }
      throw new Error('Unreachable')
    }

    const projects = await pollForFile()
    return JSON.parse(projects) as Array<Project>
  }),
  getProjectsMeta: t.procedure
    .input<undefined | { paths: Array<string> }>()
    .action(async ({ input }) => {
      const paths = input?.paths ?? []

      const getFileCount = async (dirPath: string) => {
        try {
          const entries = await readdir(dirPath)
          return entries.length
        } catch {
          return 0
        }
      }

      const estimateSize = async (projectRoot: string) => {
        let size = 0
        const sourceDirs = ['src', 'lib', 'app', 'pages', 'components', 'utils', 'hooks']
        for (const dir of sourceDirs) {
          const d = join(projectRoot, dir)
          try {
            await fsAccess(d, fsConstants.R_OK)
            size += (await getFileCount(d)) * 5000
          } catch {}
        }
        try {
          const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'))
          const depCount =
            Object.keys(pkg.dependencies || {}).length +
            Object.keys(pkg.devDependencies || {}).length
          size += depCount * 50000
        } catch {}
        const buildDirs = ['dist', 'build', '.next', 'out']
        for (const dir of buildDirs) {
          const d = join(projectRoot, dir)
          try {
            await fsAccess(d, fsConstants.R_OK)
            size += (await getFileCount(d)) * 10000
          } catch {}
        }
        return size + 100000
      }

      // console.log('all da paths', paths);

      const results = await Promise.all(
        paths.map(async (p) => {
          if (typeof p !== 'string') {
            return null!
          }
          const root = resolve(p) // this is whats breaking
          const [size, favicon] = await Promise.all([
            estimateSize(root),
            resolveProjectFavicon(root)
          ])
          return { path: p, sizeInBytes: size, hasFavicon: favicon.found }
        })
      )
      return results
    }),
  getProjectFavicon: t.procedure
    .input<{ projectPath: string }>()
    .action(async ({ input }) => resolveProjectFavicon(input.projectPath)),
  getProjectSize: t.procedure.input<{ projectPath: string }>().action(async ({ input }) => {
    const projectRoot = resolve(input.projectPath)

    const getFileCount = async (dirPath: string) => {
      try {
        const entries = await readdir(dirPath)
        return entries.length
      } catch {
        return 0
      }
    }

    try {
      let estimatedSize = 0

      const sourceDirs = ['src', 'lib', 'app', 'pages', 'components', 'utils', 'hooks']
      for (const dir of sourceDirs) {
        const dirPath = join(projectRoot, dir)
        try {
          await fsAccess(dirPath, fsConstants.R_OK)
          const fileCount = await getFileCount(dirPath)
          estimatedSize += fileCount * 5000
        } catch {}
      }

      try {
        const packageJsonPath = join(projectRoot, 'package.json')
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))
        const depCount =
          Object.keys(packageJson.dependencies || {}).length +
          Object.keys(packageJson.devDependencies || {}).length
        estimatedSize += depCount * 50000
      } catch {}

      const buildDirs = ['dist', 'build', '.next', 'out']
      for (const dir of buildDirs) {
        const dirPath = join(projectRoot, dir)
        try {
          await fsAccess(dirPath, fsConstants.R_OK)
          const fileCount = await getFileCount(dirPath)
          estimatedSize += fileCount * 10000
        } catch {}
      }

      estimatedSize += 100000

      return { success: true as const, size: estimatedSize }
    } catch (error) {
      return { success: false as const, error: (error as Error).message }
    }
  }),
  // getPorts: t.procedure.action(async () => {
  //   return portsManager.getAll()
  // }),
  // refreshPorts: t.procedure.action(async () => {
  //   return portsManager.refresh()
  // }),

  getBrowserState: t.procedure.action(async () => {
    return browser.getCurrentState()
  }),
  createTab: t.procedure.input<{ tabId: string; url: string }>().action(async ({ input }) => {
    return browser.createTab(input)
  }),

  switchTab: t.procedure.input<string>().action(async ({ input }) => {
    return browser.switchTab(input)
  }),
  closeTab: t.procedure.input<string>().action(async ({ input }) => {
    return browser.closeTab(input)
  }),

  loadUrl: t.procedure.input<{ tabId: string; url: string }>().action(async ({ input }) => {
    let url = input.url
    const urlObj = new URL(url)
    if (!urlObj.searchParams.has('wrapper') || urlObj.searchParams.get('wrapper') !== 'false') {
      urlObj.searchParams.set('wrapper', 'false')
      url = urlObj.toString()
    }

    return browser.loadUrl({ ...input, url })
  }),
  reload: t.procedure.action(async () => {
    return browser.reload()
  }),
  forceReload: t.procedure.action(async () => {
    return browser.forceReload()
  }),
  toggleDevTools: t.procedure.action(async () => {
    return browser.toggleDevTools()
  }),

  openDevToolsPanel: t.procedure.input<string>().action(async ({ input }) => {
    return browser.openDevToolsPanel(input)
  }),
  navigate: t.procedure.input<string>().action(async ({ input }) => {
    return browser.navigate(input)
  }),
  updatePanelSize: t.procedure.input<number>().action(async ({ input }) => {
    return browser.updatePanelSize(input)
  }),
  updateWebContentViewBounds: t.procedure
    .input<{ tabId: string; bounds: { x: number; y: number; width: number; height: number } }>()
    .action(async ({ input }) => {
      return browser.updateWebContentViewBounds(input.tabId, input.bounds)
    }),
  clearWebContentViewBounds: t.procedure.input<string>().action(async ({ input }) => {
    return browser.clearWebContentViewBounds(input)
  }),
  hideAll: t.procedure.action(async () => {
    return browser.hideAll()
  }),
  hideTab: t.procedure.input<string>().action(async ({ input }) => {
    return browser.hideTab(input)
  }),
  showActive: t.procedure.action(async () => {
    return browser.showActive()
  }),
  takeScreenshot: t.procedure.action(async () => {
    return browser.takeScreenshot()
  }),

  terminalCreate: t.procedure
    .input<undefined | { cwd?: string; shell?: string }>()
    .action(async ({ input }) => {
      return terminalManager.create(input)
    }),
  terminalWrite: t.procedure.input<{ id: string; data: string }>().action(async ({ input }) => {
    terminalManager.write(input.id, input.data)
    return { ok: true }
  }),
  terminalResize: t.procedure
    .input<{ id: string; cols: number; rows: number }>()
    .action(async ({ input }) => {
      terminalManager.resize(input.id, input.cols, input.rows)
      return { ok: true }
    }),
  terminalDestroy: t.procedure.input<string>().action(async ({ input }) => {
    // dude what the actual fuck am i reading fixme pls
    const mgr = TerminalManagerV2.getInstance()
    if (!mgr) throw new Error('TerminalManagerV2 not initialized')
    return mgr.destroy(input)
  }),
  terminalList: t.procedure.action(async () => {
    return terminalManager.list()
  }),
  terminalReconnect: t.procedure.input<string>().action(async ({ input }) => {
    return terminalManager.reconnect(input)
  }),
  // terminalSetSnapshot: t.procedure
  //   .input<{ id: string; snapshot: string }>()
  //   .action(async ({ input }) => terminalManager.setSnapshot(input.id, input.snapshot)),
  // terminalGetSessionMetadata: t.procedure.action(async () => {
  //   return terminalManager.getSessionMetadata()
  // }),
  // terminalEnsureProjectTerminals: t.procedure.action(async () => {
  //   const ports = portsManager.getAll()
  //   return await terminalManager.ensureProjectTerminals(ports)
  // }),

  // V2 Headless terminal API
  terminalV2Create: t.procedure
    .input<undefined | { cwd?: string; shell?: string; startCommand?: string | string[] }>()
    .action(async ({ input }) => {
      // what the fuck am i reading
      const mgr = TerminalManagerV2.getInstance()
      if (!mgr) throw new Error('TerminalManagerV2 not initialized')
      return mgr.create(input)
    }),
  terminalV2Write: t.procedure.input<{ id: string; data: string }>().action(async ({ input }) => {
    const mgr = TerminalManagerV2.getInstance()
    if (!mgr) throw new Error('TerminalManagerV2 not initialized')
    return mgr.write(input.id, input.data)
  }),
  terminalV2Resize: t.procedure
    .input<{ id: string; cols: number; rows: number }>()
    .action(async ({ input }) => {
      const mgr = TerminalManagerV2.getInstance()
      if (!mgr) throw new Error('TerminalManagerV2 not initialized')
      return mgr.resize(input.id, input.cols, input.rows)
    }),
  terminalV2Destroy: t.procedure.input<string>().action(async ({ input }) => {
    const mgr = TerminalManagerV2.getInstance()
    if (!mgr) throw new Error('TerminalManagerV2 not initialized')
    return mgr.destroy(input)
  }),
  terminalV2List: t.procedure.action(async () => {
    const mgr = TerminalManagerV2.getInstance()
    if (!mgr) throw new Error('TerminalManagerV2 not initialized')
    return mgr.list()
  }),
  terminalV2Reconnect: t.procedure.input<string>().action(async ({ input }) => {
    const mgr = TerminalManagerV2.getInstance()
    if (!mgr) throw new Error('TerminalManagerV2 not initialized')
    return mgr.reconnect(input)
  }),
  terminalV2GetSince: t.procedure
    .input<{ id: string; since: number }>()
    .action(async ({ input }) => {
      const mgr = TerminalManagerV2.getInstance()
      if (!mgr) throw new Error('TerminalManagerV2 not initialized')
      return mgr.getSince(input.id, input.since)
    }),
  terminalV2GetSnapshot: t.procedure.input<string>().action(async ({ input }) => {
    const mgr = TerminalManagerV2.getInstance()
    if (!mgr) throw new Error('TerminalManagerV2 not initialized')
    return mgr.getSnapshot(input)
  }),

  focusActiveWebContent: t.procedure.action(async () => {
    return browser.focusActiveWebContent()
  }),

  focusPortalWindow: t.procedure.input<string>().action(async ({ input }) => {
    if (!mainWindow) throw new Error('Invariant')
    const portalView = portalViews.get(input)
    if (!portalView) throw new Error(`Portal ${input} not found`)
    try {
      portalView.webContents.focus()
      return { success: true, portalId: input }
    } catch (error) {
      return { success: false, error, portalId: input }
    }
  }),

  reloadMainProcess: t.procedure.action(async () => {
    const { app } = await import('electron')

    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 500)
      return { success: true, message: 'Reloading main process...' }
    } else {
      return { success: false, message: 'Reload only available in development' }
    }
  })
})

export type Router = ReturnType<typeof createRouter>
