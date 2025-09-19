import { useAppContext } from '@renderer/app-context'
import { client } from '@renderer/lib/tipc'
import { deriveRunningProjectId, toFocusedProject } from '@renderer/lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Project, RunningProject } from '@shared/types'

export function useOpenOrStartProject() {
  const { setRoute, setFocusedProject } = useAppContext()
  const queryClient = useQueryClient()

  const startMutation = useMutation({
    mutationFn: async (projectPath: string) => client.startDevRelay({ projectPath }),
    onSuccess: ({
      // project,
      runningProject }) => {
        // why would we want to optimsitic update the project itself? what?
      // queryClient.setQueryData(['projects'], (prev: Project[] | undefined) => {
      //   if (!prev) return [project]
      //   if (prev.some((p) => p.path === project.path)) return prev
      //   return [...prev, project]
      // })
      queryClient.setQueryData(['devServers'], (prev: RunningProject[] | undefined) => {
        if (!prev) return [runningProject]
        if (prev.some((p) => p.cwd === runningProject.cwd)) return prev
        return [...prev, runningProject]
      })

      setRoute('webview')
      setFocusedProject(toFocusedProject(runningProject))
    }
  })

  async function openOrStart(project: Project) {
    const devServers = (queryClient.getQueryData(['devServers']) as RunningProject[] | undefined) || []
    const existing = devServers.find((p) => p.cwd === project.path)

    if (existing) {
      setRoute('webview')
      setFocusedProject(toFocusedProject(existing))
      return { alreadyRunning: true as const, runningProject: existing }
    }

    const res = await startMutation.mutateAsync(project.path)
    return { alreadyRunning: false as const, runningProject: res.runningProject }
  }

  return { openOrStart, isStarting: startMutation.isPending }
}
