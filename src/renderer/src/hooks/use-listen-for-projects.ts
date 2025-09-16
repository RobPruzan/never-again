import { useAppContext } from '@renderer/app-context'
import { handlers } from '@renderer/lib/tipc'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
// import { useAppContext } from './app-context'

export const useListenForProjects = () => {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unlisten = handlers.projectsFound.listen(({ projects }) => {
      queryClient.setQueryData(['projects'], projects)
    })
    return unlisten
  }, [])
}
