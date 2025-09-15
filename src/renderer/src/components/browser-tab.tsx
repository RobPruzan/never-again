import { Loader2, X } from 'lucide-react'
import { startTransition } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { client } from '@renderer/lib/tipc'
import { useAppContext, useFocusedProject } from '@renderer/app-context'

interface BrowserTabProps {
  id: string
  url: string
  title: string
  isActive: boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

export function BrowserTab({ projectId }: { projectId: string }) {
  const { runningProjects, setFocusedProject, setRoute, route } = useAppContext()
  const focusedProject = useFocusedProject()
  const isActive = projectId === focusedProject?.cwd && route === 'webview'

  const project = runningProjects.find((p) => p.cwd === projectId)
  const killProjectMutation = useMutation({
    mutationFn: async (opts: { port: number }) => {
      await client.killProject(opts)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['devServers'] })
    }
  })
  const queryClient = useQueryClient()

  if (!project) {
    throw new Error('invariant something went horribly wrong')
  }
  return (
    <div
      className={`
        group flex items-center gap-2 px-4 h-full cursor-pointer select-none
        border-r border-[#1A1A1A] min-w-[180px] max-w-[280px]
        relative
        ${isActive ? 'bg-[#1A1A1A] text-gray-200' : 'bg-[#0A0A0A] text-gray-500 hover:bg-[#0F0F0F]'}
        ${route !== 'webview' ? 'opacity-50' : ''}
      `}
      onClick={() => {
        startTransition(() => {
          setRoute('webview')
          setFocusedProject({
            projectId: project.cwd,
            focusedTerminalId: null! // uh
          })
        })
      }}
    >
      <div className="flex-1 truncate text-sm font-normal">{project.cwd.split('/').pop()}</div>

      <button
        onClick={async (e) => {
          e.stopPropagation()

          killProjectMutation.mutate({
            port: project.port
          })
        }}
        className={`hover:bg-[#2A2A2A] p-1 text-gray-500 hover:text-gray-300 transition-all rounded ${
          killProjectMutation.isPending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {killProjectMutation.isPending ? (
          <Loader2 className="animate-spin w-3 h-3" />
        ) : (
          <X className="w-3 h-3" />
        )}
      </button>
    </div>
  )
}
