import { client, handlers } from '@renderer/lib/tipc'
import { useEffect } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

export const useBrowserState = () => {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unlisten = handlers.browserUrlChanged.listen((evtOrPayload: any, maybe?: any) => {
      const p = (maybe !== undefined ? maybe : evtOrPayload) as { tabId: string; url: string }
      queryClient.setQueryData(
        ['browserState'],
        (prev: Awaited<ReturnType<typeof client.getBrowserState>> | undefined) => {
          if (!prev) return prev
          return {
            ...prev,
            tabs: prev.tabs.map((t) => (t.tabId === p.tabId ? { ...t, url: p.url } : t))
          }
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
