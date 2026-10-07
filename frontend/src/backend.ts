// The Go backend: the Wails bindings on the desktop, HTTP (internal/webapi) in a browser of remote access
import { EventsOn as wailsEventsOn } from '../wailsjs/runtime/runtime'

type Method = (...args: any[]) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** The Wails bindings of the App (undefined where the backend is served over HTTP) */
const wailsApp = (): Record<string, Method> | undefined =>
  (window as unknown as { go?: { main?: { App?: Record<string, Method> } } }).go?.main?.App

/** Whether the app runs in Wails (the desktop) */
export const isWails = (): boolean => wailsApp() !== undefined

/** What the Android app (a client of the computer's remote access) lets the page do directly
 * (MainActivity.AndroidPage), when the page is in it */
export interface AndroidPage {
  /** The computer's address the app opens */
  serverUrl(): string
  /** Opens the app's screen to change the computer's address */
  changeServer(): void
  setFullscreen(on: boolean): void
  clipboardText(): string
}

export const androidPage = (): AndroidPage | undefined => (window as unknown as { PorunekoAndroid?: AndroidPage }).PorunekoAndroid

/** Whether this is a browser of remote access: the screen of the desktop app on another device (main.tsx marks it
 * on <html data-remote>). It opens links and goes full screen itself */
export const isRemote = (): boolean => document.documentElement.dataset.remote !== undefined

async function httpCall(name: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(`/api/call/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  })
  // a browser of remote access signed out (a new password): the page shows the sign-in again
  if (res.status === 401 && isRemote()) location.reload()
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`)
  const body = await res.json()
  // an error is formatted the way Wails' ErrorFormatter gives it ({code, params, message})
  if ('error' in body) throw body.error
  return body.result
}

/** The App's methods by name: go.List(q) */
export const go: Record<string, Method> = new Proxy({} as Record<string, Method>, {
  get: (_, name) => {
    const method = String(name)
    return (...args: unknown[]) => {
      const w = wailsApp()
      return w ? w[method](...args) : httpCall(method, args)
    }
  }
})

// the events over HTTP come in one stream, shared by every listener
const listeners = new Map<string, Set<(data: unknown) => void>>()
let events: EventSource | undefined

function httpEventsOn(name: string, cb: (data: unknown) => void): () => void {
  if (!events) {
    events = new EventSource('/api/events')
    events.onmessage = (e) => {
      const { name, data } = JSON.parse(e.data) as { name: string; data: unknown }
      listeners.get(name)?.forEach((f) => f(data))
    }
  }
  let set = listeners.get(name)
  if (!set) listeners.set(name, (set = new Set()))
  set.add(cb)
  return () => {
    set.delete(cb)
  }
}

/** Listen to an event of the backend; returns the function that stops listening */
export function EventsOn<T>(name: string, cb: (data: T) => void): () => void {
  return isWails() ? wailsEventsOn(name, cb) : httpEventsOn(name, cb as (data: unknown) => void)
}
