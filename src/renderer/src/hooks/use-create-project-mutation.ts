import { useAppContext } from '@renderer/app-context'
import { client } from '@renderer/lib/tipc'
import { deriveRunningProjectId, toFocusedProject } from '@renderer/lib/utils'
import { Project, RunningProject } from '@shared/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export const useCreateProjectMutation = () => {
  const { setRoute, setFocusedProject } = useAppContext()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => client.createProject(),
    onSuccess: async ({ project, runningProject }) => {
      setRoute('webview')
      queryClient.setQueryData(['projects'], (old: Project[] = []) => {
        const exists = old?.some((p: Project) => p.path === project.path)
        return exists ? old : [...(old || []), project]
      })
      queryClient.setQueryData(['devServers'], (old: RunningProject[] = []) => {
        const runningProjectId = deriveRunningProjectId(runningProject)
        const exists = old?.some(
          (server: RunningProject) => deriveRunningProjectId(server) === runningProjectId
        )
        return exists ? old : [...(old || []), runningProject]
      })

      setFocusedProject(toFocusedProject(runningProject))
    }
  })
}
