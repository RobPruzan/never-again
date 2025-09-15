import {
  app,
  shell,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  Menu,
  clipboard
} from 'electron'
import { fork } from 'child_process' // Using Node.js fork
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { nativeImage } from 'electron'
import { TerminalManagerV2 } from './terminal-manager-v2'
import { PortsManager } from './ports-manager'
import { registerIpcMain, getRendererHandlers } from '@egoist/tipc/main'
import { createRouter } from './tipc'
import { browserController, layoutAllBrowserViews } from './browser-controller'
import { RendererHandlers } from './renderer-handlers'
import * as net from 'net'
import { Project } from '../shared/types'
// import { detectDevServersForDir } from './dev-server-detector'
import { homedir } from 'os'
import { DevRelayService } from './dev-relay-service'
import { ProjectBufferService } from './project-buffer-service'

export let mainWindow: BrowserWindow | null = null
export let browserViews: Map<string, WebContentsView> = new Map()
export const portalViews = new Map<string, WebContentsView>()
export const activeBrowserViewId: { current: string | null } = { current: null }
// export let terminalManager: TerminalManagerV2
export let terminalManagerV2: TerminalManagerV2
export let bufferService: ProjectBufferService
export let portsManager: PortsManager

export const startProjectIndexing = (
  callback: (projects: Project[]) => void,
  startDir?: string
) => {
  const utilityPath = join(__dirname, 'index-projects.js')

  const child = fork(utilityPath, [], {
    env: {
      ...process.env,
      PROJECT_START_DIR: startDir || homedir()
    },
    stdio: 'inherit'
  })

  child.on('message', (message: any) => {
    if (message.type === 'projects-found') {
      callback(message.projects)
    } else if (message.type === 'error') {
      console.error('Project indexing error:', message.error)
    }
  })

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Project indexing process exited with non-zero code: ${code}`)
    }
  })

  child.on('error', (error) => {
    console.error('Project indexing process error:', error)
  })
}

// Layout constants

// Controllers for typed tRPC access

function createWindow(): void {
  // what do we have here
  mainWindow = new BrowserWindow({
    // initialize size, this is bad
    width: 1400,
    height: 900,
    show: false,
    // fullscreen: true,
    autoHideMenuBar: true,
    title: 'zenbu',
    titleBarStyle: 'hidden',
    // is this concerning, maybe?
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: '#1f1f1f',
            symbolColor: '#9ca3af',
            height: 40
          }
        }
      : {}),
    ...(process.platform !== 'darwin' ? { icon } : {}),
    // whats this for?
    // what the fuck
    // i guess that injects the ipc>
    webPreferences: {
      // idk what these options do
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.platform === 'darwin' && app.dock) {
    try {
      const img = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
      if (!img.isEmpty()) app.dock.setIcon(img)
    } catch {}
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('resize', () => {
    layoutAllBrowserViews()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    const { frameName } = details
    if (frameName && frameName.startsWith('portal:')) {
      const portalId = frameName.slice('portal:'.length)
      if (portalViews.has(portalId)) {
        return { action: 'deny' }
      }
      return {
        action: 'allow',
        createWindow: (options) => {
          const wc = (options as any).webContents as Electron.WebContents
          const view = new WebContentsView({ webContents: wc })
          view.setBackgroundColor('#00000000')
          view.setBounds({ x: 0, y: 0, width: 1, height: 1 })
          mainWindow!.contentView.addChildView(view)
          portalViews.set(portalId, view)
          wc.once('destroyed', () => {
            try {
              mainWindow?.contentView.removeChildView(view)
            } catch {}
            portalViews.delete(portalId)
          })
          return wc
        }
      }
    }

    // todo: good impl
    if (details.url) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  ipcMain.on(
    'portal:update-bounds',
    (
      _e,
      payload: { id: string; bounds: { x: number; y: number; width: number; height: number } }
    ) => {
      const view = portalViews.get(payload.id)
      if (!view) return
      view.setBounds(payload.bounds)
      try {
        mainWindow!.contentView.addChildView(view)
      } catch {}
    }
  )

  ipcMain.on('portal:close', (_e, id: string) => {
    console.log('on portal close')

    const view = portalViews.get(id)
    if (!view) return
    try {
      view.setVisible(false)
    } catch {}
    try {
      view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    } catch {}
    try {
      mainWindow!.contentView.removeChildView(view)
    } catch {}
    try {
      view.webContents.close()
    } catch {}
    portalViews.delete(id)
  })

  // Clipboard handlers
  ipcMain.handle('clipboard:write-text', (_e, text: string) => {
    console.log('Copying to clipboard:', text)
    clipboard.writeText(text)
    console.log('Clipboard content after write:', clipboard.readText())
    return true
  })

  // i assume this is from starter? whats going on here?
  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

//fine
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // interesting, is this required? whats a session, why a request?
  // i guess it is fundamentally a website?
  // Configure session for webviews
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [''] // is this where warnings are from?
      }
    })
  })

  // ah so this is from starter
  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  portsManager = new PortsManager()
  await portsManager.startWatching()

  startProjectIndexing((projects: Project[]) => {
    const handlers = getRendererHandlers<RendererHandlers>(mainWindow!.webContents)
    // this is technically a race condition, but its fine for now
    console.log('found projects', projects.length)
    console.log(
      'any .xtra projects',
      projects.filter((p) => p.path.includes('.xtra'))
    )

    handlers.projectsFound.send({ projects })
    //
  })

  createWindow()

  if (mainWindow) {
    const handlers = getRendererHandlers<RendererHandlers>(mainWindow.webContents)
    terminalManagerV2 = new TerminalManagerV2(handlers)
    // Ensure terminal events can be sent to the renderer
    terminalManagerV2.setMainWindow(mainWindow)
    const devRelayService = new DevRelayService()
    bufferService = new ProjectBufferService()
    // terminalManager.setMainWindow(mainWindow)
    // terminalManagerV2.setMainWindow(mainWindow)
    portsManager.setMainWindow(mainWindow)
    registerIpcMain(
      createRouter({
        portsManager,
        browser: browserController,
        terminalManager: null!,
        devRelayService,
        bufferService
      })
    )
    if (bufferService.listBuffer().length === 0) {
      console.log('')

      bufferService.seed(1)
    }
    await bufferService.ensureTemplate()
    await bufferService.ensureBufferStarted()

    // Development reload server
    if (process.env.NODE_ENV === 'development' || is.dev) {
      startReloadServer()
    }

    console.log('ports?', portsManager.getAll())

    // Restore existing terminal sessions and ensure project terminals exist
    // await terminalManager.restoreSessionsOnStartup()
    // await terminalManager.ensureProjectTerminals(portsManager.getAll())

    const ports = Object.entries(portsManager.getAll())
    const promises = ports.map(async ([port, data]) => {
      // this will break if we change what project id is (currently its same as data.name so its fine)
      // getProjects
      return await browserController
        .createTab({
          tabId: data.cwd,
          url: `http://localhost:${port}?wrapper=false`
        })
        .catch((e) => {
          console.log('failed dis', e)
        })
    })
    // eh this is blocking and bad, will cause white screen flash
    await Promise.all(promises).catch((e) => {
      console.log('noo', e)
    })

    const [firstPort, firstData] = ports[0]
    await browserController
      .loadUrl({ tabId: firstData.cwd, url: `http://localhost:${firstPort}?wrapper=false` })
      .catch((e) => {
        console.log('noo but agian', e)
      })

    await browserController.switchTab(firstData.name)
  }

  const menu = Menu.buildFromTemplate([
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Change URL',
          accelerator: process.platform === 'darwin' ? 'Cmd+L' : 'Ctrl+L',
          click: () => {
            const handlers = getRendererHandlers<RendererHandlers>(mainWindow!.webContents)
            handlers.changeURL.send()
          }
        },
        {
          label: 'New Tab',
          accelerator: process.platform === 'darwin' ? 'Cmd+T' : 'Ctrl+T',
          click: () => {
            if (terminalManagerV2) {
              const handlers = getRendererHandlers<RendererHandlers>(mainWindow!.webContents)
              handlers.menuNewTab.send()
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Next Item',
          accelerator: 'Ctrl+N',
          click: () => {
            if (terminalManagerV2) {
              const handlers = getRendererHandlers<RendererHandlers>(mainWindow!.webContents)
              handlers.menuNextItem.send()
            }
          }
        },
        {
          label: 'Previous Item',
          accelerator: 'Ctrl+P',
          click: () => {
            if (terminalManagerV2) {
              const handlers = getRendererHandlers<RendererHandlers>(mainWindow!.webContents)
              handlers.menuPreviousItem.send()
            }
          }
        },
        {
          label: 'Select Item',
          accelerator: 'Return',
          click: () => {
            if (terminalManagerV2) {
              const handlers = getRendererHandlers<RendererHandlers>(mainWindow!.webContents)
              handlers.menuSelectItem.send()
            }
          }
        },
        {
          label: 'Switch Tab',
          accelerator: 'Ctrl+Tab',
          click: () => {
            if (mainWindow) {
              const handlers = getRendererHandlers<RendererHandlers>(mainWindow!.webContents)
              handlers.tabSwitcher.send()
            }
          }
        },
        {
          label: 'Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:previous-tab')
            }
          }
        }
      ]
    },
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'Switch to Terminal 1',
          accelerator: process.platform === 'darwin' ? 'Cmd+1' : 'Ctrl+1',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:switch-terminal', 1)
            }
          }
        },
        {
          label: 'Switch to Terminal 2',
          accelerator: process.platform === 'darwin' ? 'Cmd+2' : 'Ctrl+2',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:switch-terminal', 2)
            }
          }
        },
        {
          label: 'Switch to Terminal 3',
          accelerator: process.platform === 'darwin' ? 'Cmd+3' : 'Ctrl+3',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:switch-terminal', 3)
            }
          }
        },
        {
          label: 'Switch to Terminal 4',
          accelerator: process.platform === 'darwin' ? 'Cmd+4' : 'Ctrl+4',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:switch-terminal', 4)
            }
          }
        },
        {
          label: 'Switch to Terminal 5',
          accelerator: process.platform === 'darwin' ? 'Cmd+5' : 'Ctrl+5',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:switch-terminal', 5)
            }
          }
        },
        {
          label: 'Switch to Terminal 6',
          accelerator: process.platform === 'darwin' ? 'Cmd+6' : 'Ctrl+6',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:switch-terminal', 6)
            }
          }
        },
        {
          label: 'Switch to Terminal 7',
          accelerator: process.platform === 'darwin' ? 'Cmd+7' : 'Ctrl+7',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:switch-terminal', 7)
            }
          }
        },
        {
          label: 'Switch to Terminal 8',
          accelerator: process.platform === 'darwin' ? 'Cmd+8' : 'Ctrl+8',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:switch-terminal', 8)
            }
          }
        },
        {
          label: 'Switch to Terminal 9',
          accelerator: process.platform === 'darwin' ? 'Cmd+9' : 'Ctrl+9',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:switch-terminal', 9)
            }
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: process.platform === 'darwin' ? 'Cmd+Z' : 'Ctrl+Z',
          role: 'undo'
        },
        {
          label: 'Redo',
          accelerator: process.platform === 'darwin' ? 'Cmd+Shift+Z' : 'Ctrl+Shift+Z',
          role: 'redo'
        },
        { type: 'separator' },
        {
          label: 'Cut',
          accelerator: process.platform === 'darwin' ? 'Cmd+X' : 'Ctrl+X',
          role: 'cut'
        },
        {
          label: 'Copy',
          accelerator: process.platform === 'darwin' ? 'Cmd+C' : 'Ctrl+C',
          role: 'copy'
        },
        {
          label: 'Paste',
          accelerator: process.platform === 'darwin' ? 'Cmd+V' : 'Ctrl+V',
          role: 'paste'
        },
        {
          label: 'Select All',
          accelerator: process.platform === 'darwin' ? 'Cmd+A' : 'Ctrl+A',
          role: 'selectAll'
        }
      ]
    },
    {
      label: 'Developer',
      submenu: [
        {
          label: 'Toggle WebView DevTools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:toggle-devtools')
            }
          }
        },
        {
          label: 'Toggle WebView DevTools (Alt)',
          accelerator: process.platform === 'darwin' ? 'Cmd+Shift+I' : 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:toggle-devtools')
            }
          }
        },
        {
          label: 'Toggle App DevTools',
          accelerator: process.platform === 'darwin' ? 'Cmd+Option+I' : 'Ctrl+Alt+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools()
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Reload WebView',
          accelerator: process.platform === 'darwin' ? 'Cmd+R' : 'Ctrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:reload')
            }
          }
        },
        {
          label: 'Force Reload WebView',
          accelerator: process.platform === 'darwin' ? 'Cmd+Shift+R' : 'Ctrl+Shift+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:force-reload')
            }
          }
        },
        {
          label: 'Reload App',
          accelerator: 'F5',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.reload()
            }
          }
        }
      ]
    }
  ])

  Menu.setApplicationMenu(menu)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  browserViews.forEach((browserView) => {
    try {
      if (mainWindow) {
        mainWindow.contentView.removeChildView(browserView)
      }
    } catch {}
    ;(browserView as any).webContents.destroy()
  })
  browserViews.clear()

  // if (terminalManagerV2) {
  terminalManagerV2.destroyAll()
  // } else if (terminalManagerV2) {
  //   terminalManagerV2.destroyAll()
  // }

  if (portsManager) {
    portsManager.destroy()
  }
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // if (terminalManagerV2) {
  terminalManagerV2.destroyAll()
  bufferService.kill()
  // } else if (terminalManager) {
  //   terminalManager.destroyAll()
  //   bufferService.kill()
  // }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function startReloadServer() {
  const server = net.createServer((socket) => {
    socket.on('data', (data) => {
      const command = data.toString().trim()
      if (command === 'RELOAD') {
        console.log('Received reload signal from Cursor extension')
        socket.write('Reloading...')
        socket.end()

        // Trigger reload
        setTimeout(() => {
          app.relaunch()
          app.exit(0)
        }, 500)
      }
    })

    socket.on('error', (err) => {
      console.log('Reload server socket error:', err)
    })
  })

  // Try different ports if 9999 is in use
  const tryPort = (port: number) => {
    server.listen(port, 'localhost', () => {
      console.log(`Zenbu reload server listening on port ${port}`)
    })

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE' && port < 10010) {
        tryPort(port + 1)
      } else {
        console.log('Reload server error:', err)
      }
    })
  }

  tryPort(9999)
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
