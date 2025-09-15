import { client } from '@renderer/lib/tipc'
import { useSuspenseQuery } from '@tanstack/react-query'

export const useBrowserState = () => {
  const browserStateQuery = useSuspenseQuery({
    queryKey: ['browserState'],
    queryFn: () => client.getBrowserState()
  })

  return browserStateQuery
}
