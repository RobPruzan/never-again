import { client } from "@renderer/lib/tipc"
import { useSuspenseQuery } from "@tanstack/react-query"

export const useRunningProjects = () => {
  

  return useSuspenseQuery({
    queryKey: ['devServers'],
    queryFn: () => client.getDevServers()
  })
}