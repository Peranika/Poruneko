// Saves UI state (view modes, the last selected group, etc.) to localStorage.
// Read and write failures are ignored and defaults used, so it works where storage is unavailable.

export function loadString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function saveString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* keep working even if it cannot be saved */
  }
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  saveString(key, JSON.stringify(value))
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** The page last shown for a work (0-based; reopening the work starts there) */
export const loadPagePos = (key: string): number => Number(loadString(`pos:${key}`, '0')) || 0
export const savePagePos = (key: string, page: number): void => saveString(`pos:${key}`, String(page))

/** The reading mode the user chose for a work (undefined if never changed in it) */
export function loadWorkMode(key: string): 'single' | 'spread' | 'scroll' | undefined {
  const m = loadString(`mode:${key}`, '')
  return m === 'single' || m === 'spread' || m === 'scroll' ? m : undefined
}
export const saveWorkMode = (key: string, mode: string): void => saveString(`mode:${key}`, mode)

/** The version the user chose to skip in the update notice */
export const loadSkippedVersion = (): string => loadString('update.skip', '')
export const saveSkippedVersion = (version: string): void => saveString('update.skip', version)
