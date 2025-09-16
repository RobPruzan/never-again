import React, { useState, useEffect, useRef } from 'react'
// import { useAppContext } from './components/app-context'
// import { ProjectItem } from './project-item'
// import { client } from './lib/tipc'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Project, RunningProject } from '@shared/types'
import { useAppContext } from '@renderer/app-context'
import { ProjectItem } from '@renderer/project-item'
import { client } from '@renderer/lib/tipc'
import { Loader2, Plus } from 'lucide-react'

type ProjectWithSize = Project & {
  sizeInBytes: number
  hasFavicon: boolean
}

type Workspace = {
  id: string
  label: string
  filter: (projects: ProjectWithSize[], runningProjects: RunningProject[]) => ProjectWithSize[]
}

export const Home = () => {
  const { projects, runningProjects } = useAppContext()
  console.log('running projects', runningProjects)

  const queryClient = useQueryClient()
  const reindexProjectsMutation = useMutation({
    mutationFn: () => client.reIndexProjects(),
    onSuccess: (projects) => {
      queryClient.setQueryData(['projects'], () => {
        return projects
      })
    }
  })

  const createWorkspaceMutation = useMutation({
    mutationFn: ({ label }: { label: string }) => client.createWorkspace({ label }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    }
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [currentWorkspace, setCurrentWorkspace] = useState('all')
  const [createPrompt, setCreatePrompt] = useState('')
  const createInputRef = useRef<HTMLTextAreaElement>(null)

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => client.getWorkspaces(),
    staleTime: 0
  })

  const assignments = workspacesData?.assignments ?? {}
  const customWorkspaces = workspacesData?.workspaces ?? []

  const workspaces: Array<Workspace> = React.useMemo(() => {
    const base: Array<Workspace> = [
      {
        id: 'all',
        label: 'All Projects',
        filter: (projects) => projects
      },
      {
        id: 'running',
        label: 'Running',
        filter: (projects, runningProjects) => {
          const runningPaths = new Set(runningProjects.map((p) => p.cwd))
          return projects.filter((p) => runningPaths.has(p.path))
        }
      }
    ]

    const customs: Array<Workspace> = customWorkspaces.map((ws) => ({
      id: ws.id,
      label: ws.label,
      filter: (projects) => {
        const paths = new Set(assignments[ws.id] ?? [])
        return projects.filter((p) => paths.has(p.path))
      }
    }))

    return [...base, ...customs]
  }, [customWorkspaces, assignments, runningProjects])
  const { data: projectsWithSizes = [], isLoading: isLoadingSizes } = useQuery({
    queryKey: ['projects-meta', projects.map((p) => p.path)],
    queryFn: async () => {
      if (projects.length === 0) return []
      console.log(
        'projects with undefined paths',
        projects.filter((p) => p.path === undefined)
      )

      const meta = await client.getProjectsMeta({ paths: projects.map((p) => p.path) })
      const map = new Map(meta.map((m) => [m.path, m]))
      return projects.map((p) => {
        const m = map.get(p.path)
        return {
          ...p,
          sizeInBytes: m?.sizeInBytes ?? 0,
          hasFavicon: m?.hasFavicon ?? false
        }
      })
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000
  })

  const filteredProjects = React.useMemo(() => {
    // Apply workspace filter
    const currentWorkspaceConfig = workspaces.find((w) => w.id === currentWorkspace)
    let filtered = currentWorkspaceConfig
      ? currentWorkspaceConfig.filter(projectsWithSizes, runningProjects)
      : projectsWithSizes

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(query) || p.path.toLowerCase().includes(query)
      )
    }

    // Sort projects
    filtered.sort((a, b) => {
      if (a.hasFavicon !== b.hasFavicon) {
        return b.hasFavicon ? 1 : -1
      }
      return b.sizeInBytes - a.sizeInBytes
    })

    return filtered
  }, [projectsWithSizes, searchQuery, currentWorkspace, runningProjects, workspaces])

  return (
    <div className="flex flex-col flex-1 bg-[#080808] text-[#a0a0a0] font-sans overflow-hidden">
      {/* Header */}
      <div className="bg-[#0a0a0a] border-b border-[#1a1a1a] px-3 py-2 flex items-center gap-4 flex-shrink-0">
        <div className="relative w-64 flex-shrink-0">
          <input
            type="text"
            className="w-full px-2.5 pr-8 py-1 bg-[#050505] border border-[#1a1a1a] rounded text-[#e0e0e0] text-xs outline-none transition-colors focus:border-[#2a2a2a] h-6"
            id="search-input"
            placeholder="Search projects... (s)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <svg
            className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-[#555] pointer-events-none"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 scrollbar-none">
          {workspaces.map((workspace) => {
            const count =
              workspace.id === 'all'
                ? projectsWithSizes.length
                : workspace.filter(projectsWithSizes, runningProjects).length

            return (
              <button
                key={workspace.id}
                className={`px-3 py-1 rounded text-xs cursor-pointer whitespace-nowrap transition-all h-6 ${
                  currentWorkspace === workspace.id
                    ? 'bg-[#141414] text-[#d0d0d0]'
                    : 'bg-transparent text-[#666] hover:bg-[#0f0f0f] hover:text-[#888]'
                }`}
                onClick={() => setCurrentWorkspace(workspace.id)}
              >
                {workspace.label} ({count})
              </button>
            )
          })}
          <button
            className="ml-1 px-2 py-1 rounded text-xs cursor-pointer whitespace-nowrap transition-all h-6 bg-transparent text-[#666] hover:bg-[#0f0f0f] hover:text-[#888] border border-transparent hover:border-[#1f1f1f] flex items-center gap-1 flex-shrink-0"
            onClick={() => {
              const label = window.prompt('New workspace name')?.trim()
              if (label) createWorkspaceMutation.mutate({ label })
            }}
            title="Create workspace"
          >
            <Plus size={12} />
            New
          </button>
        </div>
        <button
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer whitespace-nowrap transition-all h-6 border border-[#222] ${
            reindexProjectsMutation.isPending
              ? 'bg-[#181818] text-[#888] cursor-wait'
              : 'bg-transparent text-[#666] hover:bg-[#0f0f0f] hover:text-[#888]'
          }`}
          onClick={() => {
            if (reindexProjectsMutation.isPending) return
            reindexProjectsMutation.mutate()
          }}
          disabled={reindexProjectsMutation.isPending}
          title="Reindex Projects"
          style={{ minWidth: 32 }}
        >
          {reindexProjectsMutation.isPending ? (
            <Loader2 className="animate-spin" size={16} strokeWidth={2} />
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 1 9 9" />
              <polyline points="3 16 3 12 7 12" />
            </svg>
          )}
          <span className="hidden sm:inline">
            {reindexProjectsMutation.isPending ? 'Reindexing...' : 'Reindex'}
          </span>
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 p-4 overflow-y-auto min-h-0">
        {isLoadingSizes ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[#606060]">Calculating project sizes...</div>
          </div>
        ) : filteredProjects.length === 0 && projectsWithSizes.length === 0 ? (
          <div className="text-center py-20 px-5 text-[#404040]">
            <h2 className="text-xl mb-3 text-[#606060]">No Projects Yet</h2>
            <p className="text-sm leading-relaxed">
              Click the + button to create your first project
              <br />
              or start a development server
            </p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-20 px-5 text-[#404040]">
            <h2 className="text-xl mb-3 text-[#606060]">No Projects Found</h2>
            <p className="text-sm leading-relaxed">
              {searchQuery ? 'Try a different search term' : 'No projects in this workspace'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5 mb-10">
            {/* Create grid item - clean and simple */}
            <div className="flex flex-col">
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg overflow-hidden transition-all duration-300 min-h-[240px] flex flex-col hover:border-[#2a2a2a] hover:shadow-[0_12px_24px_rgba(0,0,0,0.4)]">
                <textarea
                  ref={createInputRef}
                  data-create-input
                  className="flex-1 w-full min-h-[200px] px-3.5 py-3 bg-transparent border-none text-[#e0e0e0] text-sm resize-none outline-none placeholder:text-[#404040]"
                  placeholder="Describe your project idea... (c)"
                  value={createPrompt}
                  onChange={(e) => setCreatePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                    }
                  }}
                />

                <div className="px-2 py-1 bg-[#0c0c0c] border-t border-[#1a1a1a] flex items-center justify-between gap-2.5 h-8">
                  <button
                    className="px-3 py-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#c0c0c0] text-xs font-medium cursor-pointer transition-all outline-none whitespace-nowrap hover:bg-[#242424] hover:border-[#333] hover:text-[#e0e0e0] hover:transform hover:-translate-y-px active:transform-none"
                    onClick={() => {}}
                  >
                    Create Project
                  </button>
                </div>
              </div>
            </div>

            {filteredProjects.map((project) => (
              <ProjectItem key={project.path} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
