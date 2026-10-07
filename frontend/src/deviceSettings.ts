// A browser of remote access keeps its own value of the settings that are about how the app looks and works on the
// device (the viewer, the text size, the keys...). The computer keeps them under the device's name (internal/remote:
// /remote/device), so the device finds them again from any of the computer's addresses. The other settings (where
// works are saved, the sites, downloads, file names) are the computer's and shared
import type { Settings } from './types'

/** The settings each device has its own value of */
export const DEVICE_KEYS = [
  'fontScale',
  'theme',
  'accent',
  'uiLanguage',
  'viewer',
  'keybindings',
  'mouseGestures',
  'infiniteScroll',
  'siteLoadMore',
  'siteScreens',
  'siteScreensOpen',
  'rememberScreen'
] as const satisfies readonly (keyof Settings)[]

type DeviceSettings = Partial<Pick<Settings, (typeof DEVICE_KEYS)[number]>>

let device: DeviceSettings | null = null

/** This device's own settings (loaded once) */
async function load(): Promise<DeviceSettings> {
  if (device) return device
  try {
    const res = await fetch('/remote/device', { cache: 'no-store' })
    device = res.ok ? (((await res.json()) as { settings: DeviceSettings }).settings ?? {}) : {}
  } catch {
    device = {}
  }
  return device
}

const pick = (s: Partial<Settings>): DeviceSettings =>
  Object.fromEntries(DEVICE_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])) as DeviceSettings

/** The computer's settings with this device's own on top */
export async function withDeviceSettings(server: Settings): Promise<Settings> {
  const own = await load()
  return { ...server, ...own, viewer: { ...server.viewer, ...own.viewer } }
}

/**
 * Keeps this device's own part of the settings the screen saves, and returns what the computer keeps: the rest, with
 * the computer's own values of this device's settings (so it does not change them for the computer and the others)
 */
export async function keepDeviceSettings(next: Settings, server: Settings): Promise<Settings> {
  const own = pick(next)
  if (JSON.stringify(own) !== JSON.stringify(device)) {
    device = own
    await fetch('/remote/device', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(own) })
  }
  return { ...next, ...pick(server) }
}
