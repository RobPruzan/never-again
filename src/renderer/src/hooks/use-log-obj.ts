import { client, handlers } from '@renderer/lib/tipc'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ProcessLogsMapping } from '@shared/types'
import { useEffect } from 'react'

export const useLogObj = () => {
  const logsObjQuery = useSuspenseQuery<ProcessLogsMapping>({
    queryKey: ['logsObj'],
    queryFn: () => client.getProcessLogsMapping()
  })

  return logsObjQuery
}

export const useLogObjUpdate = () => {
  const queryClient = useQueryClient()
  useEffect(() => {
    const unListen = handlers.onProcessLogsMappingUpdate.listen((logsObj) => {
      queryClient.setQueryData(['logsObj'], () => logsObj)
    })

    return () => {
      unListen()
    }
  }, [])
}
