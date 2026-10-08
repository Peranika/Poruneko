// Display settings for the whole UI

/** Base text size (same as :root in style.css). Other text sizes are given in rem relative to it */
const BASE_FONT_PX = 14

/** Apply the text size (%; 100 is normal) to the UI */
export function applyFontScale(percent: number | undefined): void {
  const p = percent && percent > 0 ? percent : 100
  document.documentElement.style.fontSize = `${(BASE_FONT_PX * p) / 100}px`
}

/** Text sizes selectable in the settings (%) */
export const FONT_SCALES = [80, 90, 100, 110, 120, 135, 150]

/** The default accent color (pink) */
export const DEFAULT_ACCENT = '#ff6b8b'

/** Accent colors offered in the settings (any other color can be picked too) */
export const ACCENT_PRESETS = [DEFAULT_ACCENT, '#f0524f', '#f5873a', '#e0b13a', '#3fbf74', '#26b3a6', '#4a90f0', '#7b74f0', '#b46cf0']

const darkScheme = window.matchMedia('(prefers-color-scheme: dark)')
let current: { theme: string; accent: string } = { theme: '', accent: '' }
// with "follow the OS", switch when the OS setting changes
darkScheme.addEventListener('change', () => current.theme === 'system' && applyTheme(current.theme, current.accent))

/** Apply the color theme ("" dark / light / system) and the accent color (#rrggbb, "" for the default) to the UI */
export function applyTheme(theme: string | undefined, accent: string | undefined): void {
  current = { theme: theme ?? '', accent: accent ?? '' }
  const light = theme === 'light' || (theme === 'system' && !darkScheme.matches)
  const root = document.documentElement
  root.dataset.theme = light ? 'light' : 'dark'

  const hex = /^#[0-9a-fA-F]{6}$/.test(accent ?? '') ? accent! : DEFAULT_ACCENT
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const rgba = (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`
  // hover color: a little lighter on the dark theme, a little darker on the light one
  const mix = (to: number, k: number) => [r, g, b].map((c) => Math.round(c + (to - c) * k))
  const [r2, g2, b2] = light ? mix(0, 0.15) : mix(255, 0.25)
  // text on the accent color: white unless the accent is bright (yellow and the like)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const vars: Record<string, string> = {
    '--accent': hex,
    '--accent-2': `rgb(${r2}, ${g2}, ${b2})`,
    '--accent-bg': rgba(light ? 0.12 : 0.14),
    '--accent-soft': rgba(0.18),
    '--accent-line': rgba(0.4),
    '--on-accent': luminance > 0.72 ? '#1d2129' : '#fff'
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
}
