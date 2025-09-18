import { useCallback, useEffect, useState } from 'react'
import { client, v2Client } from '../lib/tipc'
import { Plus, X, ChevronLeft, ChevronRight, RotateCw, Link, HomeIcon } from 'lucide-react'
import { Terminalv2 } from './terminal-v2'
import { useAppContext, useFocusedProject } from '@renderer/app-context'
import { useBrowserState } from './use-browser-state'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'
import { SwappableSidebarArea } from './swappable-sidebar-area'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable'
import { iife } from '@renderer/lib/utils'
import { useMutation } from '@tanstack/react-query'
import { RunningProject } from '@shared/types'
type Terminal = {
  terminalId: string
}

export function MainSidebar({runningProject} : {runningProject: RunningProject}) {
  const [terminals, setTerminals] = useState<Array<Terminal>>([])
  const { setFocusedProject, swappableSidebarOpen } = useAppContext()
  const focusedProject = useFocusedProject()
  const [focusedTerminalId, setFocusedTerminalId] = useState<string | null>(null)
  const [terminalLoading, setTerminalLoading] = useState(false)
  const [isReloadSpinning, setIsReloadSpinning] = useState(false)

  // there's some desync here possible, the actual fix is in the actual browser tba logic // what the hell was i talking about
  const createNewTerminal = useCallback(async () => {
    if (!focusedProject?.cwd) return

    setTerminalLoading(true)
    const session = await v2Client.terminalV2Create({
      cwd: runningProject.cwd,
      startCommand: 'claude --dangerously-skip-permissions' //  pretty fast so wont blow up my computer if we make too many terminals when testing
    })

    setTerminals((prev) => [
      ...prev,
      {
        terminalId: session.id
      }
    ])
    setTerminalLoading(false)

    setFocusedTerminalId(session.id)
    return session
  }, [focusedProject?.cwd])

  useEffect(() => {
    iife(async () => {
      if (terminals.length !== 0) {
        return
      }
      await createNewTerminal()
    })
  }, [terminals.length])

  // fine, idk
  const handleRefresh = () => {
    client.reload().catch(() => {})
    setIsReloadSpinning(true)
  }

  const browserStateQuery = useBrowserState()
  const activeTabId = browserStateQuery.data?.activeTabId
  const activeTabUrl = browserStateQuery.data?.tabs.find((t) => t.tabId === activeTabId)?.url

  const [urlInput, setUrlInput] = useState(activeTabUrl || '')
  const [isEditing, setIsEditing] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)

  const deleteTerminalMutation = useMutation({
    mutationFn: (opts: { terminalId: string }) => {
      return client.terminalDestroy(opts.terminalId)
    },
    onSuccess: async (_, variables) => {
      setTerminals((prev) => prev.filter((p) => p.terminalId !== variables.terminalId))
      if (terminals.length === 1) {
        const newTerminal = await createNewTerminal()
        if (!newTerminal) {
          throw new Error(
            'todo error handling, but prefer pre create validation if possible future me'
          )
        }
        setFocusedTerminalId(newTerminal.id)
        return
      }
      setFocusedTerminalId(terminals[0].terminalId)
    },
    onError: (e) => {
      console.log('shit', e)
    }
  })

  useEffect(() => {
    if (!isEditing) {
      setUrlInput(activeTabUrl || '')
    }
  }, [activeTabUrl, isEditing])

  const normalizeUrl = (value?: string) => {
    const trimmed = (value || '').trim()
    if (!trimmed) return ''
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return trimmed.startsWith('localhost') || trimmed.includes('127.0.0.1')
        ? `http://${trimmed}`
        : `https://${trimmed}`
    }
    return trimmed
  }

  const handleUrlNavigation = async () => {
    if (isCommitting) return
    setIsCommitting(true)
    const normalized = normalizeUrl(urlInput)
    if (!normalized || normalized === (activeTabUrl || '')) {
      setIsEditing(false)
      setUrlInput(activeTabUrl || '')
      setIsCommitting(false)
      return
    }
    await client.navigate(normalized).catch(() => {})
    setIsEditing(false)
    await browserStateQuery.refetch().catch(() => {})
    setIsCommitting(false)
  }

  // TODO: this is wrong set in application menu shortcut later
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        const newTerminal = await createNewTerminal()
        if (newTerminal) {
          setFocusedTerminalId(newTerminal.id)
        }
        return
      }

      if (!e.metaKey || e.key < '1' || e.key > '9') return
      if (!terminals) return

      const terminalIndex = parseInt(e.key) - 1
      if (!terminals[terminalIndex]) return

      setFocusedTerminalId(terminals[terminalIndex].terminalId)
      // todo: we need to focus the terminal but that means we need to access that set of terminal refs, which we will do later
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [terminals, setFocusedProject, createNewTerminal])

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A]">
      <div
        className="flex items-center bg-[#0A0A0A] border-b border-[#1A1A1A]"
        style={{ height: '36px' }}
      >
        <div className="flex items-center px-1">
          <button
            className="p-1 hover:bg-[#1A1A1A] text-gray-500 hover:text-gray-300 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Back"
            disabled={!browserStateQuery.data?.canGoBack}
            onClick={() => {
              console.log('back nav')
              client.backNav()
            }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            className="p-1 hover:bg-[#1A1A1A] text-gray-500 hover:text-gray-300 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Forward"
            disabled={!browserStateQuery.data?.canGoForward}
            onClick={() => {
              console.log('forward nav')

              client.forwardNav()
            }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleRefresh}
            className="p-1 hover:bg-[#1A1A1A] text-gray-500 hover:text-gray-300 rounded transition-colors"
            title="Refresh"
          >
            <RotateCw
              className={`w-4 h-4 ${isReloadSpinning ? 'animate-[spin_0.6s_linear_1]' : ''}`}
              onAnimationEnd={() => setIsReloadSpinning(false)}
            />
          </button>
        </div>

        <div className="flex-1 mx-2">
          <div className="flex items-center bg-[#141414] rounded-md px-2 py-1 border border-[#1A1A1A] focus-within:border-[#333] transition-colors">
            <input
              type="text"
              value={urlInput || ''}
              onClick={(e) => {
                ;(e.target as HTMLInputElement).select()
              }}
              onFocus={() => setIsEditing(true)}
              onChange={(e) => {
                setIsEditing(true)
                setUrlInput(e.target.value)
              }}
              onKeyDown={async (e) => {
                if (e.key !== 'Enter') return
                await handleUrlNavigation()
                ;(e.target as HTMLInputElement).blur()
              }}
              onBlur={async () => {
                await handleUrlNavigation()
              }}
              className="flex-1 bg-transparent text-gray-300 text-xs focus:outline-none placeholder-gray-600"
              placeholder="Enter URL or search..."
            />
            <button
              className="ml-1 p-0.5 hover:bg-[#2A2A2A] text-gray-500 hover:text-gray-300 rounded transition-colors"
              title="Copy Link"
            >
              <Link className="w-3 h-3" />
            </button>
            <button
              className="ml-1 p-0.5 hover:bg-[#2A2A2A] text-gray-500 hover:text-gray-300 rounded transition-colors"
              title="More Options"
              onClick={() => {
                switch (focusedProject?.runningKind) {
                  case 'starting': {
                    return // todo prevalidation
                  }
                  case 'listening': {
                    client.navigate(`http://localhost:${focusedProject.port}`)
                  }
                }
              }}
            >
              <HomeIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
      {/* mark: terminal stuff */}

      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="vertical">
          {swappableSidebarOpen && (
            <>
              {/* not sure how i feel about this yet and what it truly should represent */}
              <ResizablePanel defaultSize={30}>
                <SwappableSidebarArea />
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          <ResizablePanel defaultSize={swappableSidebarOpen ? 70 : 100}>
            <div className="flex flex-col h-full min-h-0">
              <div className="bg-[#0A0A0A] p-2">
                <div className="flex gap-1.5">
                  {/* mark: terminal tabs */}
                  {terminals.map((terminal, index) => (
                    <div
                      key={terminal.terminalId}
                      className={`
                flex-1 relative group cursor-pointer overflow-hidden
                transition-all duration-200 hover:bg-[#1A1A1A]
              `}
                      onClick={() => {
                        setFocusedTerminalId(terminal.terminalId)
                      }}
                      style={{ height: '42px', borderRadius: '2px' }}
                    >
                      <div
                        className={`w-full h-full border ${terminal.terminalId === focusedTerminalId ? 'bg-[#0F0F0F] border-[#1A1A1A]' : 'bg-[#080808] border-[#151515]'}`}
                        style={{ borderRadius: '2px' }}
                      >
                        <div className="w-full h-full flex items-center px-2.5 relative">
                          {index < 9 && (
                            <span className="text-[9px] mr-2 font-mono" style={{ color: '#444' }}>
                              ⌘{index + 1}
                            </span>
                          )}
                          <span
                            className={`text-xs truncate flex-1 ${
                              terminal.terminalId === focusedTerminalId
                                ? 'text-[#999]'
                                : 'text-[#555]'
                            }`}
                          >
                            {/* todo */}
                            {/* {tab.processTitle || `Terminal ${index + 1}`} */}
                            {`Terminal ${index + 1}`}
                          </span>

                          <button
                            onClick={async () => {
                              deleteTerminalMutation.mutate({ terminalId: terminal.terminalId })
                            }}
                            className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#1A1A1A] transition-opacity"
                          >
                            {deleteTerminalMutation.isPending ? (
                              <div className="w-2.5 h-2.5 border border-[#555] border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <X className="w-2.5 h-2.5" style={{ color: '#555' }} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add Terminal Button */}
                  <button
                    onClick={createNewTerminal}
                    className="flex-shrink-0 cursor-pointer border border-dashed hover:bg-[#0F0F0F] transition-all flex items-center justify-center group"
                    style={{
                      width: '42px',
                      height: '42px',
                      borderColor: '#1A1A1A',
                      borderRadius: '2px'
                    }}
                    title="New Terminal"
                  >
                    <Plus className="w-5 h-5 transition-colors" style={{ color: '#444' }} />
                  </button>
                </div>
              </div>

              {/* Terminal content */}
              <div className="flex-1 min-h-0 relative overflow-hidden">
                {terminalLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-[#333] border-t-[#666] rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-[#666] text-sm">Loading terminal...</p>
                    </div>
                  </div>
                ) : (
                  terminals.map((tab) => {
                    const isActive = tab.terminalId === focusedTerminalId
                    return (
                      <div
                        key={tab.terminalId}
                        style={{ display: isActive ? 'block' : 'none' }}
                        className="h-full"
                      >
                        <Terminalv2
                          startCommand={'claude --dangerously-skip-permissions'}
                          terminalId={tab.terminalId}
                          cwd={focusedProject?.cwd}
                        />
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
