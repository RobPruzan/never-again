import { useFocusedProject } from '@renderer/app-context'
import { Terminalv2 } from './terminal-v2'

export const SwappableSidebarArea = () => {
  const focusedProject = useFocusedProject()

  return (
    <div className="w-full h-full">
      <Terminalv2 cwd={focusedProject?.cwd} />
    </div>
  )
}
