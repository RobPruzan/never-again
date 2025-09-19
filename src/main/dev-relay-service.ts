import { spawn, ChildProcess } from 'node:child_process'
import { createServer, Socket, connect } from 'node:net'
import { unlinkSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { detectDevServersForDir } from './dev-server-detector'
import { ListneingProject, ProcessLogsMapping, StartingProject } from '../shared/types'

/**
 * thsi is also an awful name!
 */

/**
 * does it make sense to put the mapping (cwd -> {starting map closure id-> buffer, running projects map port -> buffer})
 *
 *
 */
// we probably want super json so we don't have to think about serializing that kind of obj
export class DevRelayService {
  processLogsMapping: Record<number, Array<string>> = {}
  onProcessLogsMappingUpdate?: (logs: ProcessLogsMapping, isSeeeing: boolean) => void
  onProjectListen?: (projectListen: ListneingProject, isSeeding: boolean) => void

  constructor({
    onProcessLogsMappingUpdate,
    onProjectListen
  }: {
    onProcessLogsMappingUpdate?: (logs: ProcessLogsMapping, isSeeding: boolean) => void
    onProjectListen?: (project: ListneingProject, isSeeding: boolean) => void
  }) {
    this.onProcessLogsMappingUpdate = onProcessLogsMappingUpdate
    this.onProjectListen = onProjectListen
  }
  private servers = new Map<
    string,
    { server: ReturnType<typeof createServer>; proc: ChildProcess; sock }
  >()
  /**
   * somewhere we're ignoring seeded items
   */
  async start(
    projectDir: string,
    opts?: {
      port?: number
      onProjectStart?: (project: StartingProject) => void
      isSeeding?: boolean
    }
  ) {
    console.log('CALL START', new Error().stack)

    const cwd = resolve(projectDir)
    const sock = join(cwd, '.devrelay.sock') // i believe this sock is for future connectors, yes quite confident
    // why would forward be logging it to the process and not sending it over the sock?
    // yeah this sock does jack shit rn i believe
    try {
      if (existsSync(sock)) unlinkSync(sock)
    } catch {}

    const server = createServer()
    const clients = new Set<Socket>()

    const proc = await new Promise<ChildProcess>((resolve, reject) => {
      const childProc = spawn(
        'pnpm', // this needs to detect package manager, maybe just use ni
        ['run', 'dev', ...(opts?.port ? ['--port', String(opts.port)] : [])],
        {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, FORCE_COLOR: '1', npm_config_color: 'true' } // why both, are both needed?
        }
      )

      childProc.on('spawn', () => resolve(childProc))
      childProc.on('error', reject)
    })
    const pid = proc.pid

    if (!pid) {
      throw new Error('invariant')
    }
    this.processLogsMapping[pid] = []
    const handleData = (d: { toString: () => string }) => {
      // forward(d, false)

      const processLogs = this.processLogsMapping[pid]
      processLogs.push(d.toString())
    }

    proc.stdout?.on('data', (d) => {
      handleData(d)
    })
    proc.stderr?.on('data', (d) => {
      handleData(d)
    })

    server.on('connection', (sockConn) => {
      sockConn.setEncoding('utf8')
      clients.add(sockConn)
      try {
        // sockConn.write('CONNECTED\n')
      } catch {}
      sockConn.on('data', (data: string) => {
        if (typeof data === 'string' && data.trim().toUpperCase() === 'KILL') {
          try {
            proc.kill('SIGTERM')
          } catch {}
        }
      })
      const rm = () => clients.delete(sockConn)
      sockConn.on('close', rm)
      sockConn.on('error', rm)
    })

    const cleanup = () => {
      try {
        server.close()
      } catch {}
      for (const s of clients) {
        try {
          s.destroy()
        } catch {}
      }
      try {
        unlinkSync(sock)
      } catch {}
      this.servers.delete(cwd)
    }

    proc.on('exit', () => cleanup())

    server.listen(sock)

    opts?.onProjectStart?.({
      kind: 'unknown',
      cwd,
      pid: pid,
      runningKind: 'starting'
    })
    this.servers.set(cwd, { server, proc, sock })
    // todo: we need to hide this from user and internally hold metadata about how to map ths
    writeFileSync(join(cwd, '.devrelay.json'), JSON.stringify({ pid: proc.pid, sock }), 'utf8')

    console.log('detecting for', projectDir)

    const prev = await detectDevServersForDir(projectDir)
    console.log('prev', prev)

    // fairily confinident this is infinite looping
    /**
     * we should fix this infinite loopin i definitely want ot be sure i know this
     *
     * but wait how does this tie in?
     *
     * the singleton needs a lock on it only available in the context here
     *
     * what if you start multiple at the same time
     *
     * well of course dumbass there's no lock its just an id mapping
     *
     * then we can transfer it over and clean it up after it ups, and if we make sure this actually works we're chillin
     * 
     */


    // todo: this is still infinite looping
    const project = await new Promise<
      Awaited<NonNullable<ReturnType<typeof detectDevServersForDir>>>[number]
    >((res, rej) => {
      const timeout = setTimeout(() => {
        console.error('DevRelay timeout: Failed to detect dev server after 15 seconds')
        rej(new Error('Timeout waiting for dev server to start'))
      }, 15000)

      const poll = async () => {
        const newPorts = await detectDevServersForDir(projectDir)
        // console.log('new length', newPorts)
        // console.log('polling for new ports, found:', newPorts.length, 'ports')
        // console.log('previous ports:', prev.length)

        if (prev.length === 0 && newPorts.length > 0) {
          // console.log('no previous ports, found new port, resolving with:', newPorts[0])
          clearTimeout(timeout)
          res(newPorts[0])
          return
        }

        const newProject = prev.find((prevProject) =>
          newPorts.find((newProject) => newProject.port !== prevProject.port)
        )

        // console.log('looking for new project different from previous ones, found:', newProject)

        if (!newProject) {
          // console.log('no new project found, continuing to poll')
          setTimeout(poll, 100)
          return
        }
        // console.log('resolving with new project:', newProject)
        clearTimeout(timeout)
        res(newProject)
      }
      poll()
    })

    // delete delete delete

    const listenignProject: ListneingProject = {
      ...project,
      runningKind: 'listening',
      pid // why is this pid not the same as what project returned? subprocess weirndess maybe?
    }
    console.log('on project listen', listenignProject)
    console.log('are there callbacks?', this.onProjectListen, this.onProcessLogsMappingUpdate);
    

    // if (!opts?.isSeeding) {
      // the client should not know about these projects and will be instantly started
      // this current impl has a bug if its a miss it should dispatch this, todo
      this.onProjectListen?.(listenignProject, opts?.isSeeding ?? false)
      this.onProcessLogsMappingUpdate?.(this.processLogsMapping, opts?.isSeeding ?? false)
    // }

    return { sock, pid: proc.pid!, project } // daijobu meme
  }

  async stop(projectDir: string): Promise<boolean> {
    const cwd = resolve(projectDir)
    const entry = this.servers.get(cwd)
    if (!entry) return false
    try {
      entry.proc.kill('SIGTERM')
    } catch {}
    try {
      entry.server.close()
    } catch {}
    try {
      unlinkSync(entry.sock)
    } catch {}
    this.servers.delete(cwd)
    return true
  }

  async connect(
    projectDir: string,
    onData: (chunk: string) => void
  ): Promise<{ close: () => void }> {
    const cwd = resolve(projectDir)
    const sockPath = join(cwd, '.devrelay.sock')
    const s = connect(sockPath)
    s.setEncoding('utf8')
    s.on('data', (d) => onData(d.toString()))
    s.on('error', () => {})
    const close = () => {
      try {
        s.end()
      } catch {}
      try {
        s.destroy()
      } catch {}
    }
    return { close }
  }
}
