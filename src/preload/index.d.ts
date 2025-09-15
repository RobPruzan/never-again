import { ElectronAPI } from '@electron-toolkit/preload'

export interface Project {
  id: string
  name: string
  url: string
  createdAt: number
  lastAccessed?: number
}

export interface Port {
  name: string
  cwd: string
  timestamp: number
}

export interface PortsData {
  [port: string]: Port
}

export interface API {
  portal: {
    has: (id: string) => boolean
    markOpen: (id: string) => void
    markClosed: (id: string) => void
    updateBounds: (
      id: string,
      bounds: { x: number; y: number; width: number; height: number }
    ) => void
    close: (id: string) => void
    setAnchorHover: (id: string, hovering: boolean) => void
    isInteractive: (anchorId: string, portalId: string) => boolean
  }
  clipboard: {
    writeText: (text: string) => Promise<boolean>
  }
  ipcRenderer: {
    on: (channel: string, callback: (...args: any[]) => void) => any
    removeListener: (channel: string, listener: any) => void
    removeAllListeners: (channel: string) => void
  }
  terminal: {
    create: (options?: {
      cwd?: string
      shell?: string
    }) => Promise<{ id: string; title: string; cwd: string }>
    write: (id: string, data: string) => void
    resize: (id: string, cols: number, rows: number) => void
    destroy: (id: string) => Promise<boolean>
    list: () => Promise<Array<{ id: string; title: string; cwd: string }>>
    reconnect: (id: string) => Promise<{ success: boolean; id?: string }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
