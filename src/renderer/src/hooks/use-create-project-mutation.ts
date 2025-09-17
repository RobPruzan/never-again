import { useAppContext } from '@renderer/app-context'
import { client } from '@renderer/lib/tipc'
import { deriveRunningProjectId } from '@renderer/lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export const useCreateProjectMutation = () => {
  const { setRoute, setFocusedProject } = useAppContext()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => client.createProject(),
    onSuccess: async ({ project, runningProject }) => {
      setRoute('webview')
      queryClient.setQueryData(['projects'], (old: any[] = []) => [...(old || []), project])
      queryClient.setQueryData(['devServers'], (old: any[] = []) => [
        ...(old || []),
        runningProject
      ])

      setFocusedProject({
        focusedTerminalId: null!,
        projectCwd: runningProject.cwd,

        projectId: deriveRunningProjectId(runningProject)
      })
    }
  })
}
