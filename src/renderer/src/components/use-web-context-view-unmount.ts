import { client } from '@renderer/lib/tipc'
import { useUnmountSignal } from '@renderer/lib/utils'
import { useEffect } from 'react'

export const useWebContentViewUnmount = (id: string) => {
  const abortSignal = useUnmountSignal()

  useEffect(() => {
    const handler = () => {
      // console.log('trying to abort', id)

      client.hideTab(id) // set timeout may jank stuff tbd
    }
    abortSignal.addEventListener('abort', handler)

    return () => {
      // abortSignal.removeEventListener('abort' ,handler) why does uncommenting this break tab removal wut
    }
  }, [id, abortSignal])
}
