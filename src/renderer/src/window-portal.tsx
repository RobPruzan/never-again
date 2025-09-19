import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { client } from './lib/tipc'
import { WindowContext } from './window-context'

type PercentAnchor = {
  kind: 'percent'
  leftPct?: number
  topPct?: number
  widthPct?: number
  heightPct?: number
  center?: boolean
  fitToContent?: boolean
  marginPx?: number
  offsetPx?: { x?: number; y?: number }
}

type ElementAnchor = {
  kind: 'element'
  elementId: string
  offset?: { xPx?: number; yPx?: number; xPct?: number; yPct?: number }
  size?: { widthPx?: number; heightPx?: number; widthPct?: number; heightPct?: number }
}

export function WindowPortal({
  id,
  anchor,
  onDismiss,
  children
}: {
  id: string
  anchor: PercentAnchor | ElementAnchor
  onDismiss?: () => void
  children: React.ReactNode
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  if (!containerRef.current) containerRef.current = document.createElement('div')
  const winRef = React.useRef<Window | null>(null)
  const openedRef = React.useRef(false)

  React.useLayoutEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    winRef.current = window.open('', `portal:${id}`)
    const w = winRef.current
    if (!w) return
    const d = w.document
    // Copy styles from the host document so classes work inside the portal
    const copyStyles = (sourceDoc: Document, targetDoc: Document) => {
      const addLink = (href: string) => {
        try {
          const newLinkEl = targetDoc.createElement('link')
          newLinkEl.rel = 'stylesheet'
          newLinkEl.href = href
          targetDoc.head.appendChild(newLinkEl)
        } catch {}
      }
      Array.from(sourceDoc.styleSheets).forEach((styleSheet: any) => {
        try {
          const rules = styleSheet?.cssRules as CSSRuleList | undefined
          if (rules && rules.length) {
            const newStyleEl = targetDoc.createElement('style')
            Array.from(rules).forEach((cssRule) => {
              newStyleEl.appendChild(targetDoc.createTextNode(cssRule.cssText))
            })
            targetDoc.head.appendChild(newStyleEl)
          } else if (styleSheet?.href) {
            addLink(styleSheet.href)
          }
        } catch {
          if (styleSheet?.href) addLink(styleSheet.href)
        }
      })
    }
    d.body.style.margin = '0'
    d.body.style.height = '100vh'
    d.body.style.background = 'transparent'
    d.body.style.overflow = 'hidden'
    d.documentElement.style.overflow = 'hidden'
    d.documentElement.style.background = 'transparent'

    try {
      copyStyles(document, d)
    } catch {}
    d.body.appendChild(containerRef.current!)

    // this is awful, should be reactive
    // setTimeout(() => {
    //   console.log('focus portal window?')

    //   client.focusPortalWindow(id).catch(console.error)
    // }, 150) // is there that much latency when creating a portal winodw?? do we need to preopen? i need to profile
    // okay so why does this take so long?
    // wow 150 is the number

    // this is all useless, old experiment
    const sendHover = (hovering: boolean) => {
      try {
        window.opener?.postMessage({ type: 'portal-hover', id, hovering }, '*')
      } catch {}
    }
    const enter = () => sendHover(true)
    const leave = () => sendHover(false)
    d.addEventListener('pointerenter', enter, { capture: true } as any)
    d.addEventListener('pointerleave', leave, { capture: true } as any)
    return () => {
      d.removeEventListener('pointerenter', enter, { capture: true } as any)
      d.removeEventListener('pointerleave', leave, { capture: true } as any)
      try {
        // @ts-ignore (exposed by preload)

        console.log('is it this?')

        // window.api?.portal?.close(id)
      } catch {}
      // try {
      //   winRef.current?.close()
      // } catch {}
      // winRef.current = null
    }
  }, [id, onDismiss])

  React.useLayoutEffect(() => {
    const calcAndSend = () => {
      if (!anchor) return
      if (anchor.kind === 'percent') {
        const vw = window.innerWidth
        const vh = window.innerHeight
        const margin = anchor.marginPx ?? 12
        const el = containerRef.current!
        let width = 0
        let height = 0
        if (anchor.fitToContent) {
          const r = el.getBoundingClientRect()
          width = Math.max(r.width, (el as any).scrollWidth ?? 0)
          height = Math.max(r.height, (el as any).scrollHeight ?? 0)
        } else {
          width = Math.round(((anchor.widthPct ?? 0) / 100) * vw)
          height = Math.round(((anchor.heightPct ?? 0) / 100) * vh)
        }
        let x: number
        let y: number
        if (anchor.center) {
          x = Math.round(vw / 2 + (anchor.offsetPx?.x ?? 0) - width / 2)
          y = Math.round(vh / 2 + (anchor.offsetPx?.y ?? 0) - height / 2)
        } else {
          x = Math.round(((anchor.leftPct ?? 0) / 100) * vw + (anchor.offsetPx?.x ?? 0))
          y = Math.round(((anchor.topPct ?? 0) / 100) * vh + (anchor.offsetPx?.y ?? 0))
        }
        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
        x = clamp(x, margin, Math.max(margin, vw - width - margin))
        y = clamp(y, margin, Math.max(margin, vh - height - margin))
        window.api.portal.updateBounds(id, { x, y, width, height })
        return
      }
      if (anchor.kind === 'element') {
        const el = document.getElementById(anchor.elementId)
        if (!el) return
        const r = el.getBoundingClientRect()
        const x = Math.round(
          r.left + (anchor.offset?.xPx ?? 0) + (anchor.offset?.xPct ?? 0) * r.width
        )
        const y = Math.round(
          r.top + (anchor.offset?.yPx ?? 0) + (anchor.offset?.yPct ?? 0) * r.height
        )
        let width = r.width
        let height = r.height
        if (anchor.size?.widthPx != null) width = anchor.size.widthPx
        else if (anchor.size?.widthPct != null) width = r.width * anchor.size.widthPct
        if (anchor.size?.heightPx != null) height = anchor.size.heightPx
        else if (anchor.size?.heightPct != null) height = r.height * anchor.size.heightPct
        window.api.portal.updateBounds(id, {
          x,
          y,
          width: Math.round(width),
          height: Math.round(height)
        })
      }
    }
    const ro = new ResizeObserver(calcAndSend)
    ro.observe(document.documentElement)
    window.addEventListener('scroll', calcAndSend, true)
    window.addEventListener('resize', calcAndSend)
    calcAndSend()
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', calcAndSend, true)
      window.removeEventListener('resize', calcAndSend)
    }
  }, [anchor, id])

  return (
    <WindowContext value={{ winRef }}>
      {ReactDOM.createPortal(
        <>
          <FocusPortal id={id} />
          {children}
        </>,
        containerRef.current!
      )}
    </WindowContext>
  )
}

const FocusPortal = ({ id }: { id: string }) => {
  React.useEffect(() => {
    client.focusPortalWindow(id)
  }, [])
  return null
}
