import { spawn, ChildProcess } from 'node:child_process'
import { createServer, Socket, connect } from 'node:net'
import { unlinkSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { detectDevServersForDir } from './dev-server-detector'
import { StartingProject } from '../shared/types'

/**
 * thsi is also an awful name!
 */

/**
 *
 * i dont even understand how this socket totally works yet e2e
 *
 * i think how it works is:
 * - starter creates metadata file
 * - created socket to mirror process/channel for general communication
 * - exposes a way to connect to the socket (but anyone really can connect if they discover it, but thats a private impl detail technically)
 *
 *
 * whats the cli called
 */
export class DevRelayService {
  private servers = new Map<
    string,
    { server: ReturnType<typeof createServer>; proc: ChildProcess; sock }
  >()

  async start(
    projectDir: string,
    opts?: {
      port?: number
      onProjectStart?: (project: StartingProject) => void
    }
  ) {
    const cwd = resolve(projectDir)
    const sock = join(cwd, '.devrelay.sock')
    try {
      if (existsSync(sock)) unlinkSync(sock)
    } catch {}

    const server = createServer()
    const clients = new Set<Socket>()

    const proc = spawn(
      'pnpm',
      ['run', 'dev', ...(opts?.port ? ['--port', String(opts.port)] : [])],
      {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '1', npm_config_color: 'true' } // why both, are both needed?
      }
    )

    const forward = (buf: Buffer | string, isErr = false) => {
      try {
        ;(isErr ? process.stderr : process.stdout).write(buf)
      } catch {}
      for (const s of clients) {
        try {
          s.write(buf)
        } catch {}
      }
    }
    proc.stdout?.on('data', (d) => {
      forward(d, false)
    })
    proc.stderr?.on('data', (d) => {
      forward(d, true)
    })

    server.on('connection', (sockConn) => {
      sockConn.setEncoding('utf8')
      clients.add(sockConn)
      try {
        sockConn.write('CONNECTED\n')
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
      pid: typeof proc.pid === 'number' ? proc.pid : 0,
      runningKind: 'starting'
    })
    this.servers.set(cwd, { server, proc, sock })
    try {
      writeFileSync(
        join(cwd, '.devrelay.json'),
        JSON.stringify({ pid: proc.pid, sock }, null, 2),
        'utf8'
      )
    } catch {}

    const prev = await detectDevServersForDir(projectDir)
    console.log('prev ports found', prev)

    const project = await new Promise<
      Awaited<NonNullable<ReturnType<typeof detectDevServersForDir>>>[number]
    >((res) => {
      const poll = async () => {
        const newPorts = await detectDevServersForDir(projectDir)
        // console.log('new ports found', newPorts)
        if (prev.length === 0 && newPorts.length > 0) {
          res(newPorts[0])
          return
        }

        const newProject = prev.find((prevProject) =>
          newPorts.find((newProject) => newProject.port !== prevProject.port)
        )

        if (!newProject) {
          setTimeout(poll, 100)
          return
        }
        res(newProject)
      }
      poll()
    })
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
