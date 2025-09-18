import { client, handlers } from '@renderer/lib/tipc'
import { useEffect } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

export const useBrowserState = () => {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unlisten = handlers.browserStateUpdate.listen((browserState) => {
      queryClient.setQueryData(
        ['browserState'],
        () => {
          return browserState
        }
      )
    })
    return unlisten
  }, [queryClient])

  const browserStateQuery = useSuspenseQuery({
    queryKey: ['browserState'],
    queryFn: () => client.getBrowserState()
  })

  return browserStateQuery
}
