import { useEffect, useRef } from 'react'
import { t } from './i18n'
import { ACTIONS, type ActionId } from './keybindings'
import type { Settings } from './types'

// Touch gestures with more than one finger (a touch screen): taps with two or three fingers, and swipes with two.
// Each is bound to an action, in the viewer and in the lists apart (settings.gestures, "viewer.swipe2Up" -> action)

export type GestureId = 'swipe2Left' | 'swipe2Right' | 'swipe2Up' | 'swipe2Down' | 'tap2' | 'tap3'
export const GESTURES: GestureId[] = ['swipe2Left', 'swipe2Right', 'swipe2Up', 'swipe2Down', 'tap2', 'tap3']

/** Where a gesture is made: the viewer, or anywhere else (the lists) */
export type GestureContext = 'viewer' | 'list'

/** What a gesture can do: the viewer's key actions, closing or maximizing the viewer, or going back and forward */
export type GestureAction = ActionId | 'closeViewer' | 'maximize' | ''

export const DEFAULT_GESTURES: Record<string, GestureAction> = {
  'viewer.swipe2Right': 'nextBookmark',
  'viewer.swipe2Left': 'prevBookmark',
  'viewer.swipe2Up': 'maximize',
  'viewer.swipe2Down': 'closeViewer',
  'viewer.tap2': 'thumbs',
  'viewer.tap3': 'bookmark',
  'list.swipe2Right': 'back',
  'list.swipe2Left': 'forward'
}

/** The action a gesture is bound to ('' for none) */
export function gestureAction(settings: Settings | null, context: GestureContext, g: GestureId): GestureAction {
  const key = `${context}.${g}`
  const own = settings?.gestures?.[key]
  return (own ?? DEFAULT_GESTURES[key] ?? '') as GestureAction
}

/** The actions a gesture can be bound to where it is made, with their names */
export function gestureChoices(context: GestureContext): [GestureAction, string][] {
  const none: [GestureAction, string] = ['', t('gestures.none')]
  if (context === 'list') return [none, ['back', t('keys.actions.back')], ['forward', t('keys.actions.forward')]]
  return [
    none,
    ['closeViewer', t('gestures.closeViewer')],
    ['maximize', t('gestures.maximize')],
    ...ACTIONS.filter((a) => a.group !== 'global').map((a): [GestureAction, string] => [a.id, a.label])
  ]
}

// the viewer, while open, takes the gestures made in it (Viewer sets it)
let viewerHandler: ((action: GestureAction) => void) | null = null
export function setViewerGestures(fn: ((action: GestureAction) => void) | null): void {
  viewerHandler = fn
}
export const viewerOpen = (): boolean => viewerHandler !== null
export const runViewerGesture = (action: GestureAction): void => viewerHandler?.(action)

// how a gesture is told apart: a tap barely moves and is quick; a swipe moves the fingers together (a pinch changes
// the distance between them, and is left to the browser)
const TAP_MOVE = 20
const TAP_TIME = 350
const SWIPE_MOVE = 60
const SWIPE_TIME = 800

interface Touching {
  start: number
  most: number // the most fingers down at once
  points: Map<number, { x0: number; y0: number; x: number; y: number }>
}

/** Tells the gestures made anywhere on the screen to onGesture (while enabled) */
export function useTouchGestures(enabled: boolean, onGesture: (g: GestureId) => void): void {
  const latest = useRef(onGesture)
  latest.current = onGesture
  useEffect(() => {
    if (!enabled) return
    let touching: Touching | null = null
    const track = (e: TouchEvent) => {
      if (!touching) touching = { start: e.timeStamp, most: 0, points: new Map() }
      for (const p of Array.from(e.changedTouches)) {
        const at = touching.points.get(p.identifier)
        if (at) {
          at.x = p.clientX
          at.y = p.clientY
        } else touching.points.set(p.identifier, { x0: p.clientX, y0: p.clientY, x: p.clientX, y: p.clientY })
      }
      touching.most = Math.max(touching.most, e.touches.length)
    }
    const end = (e: TouchEvent) => {
      if (!touching) return
      track(e)
      if (e.touches.length > 0) return
      const g = classify(touching, e.timeStamp)
      touching = null
      if (g) latest.current(g)
    }
    const cancel = () => (touching = null)
    window.addEventListener('touchstart', track, { passive: true })
    window.addEventListener('touchmove', track, { passive: true })
    window.addEventListener('touchend', end, { passive: true })
    window.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      window.removeEventListener('touchstart', track)
      window.removeEventListener('touchmove', track)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', cancel)
    }
  }, [enabled])
}

function classify(touching: Touching, now: number): GestureId | null {
  const pts = [...touching.points.values()]
  const n = touching.most
  if (n < 2 || pts.length !== n) return null
  const time = now - touching.start
  const moved = Math.max(...pts.map((p) => Math.abs(p.x - p.x0) + Math.abs(p.y - p.y0)))
  if (moved < TAP_MOVE && time < TAP_TIME) return n === 2 ? 'tap2' : n === 3 ? 'tap3' : null
  if (n !== 2 || time > SWIPE_TIME) return null
  const [a, b] = pts
  const before = Math.hypot(a.x0 - b.x0, a.y0 - b.y0)
  const after = Math.hypot(a.x - b.x, a.y - b.y)
  if (Math.abs(after - before) > Math.max(40, before * 0.3)) return null // a pinch
  const dx = (a.x - a.x0 + b.x - b.x0) / 2
  const dy = (a.y - a.y0 + b.y - b.y0) / 2
  if (Math.hypot(dx, dy) < SWIPE_MOVE) return null
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'swipe2Right' : 'swipe2Left'
  return dy > 0 ? 'swipe2Down' : 'swipe2Up'
}
