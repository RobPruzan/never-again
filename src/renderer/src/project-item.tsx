import React from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Project, RunningProject } from '@shared/types'
import { client } from './lib/tipc'
import { Loader2 } from 'lucide-react'
import { useAppContext } from './app-context'
import { deriveRunningProjectId } from './lib/utils'
// import { useAppContext } from './components/app-context'

export const ProjectItem = ({ project }: { project: Project }) => {
  const { data: faviconResult } = useQuery({
    queryKey: ['project-favicon', project.path],
    queryFn: () => client.getProjectFavicon({ projectPath: project.path }),
    staleTime: 60_000,
    gcTime: 5 * 60_000
  })
  const queryClient = useQueryClient()
  const favicon = faviconResult && faviconResult.found ? faviconResult.dataUrl : null
  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => client.getWorkspaces()
  })

  const customWorkspaces = workspacesData?.workspaces ?? []
  const assignments: Record<string, string[]> = workspacesData?.assignments ?? {}
  const assignedWorkspaceIds = new Set(
    Object.entries(assignments)
      .filter(([_id, paths]) => Array.isArray(paths) && paths.includes(project.path))
      .map(([id]) => id)
  )

  const [menuOpen, setMenuOpen] = React.useState(false)
  const [menuPos, setMenuPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const containerRef = React.useRef<HTMLDivElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!menuOpen) return
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const openContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const x = e.clientX
    const y = e.clientY
    setMenuPos({ x, y })
    setMenuOpen(true)
  }

  const assignMutation = useMutation({
    mutationFn: ({ workspaceId }: { workspaceId: string }) =>
      client.assignProjectToWorkspace({ workspaceId, projectPath: project.path }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    }
  })

  const unassignMutation = useMutation({
    mutationFn: ({ workspaceId }: { workspaceId: string }) =>
      client.unassignProjectFromWorkspace({ workspaceId, projectPath: project.path }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    }
  })

  const createWorkspaceMutation = useMutation({
    mutationFn: ({ label }: { label: string }) => client.createWorkspace({ label }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    }
  })
  const startDevServerMutation = useMutation({
    mutationFn: ({ projectPath }: { projectPath: string }) => client.startDevRelay({ projectPath }),
    onSuccess: ({ project, runningProject }) => {
      // setProjects((prev) => [...prev, project])
      setFocusedProject({
        projectCwd: project.path,
        focusedTerminalId: runningProject.port.toString(),
        projectId: deriveRunningProjectId(runningProject)
      })

      // queryClient.setQueryData(['projects'], (prev: Project[]) => [...prev, project])
      // queryClient.setQueryData(['devServers'], (prev: RunningProject[]) => [
      //   ...prev,
      //   runningProject
      // ])
    }
  })

  const { setFocusedProject, setRoute } = useAppContext()
  return (
    <div
      key={project.path}
      ref={containerRef}
      onContextMenu={openContextMenu}
      className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg overflow-hidden transition-all duration-300 cursor-pointer relative min-h-[252px] hover:border-[#2a2a2a] hover:shadow-[0_12px_24px_rgba(0,0,0,0.4)] group"
    >
      <div className="w-full h-[200px] relative bg-[#0B0B0B] overflow-hidden block group/content">
        <button
          onClick={() => {
            const existing = (
              queryClient.getQueryData(['devServers']) as Array<RunningProject> | undefined
            )?.find((p) => p.cwd === project.path)
            console.log('exsting bruh', existing)

            if (existing) {
              setRoute('webview')
              const focusedProejct = {
                focusedTerminalId: null!,
                projectCwd: project.path,
                projectId: deriveRunningProjectId(existing)

                // projectId: deriveRunningProjectId({
                //   runningKind: 'starting',
                //   cwd: project.path,
                //   kind: 'unknown', // whatever fix later :p
                //   pid: -1 // oops idk heh
                // })
              }
              console.log('SETTING FOCSUED PROJECT', focusedProejct)

              setFocusedProject(focusedProejct)
              return
            }
            startDevServerMutation.mutate({ projectPath: project.path })
          }}
          className="absolute top-3 right-3 z-20 opacity-0 group-hover/content:opacity-100 transition-all duration-200 w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg transform scale-90 group-hover/content:scale-100 hover:bg-white hover:scale-105 active:scale-95"
        >
          {startDevServerMutation.isPending ? (
            <Loader2 className="w-5 h-5 text-black ml-0.5 animate-spin" />
          ) : (
            <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        {favicon ? (
          <div className="w-full h-full flex items-center justify-center relative">
            {/* Glow layer - subtle blur */}
            {/* <img
              src={favicon}
              alt=""
              className="absolute w-16 h-16 rounded-md opacity-30"
              style={{
                filter: 'blur(2px)',
                transform: 'scale(1.2)'
              }}
              draggable={false}
            /> */}
            {/* Main favicon */}
            <img
              src={favicon}
              alt="project favicon"
              className="w-16 h-16 rounded-md shadow-lg relative z-10"
              draggable={false}
            />
          </div>
        ) : (
          <div className="w-full h-full bg-[#0B0B0B] flex flex-col items-center justify-center gap-3">
            {/* Default app icon */}
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#1a1a1a] to-[#151515] flex items-center justify-center shadow-lg border border-[#2a2a2a]">
              <svg
                className="w-8 h-8 text-[#606060]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div className="text-[#505050] text-xs">Click to launch</div>
          </div>
        )}
      </div>
      <div className="px-2 py-1 border-t border-[#1a1a1a] relative h-12 flex flex-col justify-center pointer-events-auto">
        <div className="text-xs font-medium text-[#c0c0c0]">
          <span>{project.name}</span>
        </div>
        <div
          className="text-[10px] text-[#606060] transition-colors truncate hover:bg-[#1a1a1a] hover:text-[#808080] cursor-pointer px-1 py-0.5 -mx-1 rounded group relative pointer-events-auto"
          onClick={async (e) => {
            e.stopPropagation()
            console.log('Copy button clicked for:', project.path)

            await window.api.clipboard.writeText(project.path)
          }}
          title="Click to copy path"
        >
          {project.path}
          {/* Copy icon that appears on hover */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <svg
              className="w-3 h-3 text-[#808080]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
        </div>
      </div>

      {menuOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 bg-[#101010] border border-[#2a2a2a] rounded-md min-w-[200px] shadow-xl"
            style={{ left: Math.max(8, menuPos.x), top: Math.max(8, menuPos.y) }}
          >
            <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-[#666] border-b border-[#1a1a1a]">
              Workspaces
            </div>
            <div className="py-1 max-h-[260px] overflow-auto">
              {customWorkspaces.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[#808080]">No custom workspaces</div>
              ) : (
                customWorkspaces.map((ws) => {
                  const assigned = assignedWorkspaceIds.has(ws.id)
                  const pending = assignMutation.isPending || unassignMutation.isPending
                  return (
                    <button
                      key={ws.id}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                        assigned ? 'text-[#d0d0d0]' : 'text-[#b0b0b0]'
                      } hover:bg-[#151515]`}
                      disabled={pending}
                      onClick={() => {
                        if (assigned) {
                          unassignMutation.mutate({ workspaceId: ws.id })
                        } else {
                          assignMutation.mutate({ workspaceId: ws.id })
                        }
                        setMenuOpen(false)
                      }}
                    >
                      <span
                        className={`inline-block w-3 h-3 rounded-sm border ${
                          assigned ? 'bg-white/80 border-white/80' : 'border-[#333]'
                        }`}
                      />
                      <span className="truncate">{ws.label}</span>
                    </button>
                  )
                })
              )}
            </div>
            <div className="border-t border-[#1a1a1a]">
              <button
                className="w-full text-left px-3 py-2 text-sm text-[#a0a0a0] hover:bg-[#151515]"
                onClick={() => {
                  const label = window.prompt('New workspace name')?.trim()
                  if (label) {
                    createWorkspaceMutation.mutate({ label })
                  }
                  setMenuOpen(false)
                }}
              >
                Create workspace…
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
