import { client, handlers } from '@renderer/lib/tipc'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

export const useLogObj = () => {
  const lgosObjQuery = useSuspenseQuery({
    queryKey: ['logsObj'],
    queryFn: () => client.getLogsObj()
  })

  return lgosObjQuery
}

export const useLogObjUpdate = () => {
  const queryClient = useQueryClient()
  useEffect(() => {
    const unListen = handlers.onLogsObjUpdate.listen((logsObj) => {
      queryClient.setQueryData(['logsObj'], () => logsObj)
    })

    return () => {
      unListen()
    }
  }, [])
}
