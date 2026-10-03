// UI text. Looked up by key in the string tables (ja.ts / en.ts), with values inserted as {name}.
//
// The language is decided once at startup (main.tsx). Some modules keep text as constants,
// so the UI is reloaded when the language changes.
import { createElement, Fragment, type ReactNode } from 'react'
import { en } from './en'
import { ja, type Dict } from './ja'

export type Lang = 'ja' | 'en'

const dicts: Record<Lang, Dict> = { ja, en }

let current: Lang = 'ja'

/** Decide the language from the setting ("" follows the OS) */
export function resolveLanguage(setting: string | undefined): Lang {
  if (setting === 'ja' || setting === 'en') return setting
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

export function setLanguage(lang: Lang): void {
  current = lang
  document.documentElement.lang = lang
}

export const language = (): Lang => current

/** String table keys (joined with . like "bookmarks.title") */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]
export type Key = Leaves<Dict>

export type Params = Record<string, string | number | undefined>

function lookup(dict: Dict, key: string): string | undefined {
  let v: unknown = dict
  for (const k of key.split('.')) {
    if (typeof v !== 'object' || v === null) return undefined
    v = (v as Record<string, unknown>)[k]
  }
  return typeof v === 'string' ? v : undefined
}

const fill = (s: string, params?: Params) =>
  params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] === undefined ? m : String(params[k]))) : s

/** Look up text (falls back to Japanese, then to the key itself) */
export function t(key: Key, params?: Params): string {
  return fill(lookup(dicts[current], key) ?? lookup(ja, key) ?? key, params)
}

/** Insert UI elements (icons etc.) into {name} in the text */
export function tx(key: Key, nodes: Record<string, ReactNode>): ReactNode {
  const parts = t(key).split(/(\{\w+\})/)
  return createElement(
    Fragment,
    null,
    ...parts.map((p, i) => {
      const m = /^\{(\w+)\}$/.exec(p)
      return createElement(Fragment, { key: i }, m && m[1] in nodes ? nodes[m[1]] : p)
    })
  )
}

/** Look up text with a key built at run time (undefined if missing) */
export function tryT(key: string, params?: Params): string | undefined {
  const s = lookup(dicts[current], key) ?? lookup(ja, key)
  return s === undefined ? undefined : fill(s, params)
}

/** Shape of an error returned from Go (apperr.Payload) */
interface ErrorPayload {
  code?: string
  params?: Params
  message?: string
}

/** Turn an error into UI text (Go errors look up the string table by code, else use the English text) */
export function errorText(e: unknown): string {
  // also read it when it arrives as a JSON string
  if (typeof e === 'string' && e.startsWith('{')) {
    try {
      e = JSON.parse(e)
    } catch {
      /* treat it as a plain string */
    }
  }
  if (typeof e === 'object' && e !== null && ('code' in e || 'message' in e)) {
    const p = e as ErrorPayload
    return (p.code && tryT(`errors.${p.code}`, p.params)) || p.message || String(e)
  }
  return String(e)
}

/** The reason a download failed (from the string table if there is a code, else the recorded text) */
export function downloadErrorText(d: { error?: string; errorCode?: string; errorParams?: Params }): string {
  return (d.errorCode && tryT(`errors.${d.errorCode}`, d.errorParams)) || d.error || ''
}
