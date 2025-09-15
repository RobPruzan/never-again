import { createClient, createEventHandlers } from '@egoist/tipc/renderer'
import { Router } from '../../../main/tipc'
import { RendererHandlers } from '../../../main/renderer-handlers'

export const client = createClient<Router>({
  // ipcRenderer is exposed by preload
  // @ts-ignore
  ipcInvoke: (...args: any[]) => window.ipcRenderer.invoke(...args)
})

export const handlers = createEventHandlers<RendererHandlers>({
  // when using electron's ipcRenderer directly
  on: (channel, callback) => {
    // @ts-ignore
    window.ipcRenderer.on(channel, callback)
    return () => {
      // @ts-ignore
      window.ipcRenderer.off(channel, callback)
    }
  },

  // otherwise if using @electron-toolkit/preload or electron-vite
  // which expose a custom `on` method that does the above for you
  // on: window.electron.ipcRenderer.on,

  // @ts-ignore
  send: window.ipcRenderer.send
})

/**
 * this is wrong i think i just wanted gpt5 to document its nonsense
 *
 * Terminal event subscriptions (renderer)
 *
 * Problem
 * - Per-component `handlers.*.listen` can stack multiple global listeners
 *   (especially in React Strict Mode or across remounts), causing duplicate
 *   callbacks and hard-to-reason teardown timing when late events arrive.
 *
 * Approach
 * - Install ONE renderer-wide listener per channel, then fan-out by `payload.id`
 *   to per-session subscriber sets. Unsubscribing only removes the session-level
 *   callback, and late/global events are safely ignored when a session set is empty.
 *
 * Notes
 * - This is a userland demux pattern built on top of TIPC’s listen API.
 * - TIPC’s unsubscribe works; this pattern avoids global listener churn.
 * - Authored by GPT-5 to stabilize multi-instance terminal streams.
 */
// Scoped subscription helpers to avoid duplicate global listeners
type TerminalDataPayload = { id: string; data: string }
type TerminalExitPayload = { id: string; exitCode: number; signal: number }
type TerminalTitlePayload = { id: string; title: string }

type Unsubscribe = () => void

const dataSubscribers = new Map<string, Set<(p: TerminalDataPayload) => void>>()
const exitSubscribers = new Map<string, Set<(p: TerminalExitPayload) => void>>()
const titleSubscribers = new Map<string, Set<(p: TerminalTitlePayload) => void>>()

let baseDataUnlisten: Unsubscribe | null = null
let baseExitUnlisten: Unsubscribe | null = null
let baseTitleUnlisten: Unsubscribe | null = null

function ensureBaseListeners() {
  if (!baseDataUnlisten) {
    baseDataUnlisten = handlers.terminalData.listen((eventOrPayload: any, maybePayload?: any) => {
      const p = (maybePayload !== undefined ? maybePayload : eventOrPayload) as TerminalDataPayload
      const subs = dataSubscribers.get(p.id)
      if (subs) subs.forEach((cb) => cb(p))
    })
  }
  if (!baseExitUnlisten) {
    baseExitUnlisten = handlers.terminalExit.listen((eventOrPayload: any, maybePayload?: any) => {
      const p = (maybePayload !== undefined ? maybePayload : eventOrPayload) as TerminalExitPayload
      const subs = exitSubscribers.get(p.id)
      if (subs) subs.forEach((cb) => cb(p))
    })
  }
  if (!baseTitleUnlisten) {
    baseTitleUnlisten = handlers.terminalTitleChanged.listen(
      (eventOrPayload: any, maybePayload?: any) => {
        const p = (
          maybePayload !== undefined ? maybePayload : eventOrPayload
        ) as TerminalTitlePayload
        const subs = titleSubscribers.get(p.id)
        if (subs) subs.forEach((cb) => cb(p))
      }
    )
  }
}

export function subscribeTerminalData(
  id: string,
  cb: (p: TerminalDataPayload) => void
): Unsubscribe {
  ensureBaseListeners()
  let set = dataSubscribers.get(id)
  if (!set) {
    set = new Set()
    dataSubscribers.set(id, set)
  }
  set.add(cb)
  return () => {
    const current = dataSubscribers.get(id)
    if (!current) return
    current.delete(cb)
    if (current.size === 0) dataSubscribers.delete(id)
  }
}

export function subscribeTerminalExit(
  id: string,
  cb: (p: TerminalExitPayload) => void
): Unsubscribe {
  ensureBaseListeners()
  let set = exitSubscribers.get(id)
  if (!set) {
    set = new Set()
    exitSubscribers.set(id, set)
  }
  set.add(cb)
  return () => {
    const current = exitSubscribers.get(id)
    if (!current) return
    current.delete(cb)
    if (current.size === 0) exitSubscribers.delete(id)
  }
}

export function subscribeTerminalTitle(
  id: string,
  cb: (p: TerminalTitlePayload) => void
): Unsubscribe {
  ensureBaseListeners()
  let set = titleSubscribers.get(id)
  if (!set) {
    set = new Set()
    titleSubscribers.set(id, set)
  }
  set.add(cb)
  return () => {
    const current = titleSubscribers.get(id)
    if (!current) return
    current.delete(cb)
    if (current.size === 0) titleSubscribers.delete(id)
  }
}

// Augment client type with the new procedure using declaration merging on the client instance type
type TerminalSetSnapshot = (input: { id: string; snapshot: string }) => Promise<{ ok: boolean }>
export const extendedClient = client as typeof client & {
  terminalSetSnapshot: TerminalSetSnapshot
}

// V2 API extensions
type V2Reconnect = (input: string) => Promise<
  | {
      success: true
      id: string
      cols: number
      rows: number
      title: string
      snapshot: string
      seq: number
    }
  | { success: false }
>
export const v2Client = client as typeof client & {
  terminalV2Create: (input?: { cwd?: string; shell?: string }) => Promise<{
    id: string
    title: string
    cwd: string
    projectName: string
  }>
  terminalV2Write: (input: { id: string; data: string }) => Promise<{ ok: boolean }>
  terminalV2Resize: (input: { id: string; cols: number; rows: number }) => Promise<{ ok: boolean }>
  terminalV2Destroy: (input: string) => Promise<boolean>
  terminalV2List: () => Promise<
    Array<{ id: string; title: string; cwd: string; projectName: string }>
  >
  terminalV2Reconnect: V2Reconnect
  terminalV2GetSnapshot: (input: string) => Promise<{ ok: boolean; snapshot?: string }>
  terminalV2GetSince: (input: { id: string; since: number }) => Promise<{
    ok: boolean
    chunks: Array<{ seq: number; data: string }>
  }>
}

// Scoped subscriptions for V2
type TerminalV2DataPayload = { id: string; data: string; seq: number }
type TerminalV2ExitPayload = { id: string; exitCode: number; signal: number }
type TerminalV2TitlePayload = { id: string; title: string }

const v2DataSubs = new Map<string, Set<(p: TerminalV2DataPayload) => void>>()
const v2ExitSubs = new Map<string, Set<(p: TerminalV2ExitPayload) => void>>()
const v2TitleSubs = new Map<string, Set<(p: TerminalV2TitlePayload) => void>>()

let v2BaseDataUnlisten: Unsubscribe | null = null
let v2BaseExitUnlisten: Unsubscribe | null = null
let v2BaseTitleUnlisten: Unsubscribe | null = null

function ensureV2Base() {
  if (!v2BaseDataUnlisten) {
    v2BaseDataUnlisten = handlers.terminalV2Data.listen((evtOrPayload: any, maybe?: any) => {
      const p = (maybe !== undefined ? maybe : evtOrPayload) as TerminalV2DataPayload
      const subs = v2DataSubs.get(p.id)
      if (subs) subs.forEach((cb) => cb(p))
    })
  }
  if (!v2BaseExitUnlisten) {
    v2BaseExitUnlisten = handlers.terminalV2Exit.listen((evtOrPayload: any, maybe?: any) => {
      const p = (maybe !== undefined ? maybe : evtOrPayload) as TerminalV2ExitPayload
      const subs = v2ExitSubs.get(p.id)
      if (subs) subs.forEach((cb) => cb(p))
    })
  }
  if (!v2BaseTitleUnlisten) {
    v2BaseTitleUnlisten = handlers.terminalV2TitleChanged.listen(
      (evtOrPayload: any, maybe?: any) => {
        const p = (maybe !== undefined ? maybe : evtOrPayload) as TerminalV2TitlePayload
        const subs = v2TitleSubs.get(p.id)
        if (subs) subs.forEach((cb) => cb(p))
      }
    )
  }
}

export function subscribeTerminalV2Data(id: string, cb: (p: TerminalV2DataPayload) => void) {
  ensureV2Base()
  let set = v2DataSubs.get(id)
  if (!set) {
    set = new Set()
    v2DataSubs.set(id, set)
  }
  set.add(cb)
  return () => {
    const current = v2DataSubs.get(id)
    if (!current) return
    current.delete(cb)
    if (current.size === 0) v2DataSubs.delete(id)
  }
}

export function subscribeTerminalV2Exit(id: string, cb: (p: TerminalV2ExitPayload) => void) {
  ensureV2Base()
  let set = v2ExitSubs.get(id)
  if (!set) {
    set = new Set()
    v2ExitSubs.set(id, set)
  }
  set.add(cb)
  return () => {
    const current = v2ExitSubs.get(id)
    if (!current) return
    current.delete(cb)
    if (current.size === 0) v2ExitSubs.delete(id)
  }
}

export function subscribeTerminalV2Title(id: string, cb: (p: TerminalV2TitlePayload) => void) {
  ensureV2Base()
  let set = v2TitleSubs.get(id)
  if (!set) {
    set = new Set()
    v2TitleSubs.set(id, set)
  }
  set.add(cb)
  return () => {
    const current = v2TitleSubs.get(id)
    if (!current) return
    current.delete(cb)
    if (current.size === 0) v2TitleSubs.delete(id)
  }
}
