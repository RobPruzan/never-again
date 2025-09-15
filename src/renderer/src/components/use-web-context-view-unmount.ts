import { client } from '@renderer/lib/tipc'
import { useUnmountSignal } from '@renderer/lib/utils'
import { useEffect } from 'react'

export const useWebContentViewUnmount = (id: string) => {
  const abortSignal = useUnmountSignal()

  useEffect(() => {
    const handler =() => {
      client.hideTab(id) // set timeout may jank stuff tbd
    }
    abortSignal.addEventListener('abort', handler)


    return () => {
      abortSignal.removeEventListener('abort' ,handler)


    }
  }, [id, abortSignal])
}
