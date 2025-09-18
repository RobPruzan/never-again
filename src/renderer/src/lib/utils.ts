import { FocusedProject } from '@renderer/app-context'
import { RunningProject } from '@shared/types'
import { clsx, type ClassValue } from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'

export const deriveRunningProjectId = (project: RunningProject) => {
  switch (project.runningKind) {
    case 'listening': {
      return `${project.cwd}-${project.port}`
    }
    case 'starting': {
      return `starting-${project.cwd}`
    }
  }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export const iife = <T>(fn: () => T) => fn()

// todo: make strict mode safe
export function useUnmountSignal() {
  const [abortController] = useState(() => new AbortController())

  const abortTaskRef = useRef(() => {})

  useEffect(() => {
    const abortTask = () => abortController.abort()
    abortTaskRef.current = abortTask
    return () => {
      queueMicrotask(() => {
        if (abortTask === abortTaskRef.current) {
          abortTask()
        }
      })
    }
  }, [abortController])

  return abortController.signal
}


export const toFocusedProject = (runningProject: RunningProject): FocusedProject => {
  switch (runningProject.runningKind) {
    case 'listening': {
      return {
        port: runningProject.port,
        projectCwd: runningProject.cwd,
        projectId: deriveRunningProjectId(runningProject),
        runningKind: 'listening'
      }
    }
    case 'starting': {
      return {
        projectCwd: runningProject.cwd,
        projectId: deriveRunningProjectId(runningProject),
        runningKind: 'starting'
      }
    }
  }
}