import { Loader2, X } from 'lucide-react'
import { startTransition } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { client } from '@renderer/lib/tipc'
import { useAppContext, useFocusedProject } from '@renderer/app-context'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'
import { deriveRunningProjectId, toFocusedProject } from '@renderer/lib/utils'

interface BrowserTabProps {
  id: string
  url: string
  title: string
  isActive: boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

/**
 *  i mean realisticly i just need to confirm that the projects are refetched by the time that the
 * wait whats the condition wut, the focused project is just fucked? right because before it didn't rely on the
 * id now it does, we just need to update the id hm that's interesting
 *
 * okay shit now we do need to know when the stuff is refetched? i think? like where the fuck is it happening
 *
 * so that we know to flip it, gr, i don't want to do that imperatively
 *
 *
 * dev servers must be refetched at some point, or is it just fetching it?
 *
 * lol but when does it know to stop suspending, i get its supposed to subscirbe to it but who the fuck invalidates it
 */
export function BrowserTab({
  projectId,
  children
}: {
  projectId: string
  children?: React.ReactNode
}) {
  const { setFocusedProject, setRoute, route } = useAppContext()
  const runningProjects = useRunningProjects().data
  const focusedProject = useFocusedProject()
  const isActive = focusedProject
    ? projectId === deriveRunningProjectId(focusedProject) && route === 'webview'
    : false

  const project = runningProjects.find((p) => deriveRunningProjectId(p) === projectId)
  const killProjectMutation = useMutation({
    mutationFn: async (opts: { pid: number }) => {
      await client.killProject(opts)
    },
    // onSuccess: async () => {

    // },
    onSettled: async (e) => {
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
          setFocusedProject(toFocusedProject(project))
        })
      }}
    >
      <div className="flex-1 truncate text-sm font-normal">{project.cwd.split('/').pop()}</div>
      {children}

      {/* {project.} */}
      <button
        onClick={async (e) => {
          e.stopPropagation()
          // queryClient.setQueryData(['devServers'], (old: any) => {
          //   if (!old || !Array.isArray(old)) return []
          //   return old.filter((p: any) => p.cwd !== project.cwd)
          // })

          // really we just need the pid, what am i doing
          setRoute('home')
          killProjectMutation.mutate({
            pid: project.pid
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
