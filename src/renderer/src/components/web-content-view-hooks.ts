import { client } from '@renderer/lib/tipc'
import { useState, useEffect, useRef } from 'react'

// export function useWebContentViewLifecycle(id: string, url: string) {
//   const [isReady, setIsReady] = useState(false)

//   useEffect(() => {
//     let mounted = true

//     const initialize = async () => {
//       try {
//         // console.log('creating tab')
//         // await client.createTab({ tabId: id, url })

//         if (mounted) {
//           setIsReady(true)
//         }
//       } catch (error) {
//         console.error('Failed to initialize WebContentView:', error)
//       }
//     }

//     initialize()

//     return () => {
//       mounted = false
//       // client.clearWebContentViewBounds(id).catch(() => {})
//     }
//   }, [id])

//   return isReady
// }

export function useWebContentViewUrl(id: string, url: string, isReady: boolean) {
  useEffect(() => {
    if (!isReady) return

    const updateUrl = async () => {
      try {
        await client.loadUrl({ tabId: id, url })
      } catch (error) {
        console.error('Failed to load URL:', error)
      }
    }

    updateUrl()
  }, [id, url, isReady])
}

export function useWebContentViewTabSwitching(id: string, url: string, isReady: boolean) {
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    if (!isReady) return

    const switchToTab = async () => {
      try {
        await client.createTab({ tabId: id, url })
        await client.switchTab(id)
        // eh?
        // await client.showActive()
        setIsActive(true)
      } catch (error) {
        console.error('Failed to switch tab:', error)
        setIsActive(false)
      }
    }

    switchToTab()
  }, [id, isReady, url])

  return isActive
}

export function useWebContentViewPositioning(
  containerRef: React.RefObject<HTMLDivElement | null>,
  isReady: boolean,
  tabId: string
) {
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const lastBoundsRef = useRef<DOMRect | null>(null)
  const hasMountedRef = useRef(false)

  const updateBounds = async (forceUpdate = false) => {
    console.log('updating bounds', tabId)

    if (!containerRef.current || !isReady) return

    const bounds = containerRef.current.getBoundingClientRect()
    const lastBounds = lastBoundsRef.current

    const shouldUpdate =
      forceUpdate ||
      !hasMountedRef.current ||
      !lastBounds ||
      bounds.x !== lastBounds.x ||
      bounds.y !== lastBounds.y ||
      bounds.width !== lastBounds.width ||
      bounds.height !== lastBounds.height

    if (!shouldUpdate) {
      return
    }

    lastBoundsRef.current = bounds
    hasMountedRef.current = true

    try {
      await client.updateWebContentViewBounds({
        tabId,
        bounds: {
          x: Math.floor(bounds.x),
          y: Math.floor(bounds.y),
          width: Math.floor(bounds.width),
          height: Math.floor(bounds.height)
        }
      })
    } catch (error) {
      console.error('Failed to update web content view bounds:', error)
    }
  }
  const didUpdateRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || !isReady) return

    // console.log('updating bounds', bounds)

    if (didUpdateRef.current) return
    didUpdateRef.current = true

    updateBounds(true)
    resizeObserverRef.current = new ResizeObserver(() => {
      // console.log('updating via resize observer', tabId)
      updateBounds() // wat, u need the el
    })

    resizeObserverRef.current.observe(containerRef.current)

    const handleWindowChange = () => {
      updateBounds() // idk if this does anything lol
    }

    window.addEventListener('resize', handleWindowChange)
    window.addEventListener('scroll', handleWindowChange, true)

    // // stupid stupid
    // const timeoutId = setTimeout(() => {
    //   updateBounds(true)
    // }, 100)

    return () => {
      // clearTimeout(timeoutId)
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
      }
      window.removeEventListener('resize', handleWindowChange)
      window.removeEventListener('scroll', handleWindowChange, true)
    }
  }, [isReady, tabId])
}
// :%s/^function /export function /g
