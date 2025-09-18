import { contextBridge, ipcRenderer } from 'electron'

// @ts-ignore
console.createTask = null
// TIPC uses plain ipcRenderer.invoke; expose under window.ipcRenderer
import { electronAPI } from '@electron-toolkit/preload'

ipcRenderer.setMaxListeners(50)

process.once('loaded', () => {
  try {
    // no-op, just ensure preload is initialized
  } catch {}
})

// Custom APIs for renderer
// Shared portal state in the renderer process (hover stitching)
const portalState = (() => {
  const g: any = window as any
  g.__portalState = g.__portalState ?? { anchors: new Set<string>(), portals: new Set<string>() }
  return g.__portalState as { anchors: Set<string>; portals: Set<string> }
})()

// Listen for hover messages from child portal windows once
if (!(window as any).__portalHoverListenerInstalled) {
  window.addEventListener('message', (ev: MessageEvent) => {
    const data: any = ev.data
    if (!data || data.type !== 'portal-hover') return
    if (data.hovering) portalState.portals.add(data.id)
    else portalState.portals.delete(data.id)
  })
  ;(window as any).__portalHoverListenerInstalled = true
}

const api = {
  // Portal overlay API used by WindowPortal
  portal: {
    has: (id: string) => ((window as any).__activePortals ?? new Set()).has(id),
    markOpen: (id: string) => {
      ;((window as any).__activePortals ??= new Set()).add(id)
    },
    markClosed: (id: string) => {
      ;((window as any).__activePortals ??= new Set()).delete(id)
    },
    updateBounds: (id: string, bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.send('portal:update-bounds', { id, bounds }),
    close: (id: string) => ipcRenderer.send('portal:close', id),
    setAnchorHover: (id: string, hovering: boolean) => {
      if (hovering) portalState.anchors.add(id)
      else portalState.anchors.delete(id)
    },
    isInteractive: (anchorId: string, portalId: string) =>
      portalState.anchors.has(anchorId) || portalState.portals.has(portalId)
  },
  // Clipboard API
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text)
  },
  // Terminal streaming IPC helper (for Terminal.tsx)
  ipcRenderer: {
    on: (channel: string, callback: (...args: any[]) => void) => {
      const validChannels = [
        'terminal:data',
        'terminal:exit',
        'terminal:title-changed',
        'browser:url-changed'
      ]
      if (validChannels.includes(channel)) {
        const wrappedCallback = (_event, ...args) => callback(...args)
        ipcRenderer.on(channel, wrappedCallback)
        return wrappedCallback
      }
      return undefined
    },
    removeListener: (channel: string, callback: any) => {
      const validChannels = [
        'terminal:data',
        'terminal:exit',
        'terminal:title-changed',
        'browser:url-changed'
      ]
      if (validChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, callback)
      }
    },
    removeAllListeners: (channel: string) => {
      const validChannels = [
        'terminal:data',
        'terminal:exit',
        'terminal:title-changed',
        'browser:url-changed'
      ]
      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel)
      }
    }
  },
  terminal: {
    create: (options?: { cwd?: string; shell?: string }) =>
      ipcRenderer.invoke('terminal:create', options),
    write: (id: string, data: string) => ipcRenderer.send('terminal:write', { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('terminal:resize', { id, cols, rows }),
    destroy: (id: string) => ipcRenderer.invoke('terminal:destroy', id),
    list: () => ipcRenderer.invoke('terminal:list'),
    reconnect: (id: string) => ipcRenderer.invoke('terminal:reconnect', id)
  }
  // No userland overlay IPC (moved to tRPC)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
// what why is this a conditional pls no
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    // Expose minimal ipcRenderer methods for TIPC
    contextBridge.exposeInMainWorld('ipcRenderer', {
      invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
      on: (channel: string, listener: any) => ipcRenderer.on(channel, listener),
      off: (channel: string, listener: any) => ipcRenderer.off(channel, listener),
      send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args)
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore expose for TIPC when not isolated
  window.ipcRenderer = ipcRenderer
}
