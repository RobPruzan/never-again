'use client'
import { useEffect, useRef, useState, useImperativeHandle } from 'react'
import { client } from '../lib/tipc'
import { useWebContentViewUnmount } from './use-web-context-view-unmount'
import { useWebContentViewTabSwitching, useWebContentViewUrl, useWebContentViewPositioning } from './web-content-view-hooks'
// import {
//   useWebContentViewTabSwitching,
//   useWebContentViewUrl,
//   useWebContentViewPositioning
// } from './web-content-view-hooks'
// import { useWebContentViewUnmount } from './use-web-content-view-unmount'

export interface WebContentViewRef {
  reload: () => Promise<void>
  forceReload: () => Promise<void>
  navigate: (url: string) => Promise<void>
  toggleDevTools: () => Promise<{ ok: boolean; opened: boolean }>
  openDevToolsPanel: (panel: string) => Promise<{ ok: boolean; panel: string; opened: boolean }>
  takeScreenshot: () => Promise<{ success: boolean; error?: any }>
  focus: () => Promise<{ success: boolean; error?: any }>
}

// interface WebContentViewProps

/**
 * maybe this just works? Like i can't think what else we have to do since we're already maintaining
 * the views. Perhaps is visible if we render multiple, yeah most likely
 *
 * but everything else, like the bounds are decoupled, hopefully
 *
 * oh oops is the sidebar state one thing and not synced per tab :yikes i should mega fix dat
 *
 *
 * ug activity would be a really nice abstraction here ngl
 */
export const WebContentView = ({
  id,
  url,
  ref
}: {
  id: string
  url: string
  ref?: React.Ref<WebContentViewRef>
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  const isReady = true
  const isActive = useWebContentViewTabSwitching(id, url, isReady)
  useWebContentViewUrl(id, url, isReady)
  useWebContentViewPositioning(containerRef, isReady && isActive, id)
  useWebContentViewUnmount(id)

  useImperativeHandle(
    ref,
    () => ({
      reload: async () => {
        await client.reload()
      },
      forceReload: async () => {
        await client.forceReload()
      },
      navigate: async (newUrl: string) => {
        await client.navigate(newUrl)
      },
      toggleDevTools: async () => {
        return await client.toggleDevTools()
      },
      openDevToolsPanel: async (panel: string) => {
        return await client.openDevToolsPanel(panel)
      },
      takeScreenshot: async () => {
        return await client.takeScreenshot()
      },
      focus: async () => {
        return await client.focusActiveWebContent()
      }
    }),
    []
  )

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: 'transparent'
      }}
    >
      {!isReady && (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '14px'
          }}
        >
          Loading...
        </div>
      )}
    </div>
  )
}
