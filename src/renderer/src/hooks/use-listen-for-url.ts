import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { handlers } from '@renderer/lib/tipc'

export function useListenForUrl() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unlisten = handlers.browserUrlChanged.listen(() => {
      queryClient.invalidateQueries({ queryKey: ['browserState'] })
    })

    return () => {
      try {
        unlisten?.()
      } catch {}
    }
  }, [queryClient])
}
