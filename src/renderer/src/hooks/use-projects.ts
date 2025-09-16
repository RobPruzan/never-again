import { client } from "@renderer/lib/tipc"
import { useSuspenseQuery } from "@tanstack/react-query"

export const useProjects = () => {
  return useSuspenseQuery({
    queryKey: ['projects'],
    queryFn: () => client.getProjects()
  })

}