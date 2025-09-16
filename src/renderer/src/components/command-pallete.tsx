import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
// import { useAppContext } from './app-context'
import { client } from '../lib/tipc'
import { useQuery } from '@tanstack/react-query'
import { Search, Sparkles } from 'lucide-react'
import { useAppContext } from '@renderer/app-context'

export const CommandPalette = () => {
  const { setCommandPaletteOpen, runningProjects: projects, setFocusedProject } = useAppContext()
  const [input, setInput] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeCategory, setActiveCategory] = useState<'all' | 'projects' | 'tools'>('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const itemsContainerRef = useRef<HTMLDivElement>(null)

  const handleBackdropClick = async (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setCommandPaletteOpen(false)
      window.api?.portal?.close('command-palette-poop')
      // Focus web content after closing command palette
      await client.focusActiveWebContent().catch(console.error)
    }
  }

  type CommandItem = {
    id: string
    label: string
    description?: string
    favicon?: string | null
    onSelect: () => Promise<void> | void
    category?: 'projects' | 'tools'
  }

  const closePalette = async () => {
    setCommandPaletteOpen(false)
    window.api?.portal?.close('command-palette-poop')
    await client.focusActiveWebContent().catch(console.error)
  }

  // Fetch favicons for all projects
  const faviconQueries = projects.map((project) => ({
    project,
    query: useQuery({
      queryKey: ['project-favicon', project.cwd],
      queryFn: () => client.getProjectFavicon({ projectPath: project.cwd }),
      staleTime: 60_000,
      gcTime: 5 * 60_000
    })
  }))

  const projectItems: CommandItem[] = useMemo(() => {
    return projects.map((project, index) => {
      const projectName = project.cwd.split('/').pop() || project.cwd
      const portInfo = project.port ? `localhost:${project.port}` : 'Not running'
      const faviconData = faviconQueries[index]?.query.data
      const favicon = faviconData?.found ? faviconData.dataUrl : null

      return {
        id: project.cwd,
        label: projectName,
        description: portInfo,
        category: 'projects' as const,
        favicon,
        onSelect: async () => {
          setFocusedProject((prev) => ({
            projectId: project.cwd,
            focusedTerminalId: prev?.focusedTerminalId || ''
          }))
          await closePalette()
        }
      }
    })
  }, [projects, setFocusedProject, faviconQueries])

  const extraItems: CommandItem[] = useMemo(() => {
    return [
      {
        id: 'toggle-devtools',
        label: 'Toggle DevTools',
        description: 'Show or hide developer tools',
        category: 'tools' as const,
        onSelect: async () => {
          await client.toggleDevTools()
          await closePalette()
        }
      }
    ]
  }, [])

  const items: CommandItem[] = useMemo(() => {
    let list: CommandItem[] = [...projectItems, ...extraItems]

    // Filter by category
    if (activeCategory !== 'all') {
      list = list.filter((item) => item.category === activeCategory)
    }

    const q = input.trim().toLowerCase()
    if (!q) return list

    // Enhanced fuzzy search
    return list.filter((i) => {
      const label = i.label.toLowerCase()
      const desc = (i.description || '').toLowerCase()

      // Check for exact substring match
      if (label.includes(q) || desc.includes(q)) return true

      // Check for fuzzy match (each char in order)
      let queryIndex = 0
      for (const char of label) {
        if (char === q[queryIndex]) {
          queryIndex++
          if (queryIndex === q.length) return true
        }
      }

      return false
    })
  }, [projectItems, extraItems, input, activeCategory])

  const handleSelectItem = async (item: CommandItem | undefined) => {
    if (!item) return
    try {
      await item.onSelect()
    } catch (error) {
      console.error('Failed to handle item selection:', error)
    }
  }

  // Focus input on mount with animation
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.select()
        }
      }, 0)
    }
  }, [])

  // Ensure focus stays on input when category changes
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [activeCategory])

  // Reset selection when search input or category changes
  useEffect(() => {
    setSelectedIndex(items.length > 0 ? 0 : -1)
  }, [input, activeCategory])

  // Auto-scroll to selected item
  useEffect(() => {
    if (itemsContainerRef.current && selectedIndex >= 0) {
      const container = itemsContainerRef.current
      const items = container.querySelectorAll('[data-command-item]')
      const selectedItem = items[selectedIndex] as HTMLElement

      if (selectedItem) {
        const containerRect = container.getBoundingClientRect()
        const itemRect = selectedItem.getBoundingClientRect()

        // Check if item is out of view
        if (itemRect.bottom > containerRect.bottom) {
          // Scroll down
          selectedItem.scrollIntoView({ block: 'end', behavior: 'instant' })
        } else if (itemRect.top < containerRect.top) {
          // Scroll up
          selectedItem.scrollIntoView({ block: 'start', behavior: 'instant' })
        }
      }
    }
  }, [selectedIndex])

  // When user types, keep first item selected
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
    // Don't clear selection, keep first item selected
  }

  // Key handling via hooks
  const navigationHandler = useListNavigationKeys({
    itemCount: items.length,
    selectedIndex,
    setSelectedIndex
  })

  const submitHandler = useEnterAndEscapeKeys({
    items,
    selectedIndex,
    onSelect: handleSelectItem,
    onClose: closePalette,
    ensureSelection: () => {
      // No need to ensure selection as we always select first item
    }
  })

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (navigationHandler(e)) return
    if (await submitHandler(e)) return
  }

  const categoryFilters = [
    { id: 'all', label: 'All' },
    { id: 'projects', label: 'Projects' },
    { id: 'tools', label: 'Tools' }
  ] as const

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[10vh] z-50"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-xl">
        <div className="bg-black rounded-lg border border-white/10 overflow-hidden">
          {/* Search input */}
          <div className="p-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              className="w-full bg-transparent text-white placeholder-white/40 focus:outline-none text-sm px-2 py-1"
            />
          </div>

          {/* Category filters */}
          <div className="px-3 pb-2 flex gap-2 border-b border-white/10">
            {categoryFilters.map((filter) => (
              <button
                key={filter.id}
                onClick={(e) => {
                  e.preventDefault()
                  setActiveCategory(filter.id)
                }}
                onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
                className={`px-3 py-1 text-xs rounded-md ${
                  activeCategory === filter.id
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:text-white/80'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Results */}
          <div ref={itemsContainerRef} className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-8 text-center text-white/40 text-sm">No results found</div>
            ) : (
              items.map((item, index) => (
                <CommandItem
                  key={item.id}
                  item={item}
                  isSelected={index === selectedIndex}
                  onClick={() => handleSelectItem(item)}
                  index={index}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-white/10 flex items-center gap-4 text-xs text-white/40">
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">↑↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">⏎</kbd>
              <span>Select</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">esc</kbd>
              <span>Close</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Command Item Component
const CommandItem = ({
  item,
  isSelected,
  onClick,
  index
}: {
  item: any
  isSelected: boolean
  onClick: () => void
  index: number
}) => {
  return (
    <div
      data-command-item
      data-index={index}
      className={`flex items-center px-3 py-2 cursor-pointer ${
        isSelected ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
      onClick={onClick}
    >
      {/* Favicon or placeholder */}
      <div className="w-6 h-6 mr-3 flex items-center justify-center flex-shrink-0">
        {item.favicon ? (
          <img src={item.favicon} alt="" className="w-4 h-4 rounded" draggable={false} />
        ) : (
          <div className="w-4 h-4 rounded bg-white/10" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm text-white">{item.label}</div>
        {item.description && <div className="text-xs text-white/50">{item.description}</div>}
      </div>
    </div>
  )
}

// Hooks
function useListNavigationKeys(params: {
  itemCount: number
  selectedIndex: number
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
}) {
  const { itemCount, selectedIndex, setSelectedIndex } = params

  return (e: React.KeyboardEvent): boolean => {
    // Handle both keydown and key repeat
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault()
      e.stopPropagation()
      if (itemCount === 0) return true
      setSelectedIndex((prev) => {
        const next = prev + 1
        return next >= itemCount ? 0 : next // Wrap around
      })
      return true
    }
    if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault()
      e.stopPropagation()
      if (itemCount === 0) return true
      setSelectedIndex((prev) => {
        const next = prev - 1
        return next < 0 ? itemCount - 1 : next // Wrap around
      })
      return true
    }
    return false
  }
}

function useEnterAndEscapeKeys(params: {
  items: Array<{ id: string } & { onSelect: () => Promise<void> | void }>
  selectedIndex: number
  ensureSelection: () => void
  onSelect: (item: any | undefined) => Promise<void>
  onClose: () => Promise<void>
}) {
  const { items, selectedIndex, onSelect, onClose, ensureSelection } = params
  return async (e: React.KeyboardEvent): Promise<boolean> => {
    if (e.key === 'Escape') {
      e.preventDefault()
      await onClose()
      return true
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      ensureSelection()
      const target = items[selectedIndex] || items[0]
      if (target) await onSelect(target)
      return true
    }
    return false
  }
}
