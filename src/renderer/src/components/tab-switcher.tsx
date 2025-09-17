import { useState, useEffect, useCallback } from 'react'
// import { useAppContext } from './app-context'
import { handlers } from '../lib/tipc'
import { useQuery } from '@tanstack/react-query'
import { client } from '../lib/tipc'
import { useAppContext } from '@renderer/app-context'
import { useRunningProjects } from '@renderer/hooks/use-running-projects'

const MAX_VISIBLE_TABS = 9 // Limit to prevent overflow

export const TabSwitcher = () => {
  return null
}
