import { client } from '@renderer/lib/tipc'
import { useUnmountSignal } from '@renderer/lib/utils'
import { useEffect } from 'react'

export const useWebContentViewUnmount = (id: string) => {
  const abortSignal = useUnmountSignal()

  useEffect(() => {
    return () => {
      console.log('clsoing tab', id);
      
      client.hideTab(id)
    }
  }, [id, abortSignal])
}
