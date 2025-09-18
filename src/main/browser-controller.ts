import { WebContentsView, Menu, clipboard } from 'electron'
import { getRendererHandlers } from '@egoist/tipc/main'
import { mainWindow, browserViews, activeBrowserViewId } from '.'
import { RendererHandlers } from './renderer-handlers'

// fuck you claude
// LEGACY: These constants are only used for fallback layout when no specific bounds are stored
export const sidebarWidth = 48 // DevToolsSidebar width (w-12 = 3rem = 48px)
export const tabBarHeight = 36 // TabBar height (h-9 = 2.25rem = 36px)
export let currentPanelSize = 75 // Default browser panel size (75%) - LEGACY

// er i kinda wish this was just a class, whatever

const webContentViewBounds = new Map<
  string,
  { x: number; y: number; width: number; height: number }
>()

export function layoutBrowserView(browserView: WebContentsView, tabId?: string): void {
  if (!mainWindow || !browserView) return

  if (tabId && webContentViewBounds.has(tabId)) {
    const bounds = webContentViewBounds.get(tabId)!
    browserView.setBounds(bounds)
    return
  }

  //no we should never fallback to this, bad claude
  const [winWidth, winHeight] = mainWindow.getContentSize()
  const browserWidth = Math.floor((winWidth - sidebarWidth) * (currentPanelSize / 100))
  const availableHeight = Math.max(0, winHeight - tabBarHeight)

  const bounds = {
    x: sidebarWidth,
    y: tabBarHeight,
    width: browserWidth,
    height: availableHeight
  }

  browserView.setBounds(bounds)
}

export function layoutAllBrowserViews(): void {
  browserViews.forEach((browserView, tabId) => {
    layoutBrowserView(browserView, tabId)
  })
}
export type BrowserController = typeof browserController

export const browserController = {
  getCurrentState() {
    const tabs = Array.from(browserViews.entries()).map(([tabId, view]) => ({
      tabId,
      url: view.webContents.getURL() || 'about:blank',
      title: view.webContents.getTitle() || tabId,
      isActive: tabId === activeBrowserViewId.current,
      canGoBack:
        typeof view.webContents.canGoBack === 'function' ? view.webContents.canGoBack() : false,
      canGoForward:
        typeof view.webContents.canGoForward === 'function'
          ? view.webContents.canGoForward()
          : false,
      isLoaded: !view.webContents.isLoading()
    }))

    const activeTab = tabs.find((t) => t.isActive)

    return {
      tabs,
      activeTabId: activeBrowserViewId.current,
      totalTabs: tabs.length,
      canGoBack: activeTab ? activeTab.canGoBack : false,
      canGoForward: activeTab ? activeTab.canGoForward : false,
      isLoaded: activeTab ? activeTab.isLoaded : false
    }
  },
  // async createOptimistictab({tabId,url}: { tabId: string; url: string }) {

  // },
  async createTab(args: { tabId: string; url: string }) {
    // console.log('creating tab')

    if (!mainWindow) throw new Error('Window not ready')

    let existingView = browserViews.get(args.tabId)
    if (!existingView) {
      const view = new WebContentsView({
        webPreferences: {
          sandbox: false,
          contextIsolation: false,
          nodeIntegration: false
        }
      })

      view.webContents.on('did-fail-load', (_e, _code, errorDescription, validatedURL) => {
        console.error(
          `BrowserView ${args.tabId} failed to load:`,
          errorDescription,
          'URL:',
          validatedURL
        )
      })


      view.webContents.on('dom-ready', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            const handlers = getRendererHandlers<RendererHandlers>(mainWindow.webContents)
            handlers.browserStateUpdate.send(browserController.getCurrentState())
          } catch {}
        }
      })

      view.webContents.on('did-finish-load', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            const handlers = getRendererHandlers<RendererHandlers>(mainWindow.webContents)
            handlers.browserStateUpdate.send(browserController.getCurrentState())
          } catch {}
        }
      })



      // Track URL changes
      view.webContents.on('did-navigate', (_event, url) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            const handlers = getRendererHandlers<RendererHandlers>(mainWindow.webContents)
            handlers.browserStateUpdate.send(browserController.getCurrentState())
          } catch {}
        }
      })

      view.webContents.on('did-navigate-in-page', (_event, url) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            const handlers = getRendererHandlers<RendererHandlers>(mainWindow.webContents)
            handlers.browserStateUpdate.send(browserController.getCurrentState())
          } catch {}
        }
      })

      view.webContents.on('before-input-event', (_e, input) => {
        if ((input.control || input.meta) && input.key.toLowerCase() === 'c') {
          view.webContents.copy()
        } else if ((input.control || input.meta) && input.key.toLowerCase() === 'v') {
          view.webContents.paste()
        } else if ((input.control || input.meta) && input.key.toLowerCase() === 'x') {
          view.webContents.cut()
        } else if ((input.control || input.meta) && input.key.toLowerCase() === 'a') {
          view.webContents.selectAll()
        }
      })
      view.webContents.on('context-menu', (_e, params) => {
        const menu = Menu.buildFromTemplate([
          {
            label: 'Copy',
            enabled: params.selectionText.length > 0,
            click: () => clipboard.writeText(params.selectionText)
          },
          { label: 'Paste', click: () => view.webContents.paste() },
          { type: 'separator' },
          { label: 'Select All', click: () => view.webContents.selectAll() },
          { type: 'separator' },
          {
            label: 'Inspect Element',
            click: () => view.webContents.inspectElement(params.x, params.y)
          }
        ])
        menu.popup()
      })
      view.webContents.on('devtools-opened', () => {
        const devToolsWebContents = view.webContents.devToolsWebContents
        if (devToolsWebContents) {
          // devToolsWebContents.executeJavaScript(`
          //   const style = document.createElement('style');
          //   style.textContent = \`
          //     body, html, .tabbed-pane, .widget, .panel, .toolbar,
          //     .console-view, .sources, .network, .elements, .inspector-view,
          //     .vbox, .hbox, .flex-auto, .flex-none, .panel-sidebar,
          //     .sidebar-pane, .tabbed-pane-content, .tabbed-pane-header,
          //     .tabbed-pane-header-tab, .console-group-messages,
          //     .console-message, .console-object, .source-frame,
          //     .text-editor, .CodeMirror, .tree-outline, .data-grid,
          //     .split-widget, .split-widget-sidebar, .split-widget-main,
          //     .chrome-select, input, select, textarea, .toolbar-item,
          //     .toolbar-button, .inspector-main-toolbar, .inspector-footer,
          //     .inspector-view-tabbed-pane .tabbed-pane-header,
          //     .drawer, .drawer-contents, .console-toolbar,
          //     .toolbar-container, .toolbar-shadow, .drawer-header,
          //     .main-tabbed-pane .tabbed-pane-header,
          //     .inspector-view-tabbed-pane > .tabbed-pane-header,
          //     div[class*="tabbed-pane-header"], div[class*="inspector-view"],
          //     .tabbed-pane-header-tabs, .tabbed-pane-header-tabs-drop-down-container,
          //     .inspector-view-tabbed-pane, .main-tabbed-pane {
          //       background-color: #0A0A0A !important;
          //       background: #0A0A0A !important;
          //     }
          //     .tabbed-pane-header {
          //       border-bottom: 1px solid #1A1A1A !important;
          //     }
          //     .tabbed-pane-header-tab {
          //       border-right: 1px solid #1A1A1A !important;
          //     }
          //     .toolbar {
          //       border-bottom: 1px solid #1A1A1A !important;
          //     }
          //     /* Target the specific top tab bar area */
          //     .main .tabbed-pane-header,
          //     .inspector-view > .tabbed-pane-header,
          //     .tabbed-pane-header-tabs,
          //     [class*="inspector-view"] > [class*="tabbed-pane-header"],
          //     [aria-label*="panel"] .tabbed-pane-header {
          //       background-color: #0A0A0A !important;
          //       background: #0A0A0A !important;
          //     }
          //     /* Override any gray backgrounds from computed styles - including #3C3C3C */
          //     [style*="#3C3C3C"], [style*="#282828"], [style*="rgb(60, 60, 60)"],
          //     [style*="rgb(40, 40, 40)"], [style*="background-color: rgb(60, 60, 60)"],
          //     [style*="background-color: rgb(40, 40, 40)"], [style*="background-color: #3C3C3C"],
          //     [style*="background-color: #282828"] {
          //       background-color: #0A0A0A !important;
          //       background: #0A0A0A !important;
          //     }
          //     /* Additional selectors for elements that might have #3C3C3C */
          //     .toolbar-background, .inspector-view-toolbar, .console-pinpane,
          //     .tabbed-pane-placeholder, .split-widget-resizer, .toolbar-background,
          //     .inspector-view-header, .console-status-bar {
          //       background-color: #0A0A0A !important;
          //       background: #0A0A0A !important;
          //     }
          //   \`;
          //   document.head.appendChild(style);
          //   // More aggressive targeting for the top tab bar
          //   const updateTopTabBar = () => {
          //     // Look for the main inspector view container
          //     const inspectorView = document.querySelector('.inspector-view');
          //     if (inspectorView) {
          //       const header = inspectorView.querySelector('.tabbed-pane-header');
          //       if (header) {
          //         header.style.backgroundColor = '#0A0A0A';
          //         header.style.background = '#0A0A0A';
          //       }
          //     }
          //     // Also target any direct tabbed-pane-header in the main area
          //     document.querySelectorAll('.main .tabbed-pane-header, .tabbed-pane-header').forEach(el => {
          //       el.style.backgroundColor = '#0A0A0A';
          //       el.style.background = '#0A0A0A';
          //     });
          //   };
          //   // Override any existing inline styles with gray backgrounds
          //   const observer = new MutationObserver(() => {
          //     updateTopTabBar();
          //     document.querySelectorAll('[style*="#3C3C3C"], [style*="#282828"], [style*="rgb(60, 60, 60)"], [style*="rgb(40, 40, 40)"]').forEach(el => {
          //       el.style.backgroundColor = '#0A0A0A';
          //       el.style.background = '#0A0A0A';
          //     });
          //     // Also check computed styles and override
          //     document.querySelectorAll('*').forEach(el => {
          //       const computed = getComputedStyle(el);
          //       if (computed.backgroundColor === 'rgb(60, 60, 60)' ||
          //           computed.backgroundColor === 'rgb(40, 40, 40)' ||
          //           computed.backgroundColor === '#3C3C3C' ||
          //           computed.backgroundColor === '#282828') {
          //         el.style.backgroundColor = '#0A0A0A';
          //         el.style.background = '#0A0A0A';
          //       }
          //     });
          //   });
          //   observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
          //   // Run initial scan including top tab bar update
          //   updateTopTabBar();
          //   document.querySelectorAll('*').forEach(el => {
          //     const computed = getComputedStyle(el);
          //     if (computed.backgroundColor === 'rgb(60, 60, 60)' ||
          //         computed.backgroundColor === 'rgb(40, 40, 40)' ||
          //         computed.backgroundColor === '#3C3C3C' ||
          //         computed.backgroundColor === '#282828') {
          //       el.style.backgroundColor = '#0A0A0A';
          //       el.style.background = '#0A0A0A';
          //     }
          //   });
          //   // Run the update again after a short delay to catch dynamically loaded content
          //   setTimeout(updateTopTabBar, 100);
          //   setTimeout(updateTopTabBar, 500);
          // `);
        }
        //   console.log('devtools web contents', devToolsWebContents)
        //   if (!devToolsWebContents) return
        //   // i dont think this is needed tbh
        //   if (!devToolsWebContents) return
        //   devToolsWebContents.on('before-input-event', (_e, input) => {
        //     if ((input.control || input.meta) && input.key.toLowerCase() === 'c')
        //       devToolsWebContents.copy()
        //     else if ((input.control || input.meta) && input.key.toLowerCase() === 'v')
        //       devToolsWebContents.paste()
        //     else if ((input.control || input.meta) && input.key.toLowerCase() === 'x')
        //       devToolsWebContents.cut()
        //     else if ((input.control || input.meta) && input.key.toLowerCase() === 'a')
        //       devToolsWebContents.selectAll()
        //   })
        //   devToolsWebContents.on('context-menu', (_e, params) => {
        //     const menu = Menu.buildFromTemplate([
        //       {
        //         label: 'Copy',
        //         enabled: params.selectionText.length > 0,
        //         click: () => clipboard.writeText(params.selectionText)
        //       },
        //       { label: 'Paste', click: () => devToolsWebContents.paste() },
        //       { type: 'separator' },
        //       { label: 'Select All', click: () => devToolsWebContents.selectAll() }
        //     ])
        //     menu.popup()
        //   })
      })

      browserViews.set(args.tabId, view)
      await view.webContents.loadURL(args.url)
    } else {
    }

    return { ok: true }
  },
  async switchTab(tabId: string) {
    if (!mainWindow) throw new Error('Window not ready')

    const view = browserViews.get(tabId)
    if (!view) return { ok: false, error: 'Tab not found' }

    if (activeBrowserViewId.current && activeBrowserViewId.current !== tabId) {
      const currentView = browserViews.get(activeBrowserViewId.current)
      if (currentView) {
        try {
          // Workaround for Electron removeChildView zombie view issue (#44652)
          try {
            currentView.setVisible(false)
          } catch {}
          try {
            currentView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
          } catch {}
        } catch {}
      }
    }
    try {
      mainWindow.contentView.addChildView(view)
    } catch {}
    try {
      view.setVisible(true)
    } catch {}
    layoutBrowserView(view, tabId)
    activeBrowserViewId.current = tabId
    return { ok: true }
  },
  async closeTab(tabId: string) {
    if (!mainWindow) throw new Error('Window not ready')
    const view = browserViews.get(tabId)
    if (view) {
      if (activeBrowserViewId.current === tabId) {
        try {
          // Ensure the view is fully hidden before removal to avoid zombie views
          try {
            view.setVisible(false)
          } catch {}
          try {
            view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
          } catch {}
          mainWindow.contentView.removeChildView(view)
        } catch {}
        activeBrowserViewId.current = null
      }
      ;(view as any).webContents.destroy()
      browserViews.delete(tabId)
    }
    return { ok: true }
  },
  async loadUrl(args: { tabId: string; url: string }) {
    const view = browserViews.get(args.tabId)
    if (!view) throw new Error(`Tab ${args.tabId} not found`)

    // if the url is the same, don't load it again

    const normalizedCurrentUrl = view.webContents.getURL().replace(/\/$/, '')
    const normalizedNewUrl = args.url.replace(/\/$/, '')

    if (normalizedCurrentUrl !== normalizedNewUrl) {
      await view.webContents.loadURL(args.url)
    }

    return { ok: true }
  },
  async toggleDevTools() {
    if (!activeBrowserViewId.current) throw new Error('No active tab')
    const view = browserViews.get(activeBrowserViewId.current)
    if (!view) throw new Error('Active tab not found')
    view.webContents.toggleDevTools()
    return { ok: true, opened: view.webContents.isDevToolsOpened() }
  },
  async openDevToolsPanel(panel: string) {
    if (!activeBrowserViewId.current) throw new Error('No active tab')
    const view = browserViews.get(activeBrowserViewId.current)
    if (!view) throw new Error('Active tab not found')
    const isOpen = view.webContents.isDevToolsOpened()
    if (panel === 'inspector') {
      if (isOpen) {
        view.webContents.closeDevTools()
        return { ok: true, panel, opened: false }
      } else {
        const bounds = view.getBounds()
        view.webContents.inspectElement(Math.floor(bounds.width / 2), Math.floor(bounds.height / 2))
        return { ok: true, panel, opened: true }
      }
    }
    if (isOpen) view.webContents.closeDevTools()
    else view.webContents.openDevTools({ mode: 'bottom' })
    return { ok: true, panel, opened: !isOpen }
  },
  async reload() {
    if (!activeBrowserViewId.current) throw new Error('No active tab')
    const view = browserViews.get(activeBrowserViewId.current)
    if (!view) throw new Error('Active tab not found')
    view.webContents.reload()
    return { ok: true }
  },
  async navigate(url: string) {
    if (!activeBrowserViewId.current) throw new Error('No active tab')
    const view = browserViews.get(activeBrowserViewId.current)
    if (!view) throw new Error('Active tab not found')
    await view.webContents.loadURL(url)
    return { ok: true }
  },
  async backNav() {
    if (!activeBrowserViewId.current) throw new Error('No active tab')
    const view = browserViews.get(activeBrowserViewId.current)
    if (!view) throw new Error('Active tab not found')
    view.webContents.navigationHistory.goBack()
    return { ok: true }
  },
  async forwardNav() {
    if (!activeBrowserViewId.current) throw new Error('No active tab')
    const view = browserViews.get(activeBrowserViewId.current)
    if (!view) throw new Error('Active tab not found')
    view.webContents.navigationHistory.goForward()
    return { ok: true }
  },
  async forceReload() {
    if (!activeBrowserViewId.current) throw new Error('No active tab')
    const view = browserViews.get(activeBrowserViewId.current)
    if (!view) throw new Error('Active tab not found')
    view.webContents.reloadIgnoringCache()
    return { ok: true }
  },
  async updatePanelSize(panelSize: number) {
    if (!mainWindow) return { ok: false }
    currentPanelSize = panelSize
    layoutAllBrowserViews()
    return { ok: true }
  },
  // auto updater, is this it?
  async updateWebContentViewBounds(
    tabId: string,
    bounds: { x: number; y: number; width: number; height: number }
  ) {
    if (!mainWindow) return { ok: false }

    webContentViewBounds.set(tabId, bounds)

    const view = browserViews.get(tabId)
    if (view) {
      // bro its totally not using the bounds lmao
      // okay it is because we are setting, but ug
      layoutBrowserView(view, tabId)
    }

    return { ok: true }
  },
  async clearWebContentViewBounds(tabId: string) {
    // Clear stored bounds to prevent stale positioning data
    webContentViewBounds.delete(tabId)
    return { ok: true }
  },
  async hideAll() {
    if (!mainWindow) return { ok: false }

    // Workaround for Electron bug #44652: WebContentsView removeChildView doesn't work properly
    // in versions 31.7.4+. The fix involves setting bounds to 0 first, then removing.
    // mainWindow.getChildWindows()
    browserViews.forEach((view) => {
      try {
        // Force hide by setting bounds to 0x0 first
        console.log('im fucking trying', view)

        view.setBounds({
          height: 0,
          width: 0,
          x: -1,
          y: -1
        })
      } catch (e) {
        console.log('sheet', e)
      }
      //   try {
      //     view.setVisible(false)
      //   } catch {}
      //   view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      // } catch {}
    })

    // Clear active view reference since we've hidden everything
    activeBrowserViewId.current = null

    return { ok: true }
  },
  async hideTab(_tabId: string) {
    if (!mainWindow) {
      throw new Error('noo')
      return { ok: false }
    }
    // const view = browserViews.get(tabId)
    // // console.log('what browser views whats going on', browserViews)

    // if (!view) {
    //   throw new Error('something awful has happened')
    // }
    // // if (view) {
    // //   // Make the view 50% smaller before hiding
    // try {
    //   view.setVisible(false)
    // } catch (e) {
    //   console.log('sheet', e)
    // }
    // try {
    //   view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    // } catch (e) {
    //   console.log('woop noop', e)
    // }
    // }

    console.log('hiding tab')

    await this.hideAll()

    // also update bounsd to be super small
    // view.setBounds({ x: 0, y: 0, width: 0, height: 0 })

    return { ok: true }
  },
  async showActive() {
    if (!mainWindow || !activeBrowserViewId.current) return { ok: false }
    const view = browserViews.get(activeBrowserViewId.current)
    if (view) {
      try {
        mainWindow.contentView.addChildView(view)
      } catch {}
      try {
        view.setVisible(true)
      } catch {}
      layoutBrowserView(view, activeBrowserViewId.current)
    }
    return { ok: true }
  },
  async takeScreenshot() {
    if (!activeBrowserViewId.current) throw new Error('No active tab')
    const view = browserViews.get(activeBrowserViewId.current)
    if (!view) throw new Error('Active tab not found')
    try {
      const image = await view.webContents.capturePage()
      const { clipboard } = require('electron')
      clipboard.writeImage(image)
      return { success: true }
    } catch (error) {
      console.error('Failed to take screenshot:', error)
      return { success: false, error }
    }
  },
  async focusActiveWebContent() {
    if (!activeBrowserViewId.current) throw new Error('No active tab')
    const view = browserViews.get(activeBrowserViewId.current)
    if (!view) throw new Error('Active tab not found')
    try {
      view.webContents.focus()
      return { success: true }
    } catch (error) {
      console.error('Failed to focus web content:', error)
      return { success: false, error }
    }
  }
}
