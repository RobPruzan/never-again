import { client, handlers } from '@renderer/lib/tipc'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { LogsObj } from '@shared/types'
import { useEffect } from 'react'

export const useLogObj = () => {
  const logsObjQuery = useSuspenseQuery<LogsObj>({
    queryKey: ['logsObj'],
    queryFn: () => client.getLogsObj()
  })

  return logsObjQuery
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
