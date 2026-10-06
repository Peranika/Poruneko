// The Go backend: the Wails bindings on the desktop, HTTP (internal/webapi) on Android
import { EventsOn as wailsEventsOn } from '../wailsjs/runtime/runtime'

type Method = (...args: any[]) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** The Wails bindings of the App (undefined where the backend is served over HTTP) */
const wailsApp = (): Record<string, Method> | undefined =>
  (window as unknown as { go?: { main?: { App?: Record<string, Method> } } }).go?.main?.App

/** Whether the app runs in Wails (the desktop) */
export const isWails = (): boolean => wailsApp() !== undefined

async function httpCall(name: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(`/api/call/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  })
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
