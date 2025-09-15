import { BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { FSWatcher } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const PORTS_FILE = join(homedir(), '.xtra', 'ports.json')

export interface Port {
  name: string
  cwd: string
  timestamp: number
}

export interface PortsData {
  [port: string]: Port
}

export class PortsManager {
  private mainWindow: BrowserWindow | null = null
  private watcher: FSWatcher | null = null
  private ports: PortsData = {}

  constructor() {
    // this.startWatching()
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
    // Send initial ports data when window is set
    this.loadPorts()
  }

  // No userland IPC; ports are fetched via tRPC from context using getAll/refresh

  public async loadPorts() {
    try {
      const data = await readFile(PORTS_FILE, 'utf-8')
      this.ports = JSON.parse(data)

      // No push to renderer; renderer polls via tRPC
    } catch (error) {
      console.error('Failed to load ports.json:', error)
      this.ports = {}
    }
  }

   async startWatching() {
    try {
      // Initial load
      await this.loadPorts()

      // Watch for changes
      const watchFile = async () => {
        try {
          // Use fs.watch for real-time updates
          const { watch } = await import('fs')

          if (this.watcher) {
            this.watcher.close()
          }

          this.watcher = watch(PORTS_FILE, async (eventType) => {
            if (eventType === 'change') {
              await this.loadPorts()
            }
          })
        } catch (error) {
          console.error('Failed to watch ports.json:', error)
          // Retry watching after a delay
          setTimeout(() => this.startWatching(), 5000)
        }
      }

      await watchFile()
    } catch (error) {
      console.error('Failed to start watching ports.json:', error)
      // Even if watching fails, try to load ports once
      await this.loadPorts()
    }
  }

  public getAll(): PortsData {
    return this.ports
  }
  public async refresh(): Promise<PortsData> {
    await this.loadPorts()
    return this.getAll()
  }

  public destroy() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}
