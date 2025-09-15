import { useEffect, useRef, useState } from 'react'
import { WindowPortal } from '@renderer/window-portal'
import { client, handlers } from '@renderer/lib/tipc'
import { Search } from 'lucide-react'

export function UpdateURLPalette() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Listen for menu event to open the palette
  useEffect(() => {
    const unlisten = handlers.changeURL.listen(async () => {
      try {
        const state = await client.getBrowserState()
        const activeTab = state.tabs.find((t: any) => t.isActive)
        setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '')
      } catch {}
      setOpen(true)
    })
    return unlisten
  }, [])

  // Focus and select input when opened
  useEffect(() => {
    if (!open) return
    if (inputRef.current) {
      inputRef.current.focus()
      setTimeout(() => {
        inputRef.current?.select()
      }, 0)
    }
  }, [open])

  const close = async () => {
    setOpen(false)
    try {
      window.api?.portal?.close('update-url')
    } catch {}
    await client.focusActiveWebContent().catch(() => {})
  }

  const handleBackdropClick = async (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      await close()
    }
  }

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      await close()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const url = input.trim()
      if (url) {
        await client.navigate(url).catch(console.error)
      }
      await close()
      return
    }
  }

  if (!open) return null

  return (
    <WindowPortal
      id="update-url"
      anchor={{ kind: 'percent', leftPct: 0, topPct: 0, widthPct: 100, heightPct: 100 }}
      onDismiss={() => setOpen(false)}
    >
      <div
        className="fixed inset-0 flex items-start justify-center pt-20 z-50"
        onClick={handleBackdropClick}
      >
        <div className="bg-[#0A0A0A] w-full max-w-xl rounded-xl shadow-2xl overflow-hidden border border-[#1A1A1A]">
          <div className="flex items-center px-4 py-3 border-b border-[#1A1A1A]">
            <Search className="w-4 h-4 text-gray-400 mr-3 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter URL..."
              className="w-full bg-transparent text-white placeholder-gray-400 focus:outline-none text-sm"
            />
          </div>
        </div>
      </div>
    </WindowPortal>
  )
}
