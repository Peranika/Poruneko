// Key bindings (changeable in the settings)
import { t } from './i18n'

export type ActionId =
  | 'pageLeft'
  | 'pageRight'
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'modeSingle'
  | 'modeSpread'
  | 'modeScroll'
  | 'fullscreen'
  | 'thumbs'
  | 'shift'
  | 'bookmark'
  | 'nextBookmark'
  | 'prevBookmark'
  | 'slideshow'
  | 'slideSlower'
  | 'slideFaster'
  | 'back'
  | 'forward'

export type ActionGroup = 'page' | 'display' | 'bookmark' | 'slideshow' | 'global'

export interface ActionDef {
  id: ActionId
  label: string
  /** the heading it is listed under in the settings (page turning, display, bookmark, slideshow in the viewer; app-wide) */
  group: ActionGroup
  defaults: string[]
}

export const ACTIONS: ActionDef[] = [
  { id: 'pageLeft', label: t('keys.actions.pageLeft'), group: 'page', defaults: ['ArrowLeft'] },
  { id: 'pageRight', label: t('keys.actions.pageRight'), group: 'page', defaults: ['ArrowRight'] },
  { id: 'next', label: t('keys.actions.next'), group: 'page', defaults: ['Space', 'PageDown', 'ArrowDown'] },
  { id: 'prev', label: t('keys.actions.prev'), group: 'page', defaults: ['Shift+Space', 'PageUp', 'ArrowUp'] },
  { id: 'first', label: t('keys.actions.first'), group: 'page', defaults: ['Home'] },
  { id: 'last', label: t('keys.actions.last'), group: 'page', defaults: ['End'] },
  { id: 'nextBookmark', label: t('keys.actions.nextBookmark'), group: 'page', defaults: [']', 'Ctrl+PageDown'] },
  { id: 'prevBookmark', label: t('keys.actions.prevBookmark'), group: 'page', defaults: ['[', 'Ctrl+PageUp'] },
  { id: 'modeSingle', label: t('keys.actions.modeSingle'), group: 'display', defaults: ['1'] },
  { id: 'modeSpread', label: t('keys.actions.modeSpread'), group: 'display', defaults: ['2'] },
  { id: 'modeScroll', label: t('keys.actions.modeScroll'), group: 'display', defaults: ['3'] },
  { id: 'shift', label: t('keys.actions.shift'), group: 'display', defaults: ['S'] },
  { id: 'thumbs', label: t('keys.actions.thumbs'), group: 'display', defaults: ['T'] },
  { id: 'fullscreen', label: t('keys.actions.fullscreen'), group: 'display', defaults: ['F', 'F11'] },
  { id: 'bookmark', label: t('keys.actions.bookmark'), group: 'bookmark', defaults: ['B'] },
  { id: 'slideshow', label: t('keys.actions.slideshow'), group: 'slideshow', defaults: ['P'] },
  { id: 'slideSlower', label: t('keys.actions.slideSlower'), group: 'slideshow', defaults: ['.'] },
  { id: 'slideFaster', label: t('keys.actions.slideFaster'), group: 'slideshow', defaults: [','] },
  { id: 'back', label: t('keys.actions.back'), group: 'global', defaults: ['Alt+ArrowLeft', 'MouseBack'] },
  { id: 'forward', label: t('keys.actions.forward'), group: 'global', defaults: ['Alt+ArrowRight', 'MouseForward'] }
]

const MODIFIERS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock'])

/** Turn a key press into a string like "Ctrl+Shift+A" (null for modifier keys alone) */
export function comboFromKey(e: KeyboardEvent): string | null {
  if (MODIFIERS.has(e.key)) return null
  let key: string
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^(Digit|Numpad)\d$/.test(e.code)) key = e.code.slice(-1)
  else if (e.key === ' ') key = 'Space'
  else if (e.key.length === 1) key = e.key.toUpperCase()
  else key = e.key
  return withModifiers(key, e)
}

/**
 * Turn mouse buttons 3 to 5 (wheel click, back, forward) into a string.
 * Back/forward keep the names MouseBack / MouseForward to match previously saved values
 */
export function comboFromMouse(e: MouseEvent): string | null {
  if (e.button === 1) return withModifiers('MouseMiddle', e)
  if (e.button === 3) return withModifiers('MouseBack', e)
  if (e.button === 4) return withModifiers('MouseForward', e)
  return null
}

function withModifiers(key: string, e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }) {
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean)
  return [...mods, key].join('+')
}

const KEY_LABEL: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  MouseMiddle: t('keys.mouse.middle'),
  MouseBack: t('keys.mouse.back'),
  MouseForward: t('keys.mouse.forward'),
  PageDown: 'PageDown',
  PageUp: 'PageUp'
}

/** Display name (e.g. "Alt+ArrowLeft" -> "Alt + ←") */
export const comboLabel = (combo: string): string =>
  combo
    .split('+')
    .map((k) => KEY_LABEL[k] ?? k)
    .join(' + ')

/** The actual binding of each action (actions not in the settings use the defaults) */
export function effectiveBindings(saved: Record<string, string[]> | null | undefined): Record<ActionId, string[]> {
  const out = {} as Record<ActionId, string[]>
  for (const a of ACTIONS) out[a.id] = saved?.[a.id] ?? a.defaults
  return out
}

/** Key -> action map */
export function buildKeymap(saved: Record<string, string[]> | null | undefined): Map<string, ActionId> {
  const m = new Map<string, ActionId>()
  const eff = effectiveBindings(saved)
  for (const a of ACTIONS) for (const c of eff[a.id]) if (!m.has(c)) m.set(c, a.id)
  return m
}

/** Shortcuts are disabled while typing in an input (except with Ctrl / Alt) */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
  return typing && !e.ctrlKey && !e.altKey
}
