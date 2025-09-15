// import { BrowserV2 } from './BrowserV2'
import { client } from '../lib/tipc'
// import { DevToolsSidebar } from './DevToolsSidebar'
import { useQueryClient } from '@tanstack/react-query'
import { useListenForProjects } from '@renderer/hooks/use-listen-for-projects'
import { BrowserV2 } from './browser-v2'
import { DevToolsSidebar } from './devtools-sidebar'
// import { useListenForProjects } from './use-listen-for-projects'

export function AppLayout() {
  // important
  // wish it was better though tbh
  // uh
  useListenForProjects()
  client.showActive().catch(() => {})
  // like we set state on server then synced state
  const queryClient = useQueryClient()

  queryClient.prefetchQuery({
    queryKey: ['browserState'],
    queryFn: () => client.getBrowserState()
  })
  queryClient.prefetchQuery({
    queryKey: ['devServers'],
    queryFn: () => client.getDevServers()
  })
  // queryClient.prefetchQuery({
  //   queryKey: ['projects'],
  //   queryFn: () => client.getProjects()
  // })

  return (
    <div className="h-screen w-screen bg-[#0A0A0A] overflow-hidden flex">
      <div className="w-12 flex-shrink-0 border-r border-[#1A1A1A]">
        <DevToolsSidebar />
      </div>

      <BrowserV2 />
    </div>
  )
}
