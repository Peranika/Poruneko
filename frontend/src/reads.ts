import { useSyncExternalStore } from 'react'
import { api } from './api'
import type { ReadState } from './types'

// How far works were read, kept by the backend: loaded once and followed through "read:changed". Apart from the app
// state, as the page being read changes it on every turn: a card follows only its own work's state

let states = new Map<string, ReadState>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((f) => f())

let started = false
/** Loads the states and follows their changes (once, at startup) */
export async function startReads(): Promise<void> {
  if (started) return
  started = true
  api.onReadChanged((r) => {
    states = new Map(states).set(r.key, r)
    notify()
  })
  const all = await api.readStates().catch(() => ({}))
  // changes that came while loading are newer than what was loaded
  states = new Map([...Object.entries(all ?? {}), ...states])
  notify()
}

/**
 * The page to open a work at: where it was left (one read to its end, left at its end, starts over), else where this
 * device kept it (fallback)
 */
export function resumePage(key: string, fallback: () => number): number {
  const r = states.get(key)
  if (!r) return fallback()
  return r.read && r.page >= r.pages - 2 ? 0 : r.page
}

/** Marks works read or unread */
export const setRead = (keys: string[], read: boolean): Promise<void> => api.setRead(keys, read)

const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}

/** How far a work was read now (undefined: never opened, or not loaded yet) */
export const readState = (key: string): ReadState | undefined => states.get(key)

/** How far a work was read, following its changes */
export const useReadState = (key: string): ReadState | undefined => useSyncExternalStore(subscribe, () => states.get(key))

/** Every work's state, following the changes (for lists that leave read works out) */
export const useReadStates = (): Map<string, ReadState> => useSyncExternalStore(subscribe, () => states)

/** Whether a work was read to its end (or marked read) */
export const isRead = (states: Map<string, ReadState>, key: string): boolean => !!states.get(key)?.read
