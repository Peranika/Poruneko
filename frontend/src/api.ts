// Thin wrapper around the Go backend (Wails bindings)
import * as Go from '../wailsjs/go/main/App'
import { EventsOn } from '../wailsjs/runtime/runtime'
import type {
  Bookmark,
  CreatorCandidate,
  DownloadProgress,
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
  UpdateRelease, SiteInfo } from './types'

// the generated models are classes, so call through any to pass plain objects
const go = Go as unknown as Record<string, (...args: any[]) => Promise<any>>

export const api = {
  /** The sites from site plugins (the browse screens appear only when there is one) */
  sites: (): Promise<SiteInfo[]> => go.Sites(),
  /** The web page of a work on its site ("" if none) */
  webURL: (key: string): Promise<string> => go.WebURL(key),
  list: (q: ListQuery): Promise<ListResult> => go.List(q),
  gallery: (key: string): Promise<GalleryDetail> => go.Gallery(key),
  suggest: (term: string): Promise<Suggestion[]> => go.Suggest(term),
  /** Works by bookmarked artists (Favorites) */
  favorites: (q: FavoritesQuery): Promise<FavoritesResult> => go.Favorites(q),

  bookmarks: (): Promise<Bookmark[]> => go.Bookmarks(),
  addBookmark: (s: GallerySummary): Promise<Bookmark> => go.AddBookmark(s),
  removeBookmark: (key: string): Promise<void> => go.RemoveBookmark(key),
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

  getSettings: (): Promise<Settings> => go.GetSettings(),
  setSettings: (s: Settings): Promise<Settings> => go.SetSettings(s),
  /** Dialog to choose the save location (title is the dialog title) */
  chooseLibraryDir: (title: string): Promise<string> => go.ChooseLibraryDir(title),
  /** Placeholders of the file name format (descriptions are in fileName.placeholders) */
  fileNamePlaceholders: (): Promise<string[]> => go.FileNamePlaceholders(),
  /** Example of the format (sampleSeries is the series name for the example when no work is in a series) */
  previewFileName: (format: string, sampleSeries: string): Promise<string> => go.PreviewFileName(format, sampleSeries),
  applyFileNameFormat: (): Promise<number> => go.ApplyFileNameFormat(),

  appVersion: (): Promise<string> => go.AppVersion(),
  /** Check for a newer version (null if none) */
  checkUpdate: (): Promise<UpdateRelease | null> => go.CheckUpdate(),
  /** Install the newer version found and restart */
  installUpdate: (): Promise<void> => go.InstallUpdate(),
  onUpdateProgress: (cb: (p: { done: number; total: number }) => void): (() => void) => EventsOn('update:progress', cb),

  openExternal: (url: string): Promise<void> => go.OpenExternal(url),
  setFullscreen: (on: boolean): Promise<void> => go.SetFullscreen(on),
  minimise: (): Promise<void> => go.WindowMinimise(),
  toggleMaximise: (): Promise<void> => go.WindowToggleMaximise(),
  close: (): Promise<void> => go.WindowClose(),

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

/** Page image URL (served by imgserver on the Go side; from local files if downloaded) */
export const imageUrl = (key: string, index: number): string => {
  const [site, id] = parseKey(key)
  return `/poru/img/${site}/${id}/${index}`
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
  return `/poru/thumb/${site}/${id}/${index}${q ? '?' + q : ''}`
}
