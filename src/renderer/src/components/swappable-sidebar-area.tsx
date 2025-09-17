import { useFocusedProject } from '@renderer/app-context'
import { Terminalv2 } from './terminal-v2'

export const SwappableSidebarArea = () => {
  const focusedProject = useFocusedProject()

  return (
    <div className="w-full h-full">
      <Terminalv2 startCommand={`bun run /Users/robby/ide/temp-cli.ts`} cwd={focusedProject?.cwd} />
    </div>
  )
}
