// Thin wrapper around the Go backend (Wails bindings on the desktop, HTTP on Android: see backend.ts)
import { EventsOn, go, isRemote } from './backend'
import { keepDeviceSettings, withDeviceSettings } from './deviceSettings'

// the computer's own settings, as a browser of remote access last read them (its own are put on top)
let serverSettings: Settings | null = null

// in a browser of remote access, links open and full screen happens in the browser itself (not on the computer)
function openInBrowser(url: string): Promise<void> {
  window.open(url, '_blank', 'noopener')
  return Promise.resolve()
}
function browserFullscreen(on: boolean): Promise<void> {
  const d = document as Document & { webkitExitFullscreen?(): void; webkitFullscreenElement?: Element }
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?(): void }
  try {
    if (on && !(d.fullscreenElement ?? d.webkitFullscreenElement)) void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())
    if (!on && (d.fullscreenElement ?? d.webkitFullscreenElement)) void (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.())
  } catch {
    // not available (an iPhone): the app's own full screen still hides its bars
  }
  return Promise.resolve()
}
import type {
  Bookmark,
  IconFile,
  CreatorCandidate,
  DownloadProgress,
  FavoriteName,
  FavoritesQuery,
  FavoritesResult,
  GalleryDetail,
  GallerySummary,
  HistoryEntry,
  ListQuery,
  ListResult,
  RangeRequest,
  Series,
  Settings,
  Suggestion,
  ThumbSpec,
  UpdateRelease, PluginInfo, RemoteStatus, SiteInfo, StatusLine, SyncFound, SyncPairing, SyncStatus, Text, ViewHeader } from './types'

export const api = {
  /** The sites from site plugins (the browse screens appear only when there is one) */
  sites: (): Promise<SiteInfo[]> => go.Sites(),
  /** The plugins loaded at startup */
  plugins: (): Promise<PluginInfo[]> => go.Plugins(),
  /** Choose a plugin file and copy it into the plugins folder, loaded at the next start (null if cancelled) */
  addPlugin: (title: string): Promise<PluginInfo | null> => go.AddPlugin(title),
  /** Start the app again (to load the plugins added) */
  restartApp: (): Promise<void> => go.RestartApp(),
  /** Register the archives in the local folders that are not works yet (returns how many were added) */
  scanLibrary: (): Promise<number> => go.ScanLibrary(),
  /** Let the archives removed from the library come back, and scan */
  restoreIgnoredArchives: (): Promise<number> => go.RestoreIgnoredArchives(),
  /** The web page of a work on its site ("" if none) */
  webURL: (key: string): Promise<string> => go.WebURL(key),
  /** Open an attachment of a work (a file that is not a page) in the browser */
  openAttachment: (key: string, index: number): Promise<void> => {
    if (!isRemote()) return go.OpenAttachment(key, index)
    // the window opens at once, while the click still allows it, and goes to the file once its URL is known
    const w = window.open('', '_blank')
    return go.AttachmentURL(key, index).then((u: string) => {
      if (w) w.location.href = u
    })
  },
  /** A site's state as its plugin tells it (such as the API calls left) */
  siteStatus: (site: string): Promise<StatusLine[]> => go.SiteStatus(site),
  /** The header of a plugin's own screen for what was entered (null when it shows none) */
  viewHeader: (site: string, view: string, query: string): Promise<ViewHeader | null> => go.ViewHeader(site, view, query),
  /** The values of a site's filters kept for one owner of its works (a user), overriding the common ones */
  ownerSettings: (site: string, owner: string): Promise<Record<string, string>> => go.OwnerSettings(site, owner),
  /** Keep a filter's value for one owner of a site's works ('' goes back to the common value) */
  setOwnerSetting: (site: string, owner: string, filterId: string, value: string): Promise<Record<string, string>> =>
    go.SetOwnerSetting(site, owner, filterId, value),
  /** Do a button of a plugin's own screen (such as following a user); returns the message to show */
  viewAction: (site: string, view: string, query: string, action: string): Promise<Text | null> => go.ViewAction(site, view, query, action),
  /** Opens the site's login window; the plugin's login settings (null when the window was closed first) */
  siteLogin: (site: string, title: string, fresh: boolean): Promise<Record<string, string> | null> => go.SiteLogin(site, title, fresh),
  list: (q: ListQuery): Promise<ListResult> => go.List(q),
  gallery: (key: string): Promise<GalleryDetail> => go.Gallery(key),
  suggest: (site: string, term: string): Promise<Suggestion[]> => go.Suggest(site, term),
  /** Works by bookmarked artists (Favorites) */
  favorites: (q: FavoritesQuery): Promise<FavoritesResult> => go.Favorites(q),
  /** Only the artists and groups Favorites searches for (no site search, so it returns at once) */
  favoriteNames: (q: FavoritesQuery): Promise<FavoriteName[]> => go.FavoriteNames(q),

  bookmarks: (): Promise<Bookmark[]> => go.Bookmarks(),
  addBookmark: (s: GallerySummary): Promise<Bookmark> => go.AddBookmark(s),
  /** Bookmark the work at a URL on one of the sites (an error if no site knows it) */
  addBookmarkFromUrl: (url: string): Promise<Bookmark> => go.AddBookmarkFromURL(url),
  removeBookmark: (key: string): Promise<void> => go.RemoveBookmark(key),
  /** Take a work in a local folder out of the app (the file stays; it does not come back when rescanning) */
  removeFromLibrary: (key: string): Promise<void> => go.RemoveFromLibrary(key),
  /** Bookmark only the given page range (req.download chooses whether to make a cbz) */
  bookmarkRange: (req: RangeRequest): Promise<Bookmark> => go.BookmarkRange(req),
  /** Set the artists and groups of a page range bookmark as written on the source site */
  setRangeTags: (key: string, artists: string[], groups: string[]): Promise<Bookmark> => go.SetRangeTags(key, artists, groups),
  /** Add the add tags to and remove the remove tags from several bookmarks (e.g. tagging a whole series) */
  updateTags: (keys: string[], add: string[], remove: string[]): Promise<void> => go.UpdateTags(keys, add, remove),
  /** Set the thumbnail to an image of the chosen page and area (imageBase64 is the cropped WebP) */
  setCustomThumb: (key: string, spec: ThumbSpec, imageBase64: string): Promise<Bookmark> => go.SetCustomThumb(key, spec, imageBase64),
  /** Reset the thumbnail to the work's cover */
  clearCustomThumb: (key: string): Promise<Bookmark> => go.ClearCustomThumb(key),
  /** Rename a tag (on every bookmark that has it; returns how many changed) */
  renameTag: (from: string, to: string): Promise<number> => go.RenameTag(from, to),
  /** Works opened in the viewer, newest first */
  history: (): Promise<HistoryEntry[]> => go.History(),
  /** Record that a work was opened (origin '' keeps the one recorded before) */
  addHistory: (s: GallerySummary, origin: string): Promise<void> => go.AddHistory(s as any, origin), // eslint-disable-line @typescript-eslint/no-explicit-any
  removeHistory: (key: string): Promise<void> => go.RemoveHistory(key),
  clearHistory: (): Promise<void> => go.ClearHistory(),
  /** Give a bookmark the user's own title ('' goes back to the work's title) */
  setBookmarkTitle: (key: string, title: string): Promise<Bookmark> => go.SetBookmarkTitle(key, title),
  /** Set the user's tags on a bookmark (replacing them with tags) */
  setBookmarkTags: (key: string, tags: string[]): Promise<Bookmark> => go.SetBookmarkTags(key, tags),
  resolveCreator: (key: string): Promise<Bookmark> => go.ResolveCreator(key),
  searchCreatorCandidates: (term: string): Promise<CreatorCandidate[]> => go.SearchCreatorCandidates(term),
  /** Read creator info from a DLsite / FANZA Doujin product page the user found */
  candidateFromUrl: (url: string): Promise<CreatorCandidate> => go.CandidateFromURL(url),
  /** Remove the link to the product page creator info came from (the names stay) */
  unlinkCreatorSource: (key: string): Promise<Bookmark> => go.UnlinkCreatorSource(key),
  setCreator: (key: string, circle: string, artists: string[], candidate: CreatorCandidate | null): Promise<Bookmark> =>
    go.SetCreator(key, circle, artists, candidate),

  seriesList: (): Promise<Series[]> => go.SeriesList(),
  /** Create a series with the works in keys (works in other series leave them) */
  createSeries: (name: string, keys: string[]): Promise<Series> => go.CreateSeries(name, keys),
  renameSeries: (id: string, name: string): Promise<Series> => go.RenameSeries(id, name),
  deleteSeries: (id: string): Promise<void> => go.DeleteSeries(id),
  /** Append to the end of a series */
  addToSeries: (id: string, keys: string[]): Promise<Series> => go.AddToSeries(id, keys),
  removeFromSeries: (key: string): Promise<void> => go.RemoveFromSeries(key),
  /** Order a series by keys */
  reorderSeries: (id: string, keys: string[]): Promise<Series> => go.ReorderSeries(id, keys),

  startDownload: (key: string): Promise<void> => go.StartDownload(key),
  pauseDownload: (key: string): Promise<void> => go.PauseDownload(key),
  deleteDownload: (key: string): Promise<void> => go.DeleteDownload(key),
  openFolder: (key: string): Promise<void> => go.OpenFolder(key),
  /** Check that downloaded cbz files were not deleted outside the app (deleted ones go back to unsaved) */
  verifyDownloads: (): Promise<void> => go.VerifyDownloads(),
  /** Drop the remaining loads (prefetches) of a gallery when its page closes */
  cancelViewerLoads: (key: string): Promise<void> => go.CancelViewerLoads(key),

  /** The settings (in a browser of remote access, with the device's own on top: deviceSettings.ts) */
  getSettings: async (): Promise<Settings> => {
    if (!isRemote()) return go.GetSettings()
    serverSettings = await go.GetSettings()
    return withDeviceSettings(serverSettings!)
  },
  setSettings: async (s: Settings): Promise<Settings> => {
    if (!isRemote()) return go.SetSettings(s)
    serverSettings = await go.SetSettings(await keepDeviceSettings(s, serverSettings ?? (await go.GetSettings())))
    return withDeviceSettings(serverSettings!)
  },
  /** Dialog to choose the save location (title is the dialog title) */
  /** Choose where a site's works are saved ("" if cancelled) */
  chooseSiteDir: (site: string, title: string): Promise<string> => go.ChooseSiteDir(site, title),
  /** Choose a folder to add as a tab ("" if cancelled) */
  addLocalDir: (title: string): Promise<string> => go.AddLocalDir(title),
  removeLocalDir: (id: number): Promise<void> => go.RemoveLocalDir(id),
  setLocalDir: (id: number, name: string, icon: string): Promise<void> => go.SetLocalDir(id, name, icon),
  /** Move a local folder's tab up (-1) or down (1) */
  moveLocalDir: (id: number, dir: number): Promise<void> => go.MoveLocalDir(id, dir),
  /** The images in the icons folder, for the tab icons */
  localIcons: (): Promise<IconFile[]> => go.LocalIcons(),
  openIconsFolder: (): Promise<void> => go.OpenIconsFolder(),
  /** Placeholders of the file name format (descriptions are in fileName.placeholders) */
  fileNamePlaceholders: (): Promise<string[]> => go.FileNamePlaceholders(),
  /** Example of the format (sampleSeries is the series name for the example when no work is in a series) */
  previewFileName: (site: string, format: string, sampleSeries: string): Promise<string> => go.PreviewFileName(site, format, sampleSeries),
  applyFileNameFormat: (): Promise<number> => go.ApplyFileNameFormat(),

  appVersion: (): Promise<string> => go.AppVersion(),
  /** Check for a newer version (null if none) */
  checkUpdate: (): Promise<UpdateRelease | null> => go.CheckUpdate(),
  /** Install the newer version found and restart */
  installUpdate: (): Promise<void> => go.InstallUpdate(),
  onUpdateProgress: (cb: (p: { done: number; total: number }) => void): (() => void) => EventsOn('update:progress', cb),

  openExternal: (url: string): Promise<void> => (isRemote() ? openInBrowser(url) : go.OpenExternal(url)),
  clipboardText: (): Promise<string> =>
    isRemote() ? (navigator.clipboard?.readText?.() ?? Promise.resolve('')).catch(() => '') : go.ClipboardText(),
  /** The OS the app runs on ("windows", "android"...) */
  platform: (): Promise<string> => go.Platform(),
  setFullscreen: (on: boolean): Promise<void> => (isRemote() ? browserFullscreen(on) : go.SetFullscreen(on)),
  minimise: (): Promise<void> => go.WindowMinimise(),
  toggleMaximise: (): Promise<void> => go.WindowToggleMaximise(),
  close: (): Promise<void> => go.WindowClose(),

  /** Remote access from browsers on other devices */
  remoteStatus: (): Promise<RemoteStatus> => go.RemoteStatus(),
  setRemotePassword: (password: string): Promise<void> => go.SetRemotePassword(password),
  setRemoteEnabled: (on: boolean): Promise<void> => go.SetRemoteEnabled(on),
  remoteSignOutAll: (): Promise<void> => go.RemoteSignOutAll(),
  /** Syncing with the user's other devices on the same network */
  syncStatus: (): Promise<SyncStatus> => go.SyncStatus(),
  setSyncDeviceName: (name: string): Promise<void> => go.SetSyncDeviceName(name),
  /** Show a code for another device to pair with this one */
  startSyncPairing: (): Promise<SyncPairing> => go.StartSyncPairing(),
  stopSyncPairing: (): Promise<void> => go.StopSyncPairing(),
  /** The devices on the network showing a code */
  findSyncDevices: (): Promise<SyncFound[]> => go.FindSyncDevices(),
  pairSyncDevice: (addr: string, code: string): Promise<void> => go.PairSyncDevice(addr, code),
  removeSyncDevice: (id: string): Promise<void> => go.RemoveSyncDevice(id),
  /** Sync now; returns the devices that could not be synced with */
  syncNow: (): Promise<{ id: string; name: string; error?: string }[]> => go.SyncNow(),
  onSyncChanged: (cb: () => void): (() => void) => EventsOn('sync:changed', cb),

  onDownloadProgress: (cb: (p: DownloadProgress) => void): (() => void) => EventsOn('download:progress', cb),
  onBookmarksChanged: (cb: () => void): (() => void) => EventsOn('bookmarks:changed', cb),
  onSeriesChanged: (cb: () => void): (() => void) => EventsOn('series:changed', cb)
}

const parseKey = (key: string): [string, string] => {
  const i = key.indexOf(':')
  return [key.slice(0, i), key.slice(i + 1)]
}

/** Whether the key is of a work made from a page range (a local work) */
export const isLocalKey = (key: string): boolean => key.startsWith('local:')
/** Whether the key is of an archive of the user's own in a local folder (the app never changes the file) */
export const isFileKey = (key: string): boolean => key.startsWith('file:')
/** The site a bookmark belongs to: its key's site, or for a page range work its source's site */
export function siteOfBookmark(b: Bookmark): string {
  const key = b.key.startsWith('local:') && b.summary.origin?.key ? b.summary.origin.key : b.key
  return key.slice(0, key.indexOf(':'))
}

/** The local folder a work of the user's own is in ("file:@<id>/..."; undefined for other works) */
export const localDirOfKey = (key: string): number | undefined => {
  const m = /^file:@(\d+)\//.exec(key)
  return m ? Number(m[1]) : undefined
}
/** Whether a work's record is a bookmark (works in the local folders have records but are never bookmarks) */
export const isBookmarked = (b: Bookmark | undefined): b is Bookmark => !!b && !isFileKey(b.key)

/** Page image URL (served by imgserver on the Go side; from local files if downloaded) */
export const imageUrl = (key: string, index: number): string => {
  const [site, id] = parseKey(key)
  return `/poru/img/${site}/${encodeURIComponent(id)}/${index}`
}

// the thumbnail of page range bookmarks depends on a setting, so include it in the URL to refetch when it changes
let rangeThumb = ''
export const setRangeThumbSetting = (v: string): void => {
  rangeThumb = v
}

// a chosen thumbnail changes behind the same URL, so include the save time in the URL to refetch it
let thumbVersions = new Map<string, number>()
export const setThumbVersions = (m: Map<string, number>): void => {
  thumbVersions = m
}

export const thumbUrl = (key: string, index = 0, big = true): string => {
  const [site, id] = parseKey(key)
  const custom = index === 0 && big ? thumbVersions.get(key) : undefined
  const q = [big ? '' : 'small=1', isLocalKey(key) && rangeThumb ? `rt=${rangeThumb}` : '', custom ? `tv=${custom}` : '']
    .filter(Boolean)
    .join('&')
  return `/poru/thumb/${site}/${encodeURIComponent(id)}/${index}${q ? '?' + q : ''}`
}
