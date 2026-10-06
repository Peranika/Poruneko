// Types matching internal/model on the Go side

export interface PageInfo {
  index: number
  name: string
  width: number
  height: number
  /** The page is a video (played in the viewer) */
  video?: boolean
}

export interface TagInfo {
  ns: string
  name: string
}

export interface GallerySummary {
  key: string
  site: string
  id: string
  title: string
  japaneseTitle: string
  type: string
  language: string
  languageLocal: string
  date: string
  artists: string[]
  groups: string[]
  parodies: string[]
  characters: string[]
  tags: TagInfo[]
  /** The work's own text (a post's body and the like) */
  description?: string
  /** The site's numbers for the work (likes, views...: the ids in its BrowseSpec.stats) */
  stats?: Record<string, number>
  /** The account the work belongs to (a user's id), for the filter values kept per owner */
  owner?: string
  pageCount: number
  /** Source of a work made from a page range (local works only) */
  origin?: Origin
}

/** Where a page range bookmark was cut from */
export interface Origin {
  key: string
  title: string
  /** 1-based */
  from: number
  /** 1-based (inclusive) */
  to: number
  /** Whether the work info's artists and groups are the site's spellings (older ones hold the typed creator name) */
  tags?: boolean
}

export interface RangeRequest {
  sourceKey: string
  from: number
  to: number
  title: string
  artists: string[]
  circle: string
  /** Artists and groups as written on the source site (used by Favorites and the like) */
  siteArtists: string[]
  siteGroups: string[]
  /** If false no cbz is made; the bookmark just shows the source gallery's pages */
  download: boolean
}

export interface GalleryDetail extends GallerySummary {
  pages: PageInfo[]
  /** The work's files that are not pages (archives, documents...): listed on the work page */
  attachments?: Attachment[]
}

/** A file of a work that is not a page; where it is fetched from is asked of the site when it is opened */
export interface Attachment {
  index: number
  name: string
  kind: 'archive' | 'document' | 'audio' | 'other'
  /** Bytes (absent when unknown) */
  size?: number
}

export interface ListQuery {
  /** The site listed (the first site if absent) */
  site?: string
  /** The plugin's own screen listed (its BrowseSpec.views; absent for the site's list). query is then its input */
  view?: string
  query: string
  /** Values of the site plugin's filters (its sort order, language and so on) */
  filters: Record<string, string>
  page: number
  /** Page count filter (no limit if unset) */
  minPages?: number
  maxPages?: number
}

export interface ListResult {
  items: GallerySummary[]
  failed: string[]
  /** -1 when not known (a timeline); more then tells whether there is a next page */
  total: number
  page: number
  perPage: number
  /** Number of works removed from this page by the filters (page count etc.) */
  hidden: number
  more?: boolean
}

export interface Suggestion {
  ns: string
  name: string
  count: number
}

export interface CreatorCandidate {
  source: string
  productId: string
  productTitle: string
  url: string
  circle: string
  artists: string[]
  score: number
}

export type CreatorStatus = 'pending' | 'matched' | 'uncertain' | 'notfound' | 'manual'

export interface CreatorInfo {
  status: CreatorStatus
  circle: string
  artists: string[]
  source: string
  productId?: string
  productTitle?: string
  url?: string
  score?: number
  candidates?: CreatorCandidate[]
  resolvedAt?: number
}

export type DownloadStatus = 'none' | 'queued' | 'downloading' | 'done' | 'error' | 'paused'

export interface DownloadState {
  status: DownloadStatus
  done: number
  total: number
  error?: string
}

/** A series grouping bookmarks (sequels etc.). A work belongs to at most one series */
export interface Series {
  id: string
  name: string
  createdAt: number
  /** Keys of the works in it (in display order) */
  keys: string[]
  /** The subfolder it was made from (works added to the folder join it) */
  folder?: string
}

/** A newer version released on GitHub */
export interface UpdateRelease {
  version: string
  /** Release notes (Markdown) */
  notes: string
  /** The GitHub release page */
  url: string
  /** Whether it can be installed from the app (Windows only; elsewhere it is built from source) */
  canInstall: boolean
}

export interface Bookmark {
  key: string
  addedAt: number
  summary: GallerySummary
  creator: CreatorInfo
  download: DownloadState
  /** Relative path of the saved cbz */
  archiveFile?: string
  /** The user's own tags (separate from the work's own tags) */
  tags?: string[]
  /** The thumbnail chosen by the user (the work's cover if absent) */
  customThumb?: ThumbSpec
  /** The title the user gave the work (the work's own title if absent) */
  customTitle?: string
}

/** The page and area used for the thumbnail (the area is a fraction of the page width and height) */
export interface ThumbSpec {
  page: number
  x: number
  y: number
  w: number
  h: number
  /** Whether the aspect ratio was chosen without matching the card */
  free: boolean
  updatedAt: number
}

export type SlideCorner = 'tl' | 'tr' | 'bl' | 'br'
export type SlideEdge = 'top' | 'bottom' | 'left' | 'right'

/** A plugin loaded at startup */
export interface PluginInfo {
  id: string
  name: string
  version: string
  kind: string
  /** Hosts it may fetch from */
  hosts: string[]
  /** The hosts shown in the settings (hosts if absent) */
  displayHosts?: string[]
  /** The plugin file (.wasm, or .sph for a Susie archive plug-in) */
  file: string
  /** Archive formats a Susie plug-in reads (".rar") */
  formats: string[]
  /** What a site plugin's list screen offers */
  browse?: BrowseSpec | null
}

/** A text in each UI language */
export type Text = Record<string, string>

/** What a site plugin's list screen offers: the search box's hint and the filters above the list */
export interface BrowseSpec {
  placeholder?: Text
  filters: FilterSpec[]
  /** The kinds of the site's tags: how they are named and colored */
  namespaces?: Namespace[]
  /** The numbers the site's works have, shown on them */
  stats?: StatSpec[]
  /** What the site calls the creators the app calls circle ("group") and artist ("artist") */
  creatorLabels?: Partial<Record<'group' | 'artist', Text>>
  /** The plugin's own screens, added to the site's tab */
  views?: ViewSpec[]
  /** The name and icon of the Favorites screen (when it is the plugin's own choice, such as the user's lists) */
  favoritesLabel?: Text
  favoritesIcon?: string
}

/** A plugin's own screen: an input (which can come from the clipboard) and the works listed for it */
export interface ViewSpec {
  id: string
  label: Text
  /** One of the app's icons */
  icon?: string
  placeholder?: Text
  /** Shown while nothing has been entered */
  hint?: Text
  /** The kinds of names (such as "artist") whose links open this screen with the name */
  namespaces?: string[]
  /**
   * Kinds of names that stand for a work's name of the first of namespaces (a display name for a user id): their
   * links open this screen with the work's name of that kind
   */
  aliases?: string[]
}

/** What a plugin shows above its own screen's works for what was entered */
export interface ViewHeader {
  /** The owner of works it is about (a user's id): the values of the filters with a stat can be kept for them */
  owner?: string
  title: string
  subtitle?: string
  text?: string
  /** A small picture's URL */
  image?: string
  actions?: ViewAction[]
}

/** A button of a view's header (with items, a menu of more buttons) */
export interface ViewAction {
  id: string
  label: Text
  icon?: string
  /** Shown as on (following, on a list...) */
  active?: boolean
  /** Asked before doing it */
  confirm?: Text
  items?: ViewAction[]
}

/** A line of a site's state shown on its tab (such as the API calls left) */
export interface StatusLine {
  label: Text
  value: string
  /** What value is out of, shown as "/ max" */
  max?: string
  /** A small text at the end (such as the time until it resets) */
  note?: string
  warn?: boolean
}

/** A number the site's works have (likes, views...) */
export interface StatSpec {
  id: string
  label: Text
  /** One of the app's icons shown before the number (the label if absent) */
  icon?: string
}

/** A kind of the site's tags ("female", "artist"...) */
export interface Namespace {
  id: string
  label: Text
  /** Added after its tags' names ("♀") */
  suffix?: string
  /** Its tags' color (CSS) */
  color?: string
  /** Its tags have Japanese names (tagNamesJa) */
  translated?: boolean
}

/** One filter of a site plugin: a choice of options */
export interface FilterSpec {
  id: string
  label: Text
  /** color: shown where works have the value (their type); spread: works of this type open in spreads if so set */
  options: { value: string; label: Text; color?: string; spread?: boolean }[]
  /** The value until the user chooses another (the user's choice is kept as the plugin's setting) */
  default: string
  /**
   * The screens it is on ("browse" if absent; a view's id for the plugin's own screen), or "settings" for a setting
   * of the plugin that is not a filter
   */
  in?: string[]
  /** Several options at once (joined with ","; none means all) */
  multi?: boolean
  /** The value used while there is a search query */
  onSearch?: string
  /** A minimum of this stat: the app hides the works below the chosen value */
  stat?: string
  /** Kind of a setting: a choice of options (absent), a line of text, or a hidden one */
  kind?: '' | 'text' | 'secret'
  /** Shown under a setting */
  hint?: Text
}

/** A site from a site plugin */
export interface SiteInfo {
  id: string
  name: string
  /** Whether it can list works by several artists (the Favorites screen) */
  favorites: boolean
  /** The site's icon from its plugin (a data URL; "" for none) */
  icon: string
  /** Where the site's works are saved */
  dir: string
  /** What the site's list screen offers (from its plugin) */
  browse: BrowseSpec | null
  /** Works can be added from their URL on the site */
  fromURL: boolean
  /** Favorites lists the plugin's own choice of works, not works by the bookmarked artists */
  ownFavorites: boolean
  /** With ownFavorites: the plugin gives the names Favorites can be narrowed by (its lists and users...) */
  favoriteNames: boolean
  /** The file name format the plugin suggests for its works ('' for the common one) */
  fileNameFormat: string
  /** When the plugin suggests loading the next page while scrolling ('' for near) */
  loadMore: LoadMore | ''
  /** The plugin tells its state (shown on the site's tab) */
  status: boolean
  /** The plugin's version and the hosts it connects to */
  version: string
  hosts: string[]
}

/**
 * When a list loads its next page while scrolling: as its end comes near, when scrolling on at the bottom, or only
 * with the button
 */
export type LoadMore = 'near' | 'bottom' | 'button'

export interface ViewerSettings {
  mode: 'single' | 'spread' | 'scroll'
  direction: 'rtl' | 'ltr'
  coverSingle: boolean
  fit: 'contain' | 'width' | 'height' | 'original'
  /** How many pages ahead to decode in advance (0 disables it) */
  predecode: number
  /** Go full screen automatically when a work is opened */
  autoFullscreen: boolean
  /** Open manga and doujinshi in spreads when the work has no mode of its own */
  spreadForManga: boolean
  /** Slideshow interval in seconds */
  slideSeconds: number
  /** The slideshow goes on to the next work after the last page */
  slideNextWork: boolean
  /** Lengthen or shorten the interval by how much there is on the shown pages (slideSeconds is for a typical view) */
  slideAuto: boolean
  /** Corner where the time left until the next page is shown while the toolbar is hidden ("" off) */
  slideClock: '' | SlideCorner
  /** Edge of the viewer along which a bar shows the time left ("" off) */
  slideEdge: '' | SlideEdge
  /** Fill the progress bar from the other end (right to left, bottom to top) */
  slideEdgeReverse: boolean
  /** Start the progress bar full and shrink it (what is left is the time left) */
  slideEdgeShrink: boolean
  /** Keep the bottom toolbar shown, with the pages above it */
  barLocked: boolean
  /** How strongly pages shown smaller than their size are smoothed against moire ("" off) */
  moire: '' | MoireLevel
}

export type MoireLevel = 'weak' | 'strong'

/** A folder of the user's own archives, shown as a tab of its own */
export interface LocalDir {
  id: number
  path: string
  /** The tab's name */
  name: string
  /** The tab's icon: a built-in icon's name, or "file:<name>" for an image in the icons folder */
  icon: string
}

/** An image in the icons folder */
export interface IconFile {
  name: string
  /** data URL */
  url: string
}

export interface Settings {
  /** Save locations chosen for the site plugins (site id -> folder; see SiteInfo.dir) */
  siteDirs: Record<string, string>
  /** The folders of the user's own archives, each a tab (changed with addLocalDir / setLocalDir / removeLocalDir) */
  localDirs: LocalDir[]
  /** The site plugins' settings: plugin id -> filter id -> the value used by default */
  pluginSettings: Record<string, Record<string, string>>
  autoDownload: boolean
  deleteFilesOnUnbookmark: boolean
  downloadConcurrency: number
  /** How pages saved while viewing (.parts) are handled */
  tempFiles: 'startup' | 'viewerClose' | 'pack'
  /** Text size (%; 100 is normal) */
  fontScale: number
  /** Color theme ("" dark / light / follow the OS) */
  theme: '' | 'light' | 'system'
  /** Accent color as #rrggbb ("" for the default) */
  accent: string
  /** Whether to check for a newer version at startup ('' to check) */
  updateCheck: '' | 'off'
  /** UI language ("" follows the OS) */
  uiLanguage: '' | 'ja' | 'en'
  /** Thumbnail of page range bookmarks (first page in the range / the source gallery's cover) */
  rangeThumb: 'page' | 'source'
  viewer: ViewerSettings
  metaSources: string[]
  /** Sites matched by name when the title search does not find the creator */
  fallbackSources: string[]
  /** Key bindings per action (unset actions use the defaults) */
  keybindings: Record<string, string[]> | null
  /** Load the next page automatically when scrolling a list */
  infiniteScroll: boolean
  /** The order of the sites' tabs as the user arranged them (site ids; others follow) */
  siteOrder?: string[]
  /** The order of each site's screens under its tab (site id -> "browse" | "bookmarks" | "favorites" | "view.<id>") */
  siteScreenOrder?: Record<string, string[]>
  /** How the screens of the site being used are laid out under its tab ('' with names, one a row; grid: icons, two a row) */
  siteScreens?: '' | 'grid'
  /** When a site's list loads its next page while scrolling (a site without one uses its plugin's choice) */
  siteLoadMore?: Record<string, LoadMore>
  /** Restore the window position and size from the last exit at the next start */
  rememberWindow: boolean
  /** Open the screen shown at the last exit at the next start (the tab, its list or the open work) */
  rememberScreen: boolean
  /** Hold right + left click to go back / hold left + right click to go forward */
  mouseGestures: boolean
  /** zip file name format */
  fileNameFormat: string
  /** Formats chosen for sites (a site without one uses its plugin's format, or fileNameFormat) */
  siteFileNameFormats?: Record<string, string>
}

export interface DownloadProgress {
  key: string
  state: DownloadState
}

// ---------------------------------------------------------------- Favorites

export interface FavoritesQuery {
  /** The site searched, with the names from its bookmarks */
  site?: string
  /** Values of the site plugin's filters for Favorites */
  filters: Record<string, string>
  page: number
  /** Artist or group to narrow to ("artist:xxx" / "group:yyy"; all if empty) */
  tag: string
  includeGroups: boolean
  hideBookmarked: boolean
  /** Leave out artists who appear only in bookmarks with many artists (anthologies, magazines) */
  excludeCollective?: boolean
  /** Page count filter (no limit if unset) */
  minPages?: number
  maxPages?: number
}

/** A work opened in the viewer */
export interface HistoryEntry {
  key: string
  summary: GallerySummary
  openedAt: number
  /** Where it was opened from ('' if unknown) */
  origin: '' | 'browse' | 'favorites' | 'bookmarks'
}

export interface FavoriteName {
  tag: string
  name: string
  ns: 'artist' | 'group'
  /** Number of bookmarks with that name */
  bookmarks: number
  /** A small text after the name (the kind of a plugin's own name, such as "list") */
  note?: string
  /** The tags of the names it belongs to (a user's lists); names that are parents are shown apart, above */
  parents?: string[]
  /** One of the plugin's own screens the name opens in (a user's screen), with its input */
  open?: { view: string; query: string }
}

export interface FavoritesResult extends ListResult {
  names: FavoriteName[]
}
