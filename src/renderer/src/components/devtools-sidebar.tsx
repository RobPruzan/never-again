import { useState } from 'react'
import { MousePointer2, Bug, Camera, Command, Code2, PanelBottom } from 'lucide-react'
import { client } from '@renderer/lib/tipc'
import { useAppContext, useFocusedProject } from '@renderer/app-context'
// import { useAppContext, useFocusedProject } from './app-context'

interface Tool {
  id: string
  icon: React.ReactNode
  title: string
  isActive?: boolean
}

export function DevToolsSidebar() {
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [screenshotCopied, setScreenshotCopied] = useState(false)
  const { setCommandPaletteOpen } = useAppContext()

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

  const tools = [
    { id: 'screenshot' as const, icon: <Camera className="w-4 h-4" />, title: 'Screenshot' },
    // {
    //   id: 'inspector' as const,
    //   icon: <MousePointer2 className="w-4 h-4" />,
    //   title: 'Inspect Element'
    // },
    { id: 'devtools' as const, icon: <Bug className="w-4 h-4" />, title: 'Toggle DevTools' },
    {
      id: 'command-palette' as const,
      icon: <Command className="w-4 h-4" />,
      title: 'Command Palette'
    },
    {
      icon: <Code2 className="w-4 h-4" />,
      title: 'Open in editor',
      id: 'open-in-editor' as const
    },
    {
      icon: <PanelBottom className="w-4 h-4" />,
      title: 'Bottom Panel',
      id: 'bottom-panel' as const
    }
  ]
  const focusedProject = useFocusedProject()

  const handleToolClick = async (
    toolId: 'screenshot' | 'devtools' | 'command-palette' | 'open-in-editor' | 'bottom-panel'
  ) => {
    setActiveTool(toolId)

    switch (toolId) {
      case 'screenshot': {
        await client.takeScreenshot()
        setScreenshotCopied(true)
        setTimeout(() => setScreenshotCopied(false), 2000)
        setActiveTool(null)
        break
      }
      case 'command-palette': {
        setCommandPaletteOpen(true)
        break
      }
      case 'devtools': {
        await client.toggleDevTools() // todo toggle state correctly
        setActiveTool(null)
        break
      }
      case 'open-in-editor': {
        // impl open in vscode using uri
        if (!focusedProject?.cwd) return
        const uri = `vscode://file/${focusedProject.cwd}`
        window.open(uri, '_blank')
        setActiveTool(null)
        break
      }
      case 'bottom-panel': {
        setActiveTool(null)

        // setActiveTool(null)
      }
      // case 'inspector': {
      //   // todo might delete
      //   break
      // }
    }
  }

  return (
    <div className="w-full h-full bg-[#0A0A0A] flex flex-col items-center">
      <div
        className="flex flex-col items-center pt-2"
        style={{ paddingTop: isMac ? '28px' : '8px' }}
      >
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool.id)}
            title={tool.title}
            className={`
              w-10 h-10 flex items-center justify-center mb-1
              text-gray-400 hover:text-white transition-colors
              rounded-md hover:bg-[#1A1A1A] relative
              ${activeTool === tool.id ? 'bg-[#1A1A1A] text-white' : ''}
              ${tool.id === 'screenshot' && screenshotCopied ? 'text-green-400' : ''}
            `}
          >
            {tool.id === 'screenshot' && screenshotCopied ? (
              <div className="flex flex-col items-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            ) : (
              tool.icon
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
