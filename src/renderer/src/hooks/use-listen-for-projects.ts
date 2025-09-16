import { useAppContext } from '@renderer/app-context'
import { handlers } from '@renderer/lib/tipc'
import { useEffect } from 'react'
// import { useAppContext } from './app-context'

export const useListenForProjects = () => {
  const { setProjects } = useAppContext()
  useEffect(() => {
    const unlisten = handlers.projectsFound.listen(({ projects }) => {
      // console.log('');
      
      setProjects(projects)
    })
    return unlisten
  }, [])
}
