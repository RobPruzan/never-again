import { useEffect, useState } from 'react'
// import { Terminalv2 } from './Terminalv2'
import { client, v2Client } from '../lib/tipc'
import { Plus, X, ChevronLeft, ChevronRight, RotateCw, Link, HomeIcon } from 'lucide-react'
// import { useAppContext, useFocusedProject, type TerminalInstance } from './app-context'
// import { useBrowserState } from './use-browser-state'
import { Terminalv2 } from './terminal-v2'
import { TerminalInstance, useAppContext, useFocusedProject } from '@renderer/app-context'
import { useBrowserState } from './use-browser-state'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'
import { SwappableSidebarArea } from './swappable-sidebar-area'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable'
import { deriveRunningProjectId } from '@renderer/lib/utils'

export function MainSidebar() {
  const runningProjects = useRunningProjects().data
  const { terminals, setTerminals, setFocusedProject } = useAppContext()
  const focusedProject = useFocusedProject()

  // there's some desync here possible, the actual fix is in the actual browser tba logic
  const createNewTerminal = async () => {
    if (!focusedProject?.cwd) return

    const session = await v2Client.terminalV2Create({ cwd: focusedProject.cwd })
    if (!focusedProject) return

    const newTerminal: TerminalInstance = {
      terminalId: session.id,
      projectId: deriveRunningProjectId(focusedProject)
    }

    setTerminals((prev) => [...prev, newTerminal])

    setFocusedProject((prev) => {
      if (!prev) return null
      return {
        ...prev,
        focusedTerminalId: session.id
      }
    })
  }

  // fine, idk
  const handleRefresh = () => {
    client.reload().catch(() => {})
  }

  const browserStateQuery = useBrowserState()
  const activeTabId = browserStateQuery.data?.activeTabId
  const activeTabUrl = browserStateQuery.data?.tabs.find((t) => t.tabId === activeTabId)?.url

  const [urlInput, setUrlInput] = useState(activeTabUrl || '')
  const [isEditing, setIsEditing] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)

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
            <RotateCw className="w-4 h-4" />
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

      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={30}>
            <SwappableSidebarArea />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={70}>
            <div className="flex flex-col h-full min-h-0">
              <div className="bg-[#0A0A0A] p-2">
                <div className="flex gap-1.5">
                  {terminals
                    .filter(
                      (t) =>
                        focusedProject && t.projectId === deriveRunningProjectId(focusedProject)
                    )
                    .map((tab, index) => (
                      <div
                        key={tab.terminalId}
                        className={`
                flex-1 relative group cursor-pointer overflow-hidden
                transition-all duration-200 hover:bg-[#1A1A1A]
              `}
                        onClick={() => {
                          const terminalId = tab.terminalId
                          console.log('handleSelectTab called with:', terminalId)
                          console.log('current focusedProject:', focusedProject)
                          if (!focusedProject) return
                          setFocusedProject((prev) => {
                            if (!prev) return null
                            const newState = {
                              ...prev,
                              focusedTerminalId: terminalId
                            }
                            console.log('setting new focusedProject state:', newState)
                            return newState
                          })
                          const handleSelectTab = (terminalId: string) => {}
                        }}
                        style={{ height: '42px', borderRadius: '2px' }}
                      >
                        {/* Placeholder Terminal Preview */}
                        <div
                          className={`w-full h-full border ${tab.terminalId === focusedProject?.focusedTerminalId ? 'bg-[#0F0F0F] border-[#1A1A1A]' : 'bg-[#080808] border-[#151515]'}`}
                          style={{ borderRadius: '2px' }}
                        >
                          <div className="w-full h-full flex items-center px-2.5 relative">
                            {/* Show keyboard shortcut hint */}
                            {index < 9 && (
                              <span className="text-[9px] mr-2 font-mono" style={{ color: '#444' }}>
                                ⌘{index + 1}
                              </span>
                            )}
                            {/* Show process title or terminal icon */}
                            <span
                              className={`text-xs truncate flex-1 ${
                                tab.terminalId === focusedProject?.focusedTerminalId
                                  ? 'text-[#999]'
                                  : 'text-[#555]'
                              }`}
                            >
                              {/* todo */}
                              {/* {tab.processTitle || `Terminal ${index + 1}`} */}
                              {`Terminal ${index + 1}`}
                            </span>

                            {/* Close button */}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation()
                                const terminalId = tab.terminalId
                                await v2Client.terminalV2Destroy(terminalId)
                                setTerminals((prev) => {
                                  if (!prev) return []
                                  const newTerminals = prev.filter(
                                    (t) => t.terminalId !== terminalId
                                  )
                                  if (!focusedProject?.cwd) return []
                                  if (
                                    focusedProject.focusedTerminalId === terminalId &&
                                    newTerminals.length > 0
                                  ) {
                                    const projectTerminals = newTerminals.filter(
                                      (t) => t.projectId === deriveRunningProjectId(focusedProject)
                                    )
                                    if (projectTerminals.length > 0) {
                                      if (!focusedProject?.cwd) return []
                                      setFocusedProject((prev) => {
                                        if (!prev) return null
                                        return {
                                          ...prev,
                                          focusedTerminalId:
                                            projectTerminals[projectTerminals.length - 1].terminalId
                                        }
                                      })
                                    }
                                  }
                                  return newTerminals
                                })
                              }}
                              className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#1A1A1A] transition-opacity"
                            >
                              <X className="w-2.5 h-2.5" style={{ color: '#555' }} />
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
                {/* Render ALL terminals but only show ones for active project and active tab */}
                {terminals.map((tab) => {
                  // Find the CWD for this terminal's project
                  const project = runningProjects.find(
                    (p) => deriveRunningProjectId(p) === tab.projectId
                  )
                  const terminalCwd =
                    project?.cwd ||
                    (tab.terminalId === focusedProject?.focusedTerminalId
                      ? project?.cwd
                      : undefined)

                  const isVisible =
                    tab.projectId ===
                      (focusedProject ? deriveRunningProjectId(focusedProject) : null) &&
                    tab.terminalId === focusedProject?.focusedTerminalId

                  return (
                    <div
                      key={tab.terminalId}
                      className="absolute inset-0 overflow-hidden"
                      style={{
                        visibility: isVisible ? 'visible' : 'hidden',
                        pointerEvents: isVisible ? 'auto' : 'none',
                        opacity: isVisible ? '1' : '0'
                      }}
                    >
                      <Terminalv2
                        startCommand={'claude ---dangerously-skip-permissions'}
                        terminalId={tab.terminalId}
                        cwd={terminalCwd}
                        // onReady={(sessionId) => handleTerminalReady(tab.terminalId, sessionId)}
                        // onExit={() => handleTerminalExit(tab.terminalId)}
                        // isActive={isVisible}
                      />
                    </div>
                  )
                })}

                {!focusedProject?.cwd && (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <div className="text-center">
                      <p>Select a project tab to open terminals</p>
                    </div>
                  </div>
                )}

                {terminals.filter((t) => t.projectId === focusedProject?.cwd).length === 0 &&
                  focusedProject?.cwd && (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <div className="text-center">
                        <p>No terminals open for this project</p>
                        <button
                          onClick={createNewTerminal}
                          className="mt-2 px-3 py-1 bg-[#1A1A1A] hover:bg-[#2A2A2A] rounded text-sm transition-colors"
                        >
                          Open Terminal
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
