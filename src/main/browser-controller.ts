import { WebContentsView, Menu, clipboard } from 'electron'
import { getRendererHandlers } from '@egoist/tipc/main'
import { mainWindow, browserViews, activeBrowserViewId } from '.'

// fuck you claude
// LEGACY: These constants are only used for fallback layout when no specific bounds are stored
export const sidebarWidth = 48 // DevToolsSidebar width (w-12 = 3rem = 48px)
export const tabBarHeight = 36 // TabBar height (h-9 = 2.25rem = 36px)
export let currentPanelSize = 75 // Default browser panel size (75%) - LEGACY

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
      isActive: tabId === activeBrowserViewId.current
    }))

    return {
      tabs,
      activeTabId: activeBrowserViewId.current,
      totalTabs: tabs.length
    }
  },
  async createTab(args: { tabId: string; url: string }) {
    // console.log('creating tab')

    if (!mainWindow) throw new Error('Window not ready')
    console.log('next up')

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
      view.webContents.on('did-finish-load', () => {
        console.log(`BrowserView ${args.tabId} finished loading`)
      })

      // Track URL changes
      view.webContents.on('did-navigate', (_event, url) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            const handlers = getRendererHandlers<any>(mainWindow.webContents)
            handlers.browserUrlChanged.send({ tabId: args.tabId, url })
          } catch {}
        }
      })

      view.webContents.on('did-navigate-in-page', (_event, url) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            const handlers = getRendererHandlers<any>(mainWindow.webContents)
            handlers.browserUrlChanged.send({ tabId: args.tabId, url })
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
        console.log('devtools web contents', devToolsWebContents)
        if (!devToolsWebContents) return
        devToolsWebContents
          .executeJavaScript(
            `
          const div = document.createElement('div');
          
          document.body.style.backgroundColor = '#0A0A0A';
          document.documentElement.style.backgroundColor = '#0A0A0A';
          
          const changeBackgroundColors = () => {
            const allElements = document.querySelectorAll('*');
            allElements.forEach(el => {
              const computedStyle = window.getComputedStyle(el);
              if (computedStyle.backgroundColor && computedStyle.backgroundColor !== 'transparent' && computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                el.style.backgroundColor = '#0A0A0A !important';
              }
              if (!el.style.backgroundColor || el.style.backgroundColor === '') {
                el.style.backgroundColor = '#0A0A0A !important';
              }
              
              // Target common DevTools elements
              if (el.classList.contains('tabbed-pane-header') || 
                  el.classList.contains('tabbed-pane-header-tab') ||
                  el.classList.contains('tabbed-pane-header-tabs-drop-down-container') ||
                  el.classList.contains('toolbar') ||
                  el.classList.contains('panel') ||
                  el.classList.contains('widget') ||
                  el.classList.contains('vbox') ||
                  el.classList.contains('hbox') ||
                  el.classList.contains('flex-auto') ||
                  el.classList.contains('header') ||
                  el.classList.contains('tab') ||
                  el.getAttribute('role') === 'tablist' ||
                  el.getAttribute('role') === 'tab' ||
                  el.tagName === 'HEADER') {
                el.style.backgroundColor = '#0A0A0A !important';
              }
              
              // Override any remaining gray backgrounds
              if (computedStyle.backgroundColor.includes('rgb(') && 
                  (computedStyle.backgroundColor.includes('128') || 
                   computedStyle.backgroundColor.includes('136') ||
                   computedStyle.backgroundColor.includes('68') ||
                   computedStyle.backgroundColor.includes('58') ||
                   computedStyle.backgroundColor.includes('48') ||
                   computedStyle.backgroundColor.includes('38'))) {
                el.style.backgroundColor = '#0A0A0A !important';
              }
            });
            
            // Add CSS rule to override any remaining backgrounds
            const style = document.createElement('style');
            style.textContent = \`
              * {
                background-color: #0A0A0A !important;
              }
              .tabbed-pane-header,
              .tabbed-pane-header-tab,
              .tabbed-pane-header-tabs-drop-down-container,
              .toolbar,
              .panel,
              .widget,
              .vbox,
              .hbox,
              .flex-auto,
              [role="tablist"],
              [role="tab"],
              header {
                background-color: #0A0A0A !important;
              }
            \`;
            document.head.appendChild(style);
          };
          
          changeBackgroundColors();
          
          const observer = new MutationObserver(() => {
            changeBackgroundColors();
          });
          observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
          
          // Force update after a short delay to catch dynamically loaded content
          setTimeout(changeBackgroundColors, 100);
          setTimeout(changeBackgroundColors, 500);
          setTimeout(changeBackgroundColors, 1000);
        `
          )
          .catch(() => {})

        if (!devToolsWebContents) return
        devToolsWebContents.on('before-input-event', (_e, input) => {
          if ((input.control || input.meta) && input.key.toLowerCase() === 'c')
            devToolsWebContents.copy()
          else if ((input.control || input.meta) && input.key.toLowerCase() === 'v')
            devToolsWebContents.paste()
          else if ((input.control || input.meta) && input.key.toLowerCase() === 'x')
            devToolsWebContents.cut()
          else if ((input.control || input.meta) && input.key.toLowerCase() === 'a')
            devToolsWebContents.selectAll()
        })
        devToolsWebContents.on('context-menu', (_e, params) => {
          const menu = Menu.buildFromTemplate([
            {
              label: 'Copy',
              enabled: params.selectionText.length > 0,
              click: () => clipboard.writeText(params.selectionText)
            },
            { label: 'Paste', click: () => devToolsWebContents.paste() },
            { type: 'separator' },
            { label: 'Select All', click: () => devToolsWebContents.selectAll() }
          ])
          menu.popup()
        })
      })

      browserViews.set(args.tabId, view)
      console.log(`Loading URL for tab ${args.tabId}:`, args.url)
      await view.webContents.loadURL(args.url)
    } else {
      console.log('skipped')
    }

    return { ok: true }
  },
  async switchTab(tabId: string) {
    if (!mainWindow) throw new Error('Window not ready')
    console.log('switching tab', tabId)

    const view = browserViews.get(tabId)
    if (!view) return { ok: false, error: 'Tab not found' }

    if (activeBrowserViewId.current && activeBrowserViewId.current !== tabId) {
      const currentView = browserViews.get(activeBrowserViewId.current)
      if (currentView) {
        try {
          mainWindow.contentView.removeChildView(currentView)
        } catch {}
      }
    }
    mainWindow.contentView.addChildView(view)
    layoutBrowserView(view, tabId)
    activeBrowserViewId.current = tabId
    console.log(`Switched to tab ${tabId}`)
    return { ok: true }
  },
  async closeTab(tabId: string) {
    if (!mainWindow) throw new Error('Window not ready')
    const view = browserViews.get(tabId)
    if (view) {
      if (activeBrowserViewId.current === tabId) {
        try {
          mainWindow.contentView.removeChildView(view)
        } catch {}
        activeBrowserViewId.current = null
      }
      ;(view as any).webContents.destroy()
      browserViews.delete(tabId)
      console.log(`Closed tab ${tabId}`)
    }
    return { ok: true }
  },
  async loadUrl(args: { tabId: string; url: string }) {
    console.log('loading with args', args)

    const view = browserViews.get(args.tabId)
    if (!view) throw new Error(`Tab ${args.tabId} not found`)

    // if the url is the same, don't load it again
    console.log('what is the url', view.webContents.getURL(), args.url)

    const normalizedCurrentUrl = view.webContents.getURL().replace(/\/$/, '')
    const normalizedNewUrl = args.url.replace(/\/$/, '')

    if (normalizedCurrentUrl !== normalizedNewUrl) {
      await view.webContents.loadURL(args.url)
      console.log(`Loading new URL for tab ${args.tabId}:`, args.url)
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
    browserViews.forEach((view) => {
      try {
        // Force hide by setting bounds to 0x0 first
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
        mainWindow!.contentView.removeChildView(view)
      } catch {}
    })

    // Clear active view reference since we've hidden everything
    activeBrowserViewId.current = null

    return { ok: true }
  },
  async hideTab(tabId: string) {
    if (!mainWindow) {
      console.log('no main window', tabId)
      return { ok: false }
    }
    const view = browserViews.get(tabId)
    if (view) {
      // Make the view 50% smaller before hiding
      const bounds = view.getBounds()
      view.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: Math.floor(bounds.width * 0.5),
        height: Math.floor(bounds.height * 0.5)
      })
    }
    console.log('browser views', browserViews)

    if (view) {
      console.log('removing view', tabId, view)
      // await this.hideAll()

      // also update bounsd to be super small
      console.log('prev on content view', mainWindow.contentView.children)
      // view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      mainWindow.contentView.removeChildView(view)
      console.log('all views on content view', mainWindow.contentView.children)
    }

    return { ok: true }
  },
  async showActive() {
    if (!mainWindow || !activeBrowserViewId.current) return { ok: false }
    const view = browserViews.get(activeBrowserViewId.current)
    if (view) {
      mainWindow.contentView.addChildView(view)
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
