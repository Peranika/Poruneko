// English strings. Must have the same shape as ja.ts (enforced by the Dict type).
import type { Dict } from './ja'

export const en: Dict = {
  common: {
    loading: 'Loading…',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
    retry: 'Retry',
    all: 'All',
    none: 'None',
    unknown: 'Unknown',
    items: '{n} items',
    works: '{n} works',
    pages: '{n} pages',
    circle: 'Group',
    artist: 'Artist',
    title: 'Title',
    series: 'Series',
    edit: 'Edit',
    needsReview: 'Review',
    showFolder: 'Show in folder',
    listSeparator: ', ',
    parens: ' ({text})',
    rangeSeparator: '–'
  },

  app: {
    downloadingNow: 'Downloading',
    back: 'Back (Alt+←)',
    backShort: 'Back',
    forward: 'Forward (Alt+→)',
    minimize: 'Minimize',
    maximize: 'Maximize',
    bookmarks: 'Bookmarks',
    siteList: 'List',
    favorites: 'Favorites',
    history: 'History',
    historyTitle: 'Works opened in the viewer',
    settings: 'Settings'
  },

  labels: {
    siteSource: 'Work info',
    titleSource: 'Title',
    manualSource: 'Manual',
    siteArtist: 'Artist',
    siteGroup: 'Group'
  },

  meta: {
    creator: 'Creator',
    artists: 'Artists',
    groups: 'Groups',
    parodies: 'Series',
    characters: 'Characters',
    language: 'Language',
    pages: 'Pages',
    date: 'Posted'
  },

  bookmarkList: {
    sorts: {
      added: 'Date added',
      title: 'Title',
      artist: 'Artist name',
      circle: 'Group name'
    },
    special: {
      all: 'All',
      review: 'Needs review',
      pending: 'Looking up',
      downloading: 'Downloading',
      none: 'Unknown'
    },
    nameKinds: {
      circle: 'Group',
      artist: 'Artist',
      siteGroup: 'site group',
      siteArtist: 'site artist'
    }
  },

  bookmarks: {
    openNameIn: 'Open {name} in {view}',
    fromUrl: 'Add from URL',
    fromUrlTitle: 'Bookmarks the work whose URL is on the clipboard (pasting with Ctrl+V on this screen adds it too)',
    fromUrlPrompt: 'URL of the work to bookmark',
    fromUrlAlready: 'Already bookmarked',
    byCircleToggle: 'By group (click again for by artist)',
    shuffle: 'Shuffle',
    avoidRecent: 'Play recently opened works less often',
    avoidRecentTitle: 'Works opened recently (from the history) tend to come later in the shuffle (back to normal after about 3 days)',
    shuffleTitle: 'Opens the works shown in a random order ("next work" follows it; a series stays together in order)',
    localTagsToggle: 'Filter by local tags (press again for work tags)',
    workTagsToggle: 'Filter by work tags (press again for local tags)',
    workTags: 'Tags',
    workTagsFilter: 'Filter tags',
    noSiteNames: 'No matching tags',
    byArtistToggle: 'By artist (click again for by group)',
    seriesTitle: 'Series (sequels and other collections)',
    searchPlaceholder: 'Search artist, group or title (Ctrl+F)',
    stopSearch: 'Stop searching (Esc)',
    matchingNames: 'Matching names',
    noMatchingNames: 'None',
    searchByName: 'Search for "{name}"',
    searchResults: 'Results for "{query}"',
    empty: 'No bookmarks yet',
    emptyHint: 'Add them with {icon} on the list or a gallery page',
    noResults: 'No bookmarks match "{query}"',
    showName: 'Show bookmarks of {kind} "{name}"'
  },

  tags: {
    title: 'Local tags',
    add: 'Add local tags',
    addToSeries: 'Add local tags to all works in the series',
    seriesHint: 'Applies to all {n} works in the series (shows the local tags they all share)',
    addPlaceholder: 'Add local tags (Enter or comma to separate)',
    remove: 'Remove',
    filterTitle: 'Filter by this local tag (with several, works having all of them)',
    untagged: 'No local tags',
    rename: 'Rename the local tag (on all works that have it)',
    renamePrompt: 'New name for "{tag}" (merged if a local tag with that name exists)',
    renamed: 'Renamed "{from}" to "{to}" ({n} works)',
    noTags: 'No local tags yet (add them with + on a card or on the gallery page)',
    showTag: 'Show works with the local tag "{tag}"',
    hint: 'Your own tags for filtering. You can filter by them in the bookmarks and in the tabs of the local folders'
  },

  bookmarkCard: {
    editCreator: 'Edit creator info',
    seriesOf: 'Series: {name} (change or remove)',
    addToSeries: 'Add to a series',
    deleteFiles: 'Delete the downloaded cbz',
    unbookmark: 'Remove bookmark',
    unbookmarkConfirm: 'Remove this bookmark?',
    resolving: 'Looking up creator info…',
    seriesChip: 'No. {no} of the series "{name}"',
    uncertain: 'The creator info is uncertain. Click to review',
    uncertainShort: 'The creator info is not certain (check it with the yellow button shown on hover)',
    actions: {
      retryRange: 'Retry (keeps the pages already fetched and fetches only the missing ones)',
      buildRange: 'Download and make a cbz',
      pause: 'Pause',
      download: 'Download'
    }
  },

  bookmarkActions: {
    deleteRangeConfirm: 'Delete the cbz?\nThe bookmark stays and will show the pages of the source gallery.',
    deleteConfirm: 'Delete the downloaded cbz?',
    unbookmarkRangeConfirm: 'Remove this bookmark?\nThe cbz made from the page range will also be deleted.'
  },

  download: {
    done: 'Saved',
    doneTitle: 'Downloaded',
    downloading: 'Downloading',
    queued: 'Queued',
    error: 'Error',
    paused: 'Paused',
    local: 'Local',
    localTitle: 'A local work made from a page range',
    link: 'Link',
    linkTitle: 'A page range bookmark (shows the pages of the source gallery)',
    withRetryHint: '{error}. Click "Retry" to continue building'
  },

  series: {
    noSeries: 'No series yet',
    newSeries: '+ New series',
    create: 'Create',
    open: 'Open the series "{name}"',
    inThisGroup: '{n} works in this group',
    sorts: {
      title: 'title',
      date: 'posted date'
    },
    sortTitle: 'Reorder the series by {sort}',
    sortButton: 'Sort by {sort}',
    selectHint: 'Select a series on the left or create a new one',
    namePrompt: 'Series name',
    deleteConfirm: 'Delete the series "{name}"?\nThe bookmarks in it will remain.',
    deleteFolderNote: 'This series was made from a folder automatically. Once deleted, the folder is not made into a series again.',
    rename: 'Rename the series',
    delete: 'Delete the series',
    empty: 'This series has no works yet',
    emptyHint: 'Add works with {icon} on a bookmark card or a gallery page'
  },

  selection: {
    select: 'Select (Ctrl+click toggles, Shift+click selects a range)',
    count: '{n} selected',
    hint: 'Buttons on a selected card apply to all selected works (Ctrl+click to add; click elsewhere or Esc to clear)',
    selectAll: 'Select all shown',
    clear: 'Clear selection',
    appliesTo: 'Applies to all {n} selected works',
    tagHint: 'Applies to all {n} selected works (shows the local tags they all share)',
    unbookmarkConfirm: 'Remove the bookmarks of the {n} selected works?',
    unbookmarked: 'Removed {n} bookmarks',
    deleteFilesConfirm: 'Delete the downloaded files of the {n} selected works?',
    creatorSaved: 'Saved the creator info of {n} works',
    addedToSeries: 'Added {n} works to "{name}"'
  },

  seriesDialog: {
    title: 'Series',
    created: 'Created the series "{name}"',
    unchanged: 'The series is unchanged',
    added: 'Added as No. {no} of "{name}"',
    removed: 'Removed from "{name}"',
    current: 'Current series: {name} ({no} / {total})',
    suggestions: 'Suggestions (from title and creator)',
    filter: 'Filter by series name',
    noMatch: 'No series match',
    newSeries: 'New series',
    namePlaceholder: 'Series name',
    hint: 'Adding to another series removes the work from its current series. Drag on the bookmarks screen to change the order within a series',
    remove: 'Remove from series',
    createAndAdd: 'Create and add',
    add: 'Add'
  },

  creator: {
    candidateSeparator: ' / ',
    saved: 'Saved the creator info',
    title: 'Review creator info',
    siteInfo: 'Site: groups {groups} / artists {artists}',
    fillFromBookmarks: 'From other bookmarks:',
    fillTitle: 'Used in {n} works with the same name. Click to fill it in',
    linked: 'Linked to:',
    unlink: 'Unlink',
    unlinkTitle: 'Keeps the artist and group names and only removes the link to the product page (when it is the wrong work)',
    unlinked: 'Removed the link',
    fromUrl: 'Read from page',
    fromUrlTitle: 'Reads the artist and group names from a product page you found (DLsite / FANZA Doujin only)',
    fromUrlPlaceholder: 'URL of a DLsite / FANZA Doujin product page',
    circlePlaceholder: 'Group name',
    artistsPlaceholder: 'Artist names (comma separated)',
    searching: 'Searching…',
    search: 'Search candidates',
    webSearch: 'Search the web',
    webSearchHint:
      'Opens a Google search for the title or artist names in your browser. Enter the artist and group names you find in the fields above and save',
    siteFilter: 'Sites to search',
    siteNone: 'Any site',
    siteAll: 'All supported sites',
    googleTitle: 'Google the title',
    googleArtist: 'Google the artist names',
    noCandidates: 'No candidates',
    score: 'Title similarity',
    openProduct: 'Open the product page',
    resolveAgain: 'Look up again automatically'
  },

  favorites: {
    artists: 'Favorite artists',
    narrow: 'Narrow down',
    members: 'Members',
    noOwnNames: 'Nothing to narrow down by',
    noArtists: 'Your bookmarked works have no artist info',
    sortTitle: 'Order of the artists',
    sortCount: 'Most',
    sortName: 'Name',
    bookmarkCount: '{n} bookmarks',
    multiSelect: 'You can select more than one',
    newest: 'New from favorites',
    includeGroups: 'Include groups',
    excludeCollective: 'Hide artists only in anthologies',
    artistScope: 'Artists searched',
    allArtists: 'All artists',
    excludeCollectiveTitle:
      'Removes artists who appear only in bookmarks with many artists (anthologies, magazines) from this list and the search',
    hideBookmarked: 'Hide bookmarked',
    searchInBrowse: 'Search this artist on the site',
    openInBrowse: 'Open on the site',
    emptyNoBookmarks: 'Bookmark works to see more by their artists here',
    empty: 'No matching works'
  },

  history: {
    title: 'History',
    empty: 'No works opened yet',
    clear: 'Clear history',
    clearConfirm: 'Clear the whole history?',
    remove: 'Remove from history',
    filter: 'Filter by title or artist',
    fromBrowse: 'Opened from the site',
    fromFavorites: 'Opened from Favorites',
    fromBookmarks: 'Opened from Bookmarks',
    fromLocal: 'Opened from Local',
    openedAt: 'Opened {date}'
  },

  downloadChoice: {
    title: 'What to download',
    pages: 'Images and videos ({n})',
    hint: 'The images and videos in the checked attachments are added after the pages, and read in the viewer once downloaded',
    start: 'Download',
    failed: 'Could not check what can be downloaded: {error}',
    rechooseTitle: 'Choose the files to keep again',
    rechoose: 'Choose',
    rechooseHint:
      'The cbz is built again. What stays is taken from the saved work and only what was added is downloaded; what was unchecked leaves it',
    rechooseButton: 'Choose the files to keep again',
    noAttachments: 'This work has no attachments to choose'
  },

  viewHeader: {
    own: '{filter} for this user',
    ownTitle:
      "This user's posts use this value instead of the common one in every list. It is kept as a share of the common value and follows it when it changes (100 set while the common value is 1000 becomes 1,000 once it is 10,000)",
    common: 'Common ({value})',
    ownBetween: '{n}+'
  },

  browse: {
    fromClipboard: 'From clipboard',
    fromClipboardTitle: 'Shows what the URL (or text) on the clipboard is for',
    viewHint: 'Enter something above, or paste it from the clipboard',
    empty: 'No matching works'
  },

  fileName: {
    siteDescription: 'Used only for works from {name}. Empty uses the format its plugin suggests',
    sitePreset: 'Suggested for {name}',
    commonPreset: 'Same as the common format',
    presets: {
      groupArtistTitle: '[Group (Artist)] Title',
      groupFolder: 'Folder per group',
      creatorFolder: 'Folder per group (or artist)',
      artistFolder: 'Folder per artist',
      groupFolderWithId: 'Group folder + artist + ID',
      titleWithId: 'Title (ID)'
    },
    applyConfirm: 'Rename and move the downloaded cbz files to match the current format?',
    renamed: 'Renamed {n} files',
    title: 'File name format',
    description:
      'Each work is saved as one cbz (an uncompressed zip). {artist} and {group} are the creator info from DLsite etc. Use / to make folders',
    preset: 'Presets',
    presetPlaceholder: 'Presets…',
    example: 'Example:',
    autoRename: 'Files are renamed automatically when the creator info changes. Apply to existing files after changing the format.',
    applying: 'Applying…',
    apply: 'Apply to existing files',
    sampleSeries: 'Series name',
    placeholders: {
      title: 'Title (Japanese title first)',
      title_alt: 'Title as written on the site (romanized, English, etc.)',
      artist: 'Artists (from DLsite etc.)',
      group: 'Group (from DLsite etc.)',
      circle: 'Same as {group}',
      creator: 'Group name (artist names if none)',
      parody: 'Original work / series',
      type: 'Type (doujinshi, manga, etc.)',
      language: 'Language',
      date: 'Posted date (YYYY-MM-DD)',
      year: 'Posted year',
      series: 'Series name (empty if not in a series; no folder is made when used alone as a folder name)',
      series_no: 'Number in the series (01, 02 …)',
      id: 'Gallery ID',
      site: 'Site name'
    }
  },

  gallery: {
    attachments: 'Attachments ({n})',
    openAttachment: 'Open {name} in the browser',
    importable: 'Can add',
    importableHint: "Chosen when downloading, its images and videos are added to the work's pages",
    originPages: ' (pp. {from}–{to})',
    editTitle: 'Change the title (only in this app; empty goes back to the original title)',
    titleSaved: 'Changed the title',
    titleReset: 'Reset the title to the original',
    notInList: 'This work was not found in the list it was opened from',
    noBookmarks: 'No bookmarks',
    lastWork: 'This is the last work',
    firstWork: 'This is the first work',
    nextFailed: 'Could not load the next work: {error}',
    closePanel: 'Close the info panel',
    read: 'Read',
    openPanel: 'Open the info panel',
    loadFailed: 'Could not load the gallery info',
    origin: 'Source gallery:',
    openOrigin: 'Open the first page of the range in the source gallery',
    openSite: 'Open on the site',
    creatorResolving: 'Searching DLsite / FANZA…',
    source: 'Source',
    notFound: 'Not found (work info)',
    changeSeries: 'Change or remove the series',
    openSeries: 'Open this series on the bookmarks screen',
    siteNames: 'Site artists and groups',
    siteNamesHint: 'Favorites uses these names to find new works',
    actions: {
      retryRange: 'Retry',
      retryRangeTitle: 'Keeps the pages already fetched and fetches only the missing ones',
      buildRange: 'Download',
      buildRangeTitle: 'Save the page range as a cbz',
      pause: 'Pause',
      download: 'Download'
    }
  },

  galleryItem: {
    bookmark: 'Bookmark',
    unbookmark: 'Remove bookmark',
    bookmarked: 'Bookmarked'
  },

  tagPicker: {
    remove: 'Remove',
    unset: 'Not set',
    fromOrigin: 'From the source gallery:',
    addAs: 'Add as {kind}',
    groupSuffix: ' (group)',
    placeholder: 'Search site artist or group names'
  },

  keys: {
    groups: {
      viewer: 'Viewer',
      page: 'Turning pages',
      display: 'Display',
      bookmark: 'Bookmarks',
      slideshow: 'Slideshow',
      global: 'Whole app'
    },
    moved: 'Moved {combo} from "{action}"',
    removeBinding: 'Remove this binding',
    addKey: 'Add a key',
    pressKey: 'Press a key (Esc to cancel)',
    resetOne: 'Reset to default',
    escFixed: 'Esc (close the page list or full screen) is fixed',
    resetAll: 'Reset all to default',
    mouseGestures: 'Mouse gestures',
    mouseGesturesHint: 'Hold the right button and left-click to go back / hold the left button and right-click to go forward',
    mouse: {
      middle: 'Mouse 3',
      back: 'Mouse 4',
      forward: 'Mouse 5'
    },
    actions: {
      pageLeft: 'Left page (next when reading right to left)',
      pageRight: 'Right page (previous when reading right to left)',
      next: 'Next page',
      prev: 'Previous page',
      first: 'First page',
      last: 'Last page',
      modeSingle: 'Single page',
      modeSpread: 'Two-page spread',
      modeScroll: 'Vertical scroll',
      fullscreen: 'Toggle full screen',
      thumbs: 'Page list',
      shift: 'Shift spreads by one page',
      bookmark: 'Toggle bookmark',
      nextBookmark: 'Next work (in the order of the list it was opened from; for bookmarks, the bookmarks screen order)',
      prevBookmark: 'Previous work (in the order of the list it was opened from; for bookmarks, the bookmarks screen order)',
      slideshow: 'Start / stop the slideshow',
      slideSlower: 'Slideshow: 1 second longer per page',
      slideFaster: 'Slideshow: 1 second shorter per page',
      back: 'Back to the previous screen',
      forward: 'Forward to the next screen'
    }
  },

  list: {
    listView: 'List view',
    gridView: 'Grid view',
    thumbSize: 'Thumbnail size (double-click to reset)',
    resizePanel: 'Drag to resize (double-click to reset)',
    openPanel: 'Open the filters',
    closePanel: 'Close the filters'
  },

  paged: {
    loadNext: 'Load the next page ({page})',
    pullHint: 'Scrolling on at the bottom loads it too',
    loadFailed: 'Failed to load',
    showing: 'showing {page}',
    pageOf: ' · page {page} / {total}',
    loadPrev: 'Load the previous page ({page})',
    lastPage: 'This is the last page',
    divider: 'Page {page}{total}',
    dividerTotal: ' / {total}',
    noneMatched: ' · no matches',
    pageLoadFailed: 'Failed to load page {page}',
    failedItems: '({n} failed to load)',
    allHidden: 'All {n} works on this page are hidden by the filter',
    jump: 'Go to page'
  },

  pageRange: {
    title: 'Filter by page count (hides non-matching works within each page)',
    label: 'Pages',
    min: 'Min',
    max: 'Max',
    clear: 'Clear the page count filter'
  },

  pagination: {
    jump: 'Go'
  },

  slideCurve: {
    title: 'Slideshow automatic interval (tuning)',
    hint: 'How many times the interval is, by where the page stands in complexity among sample pages (percentile); straight lines in between. Saved on this device only and applied at once',
    percentile: 'Percentile',
    factor: 'Multiplier',
    reset: 'Reset'
  },
  library: {
    rescan: 'Rescan',
    rescanTitle: 'Read the folders again (new cbz / zip files are added and works whose file is gone are taken out)',
    added: 'Added {n} works',
    noNew: 'No new works',
    remove: 'Remove from the library',
    removeConfirm: 'Remove this from the library? (The file is not deleted and does not come back when rescanning)',
    removed: 'Removed from the library',
    removedN: 'Removed {n} works from the library',
    removeManyConfirm: 'Remove {n} works from the library? (The files are not deleted and do not come back when rescanning)',
    noResults: 'No works match "{query}"',
    noDirs: 'No local folders yet. Each folder you add becomes a tab listing its works',
    missingGroup: 'Missing files',
    empty: 'No works in this folder',
    emptyHint: 'Put cbz / zip files and the like in the folder set as "Save location" in the settings, then press "Rescan"'
  },
  predecode: {
    title: 'Pages to decode in advance',
    description: 'Keeps the next {ahead} and previous {behind} pages ready to show, so turning pages has no wait.',
    hint: 'Hover over the page number in the viewer to see the estimate for the open work.',
    off: 'Off (decode right before showing)',
    memory:
      'Estimated memory: about {total} ({count} pages × about {perPage}, for {width}×{height} pages; works with larger images use more)',
    viewerOff: 'Decode in advance: off (change it in Settings)',
    viewerOn: 'Decode in advance: next {ahead}, previous {behind} (about {bytes} for this work)'
  },

  range: {
    bookmarked: 'Bookmarked p.{from}–{to}',
    building: ' (building the cbz)',
    pageLabel: '{label} page',
    start: 'Start',
    end: 'End',
    unset: 'Not set',
    pickTitle: 'Click a page in the viewer to choose',
    picking: 'Waiting for a click…',
    pick: 'Pick in viewer',
    title: 'Bookmark a page range',
    origin: 'Source gallery: {title} ({total} pages)',
    artistRequired: 'Artist *',
    artistPlaceholder: 'Artist names (comma separated)',
    optional: 'Optional',
    siteNames: 'Site artists and groups (used for Favorites)',
    saveCbz: 'Save as a cbz',
    pickHint: 'You can use the viewer with this panel open. Press "Pick in viewer" and then click a page',
    willSave: 'Saves {n} pages as a cbz. Removing the bookmark also deletes the cbz',
    willLink: 'Shows {n} pages from the source gallery (you can download them as a cbz later)',
    creating: 'Creating…',
    bookmark: 'Bookmark'
  },

  search: {
    placeholder: 'Search',
    clear: 'Clear',
    submit: 'Search (Enter)'
  },

  settings: {
    title: 'Settings',
    siteScreens: 'Site screens in the sidebar',
    siteScreensHint: 'How the screens (browse, bookmarks...) of the site in use are laid out under its tab',
    siteScreensList: 'With names, one a row',
    siteScreensGrid: 'Icons, two a row',
    siteScreensOpen: 'Always show the screens of every site',
    siteScreensOpenHint: 'When off, only the screens of the site in use are shown',
    loadMore: 'When to load the next page',
    loadMoreHint: 'Later loading calls the site less (for sites with rate limits)',
    loadMoreNear: 'Automatically as the end comes near',
    loadMoreBottom: 'When scrolling on at the bottom',
    loadMoreButton: 'Only with the button',
    showSecret: 'Show',
    hideSecret: 'Hide',
    browse: 'Lists',
    general: 'Display and language',
    sites: 'Sites',
    infiniteScroll: 'Load the next page automatically when scrolling',
    infiniteScrollHint: 'When off, shows one page at a time with page navigation at the bottom',
    viewer: 'Viewer',
    spreadForManga: 'Open manga in spreads and other works on single pages',
    spreadForMangaHint:
      'Single page, spreads or scroll is remembered for each work. A work never switched opens in the mode used last; with this on, the types a site plugin counts as manga (doujinshi and the like) open in spreads, and other types (illustrations and the like) and works of sites without manga (Twitter and the like) on single pages. Works of an unknown type (a local archive without ComicInfo and the like) keep the mode used last',
    moire: 'Moire reduction',
    moireHint:
      'Smooths pages shown smaller than their size so that screentone does not turn into moire. Strong suppresses more but softens fine lines a little',
    moireOff: 'Off',
    moireWeak: 'Weak',
    moireStrong: 'Strong',
    autoFullscreen: 'Open works in full screen',
    autoFullscreenHint: 'Press Esc or the full screen button to return. Moving to the next/previous work keeps the current mode',
    downloads: 'Bookmarks & downloads',
    autoDownload: 'Download automatically when bookmarking',
    deleteOnUnbookmark: 'Delete files when removing a bookmark',
    concurrency: 'Simultaneous downloads (per site, all its works)',
    rangeThumb: 'Thumbnail of page range bookmarks',
    rangeThumbHint: 'For the first page of the range, a small thumbnail from the site (about 10 KB each) is used when not downloaded',
    rangeThumbPage: 'First page of the range',
    rangeThumbSource: 'Cover of the source gallery',
    tempFiles: 'Temporary files (.parts)',
    tempFilesHint:
      'What to do with pages saved while viewing bookmarks that are not downloaded. Files of downloads in progress or paused are never deleted. Temporary files of works no longer bookmarked are always deleted at startup',
    tempFilesStartup: 'Delete at startup',
    tempFilesViewerClose: 'Delete when closing the viewer',
    tempFilesPack: 'Make a cbz when all pages are saved',
    siteDir: 'Save location',
    libraryDirHint: 'Existing files are not moved when you change it',
    siteDirDialog: 'Choose the save folder for {name}',
    login: 'Sign in',
    loginHint: 'Opens the sign-in page of the site. Once you sign in, the login values below are filled in and the window closes',
    loginOpen: 'Open the sign-in page',
    loginOther: 'Another account',
    loginTitle: 'Sign in to {name}',
    loggedIn: 'Filled in the login for {name}',
    libraryDirChanged: 'Changed the save location',
    localDirs: 'Local folders',
    localDirsHint:
      'Each folder becomes a tab listing its cbz / zip files and the like (subfolders included). The files are only read, never changed. Click an icon to change it',
    localDirsDialog: 'Choose a folder for a tab',
    localDirName: 'Tab name',
    localDirIcon: 'Tab icon',
    localDirUp: 'Up',
    localDirDown: 'Down',
    iconsFolder: 'Open the icons folder',
    iconsReloadTitle: 'Read the icons folder again (png, svg, webp and the like)',
    localDirAdd: 'Add a folder',
    localDirAdded: 'Added the folder. Reading its works',
    localDirRemove: 'Remove',
    localDirRemoveConfirm: 'Remove the tab "{name}"?\nIts works leave the lists with their tags and series (the files are not deleted)',
    localDirRemoved: 'Removed the folder',
    restoreRemoved: 'Bring back removed works',
    restoreRemovedTitle: 'Brings back every work taken out with "Remove from the library"',
    change: 'Change',
    metaSources: 'Sources of creator info',
    metaSourcesHint:
      'Searches the titles of bookmarked works to get artist and group names. Sources higher in the list take priority. If nothing is found, the work info is used for now. Only Japanese works (and works without a language) are looked up; translated works use site artist and group names as they are.',
    dlsite: 'DLsite (artists and groups)',
    fanza: 'FANZA Doujin (groups and artists)',
    preferred: ' preferred',
    makePreferred: 'Prefer',
    fallback: 'When not found',
    fallbackHint:
      'If the title search finds no artist or group, the enabled sources are tried from the top (pawchive searches by title, DuckDuckGo by site artist or group names). These match by name or title only, so they are marked "Needs review"; confirm them on the creator info screen.',
    pawchiveHint: 'Searches an archive of Patreon, FANBOX and other posts by title and suggests the creator of a post with a similar title',
    duckduckgoHint:
      'Searches the web for the artist name and reads the creator name from result page titles (pixiv, X, FANBOX, etc.). DuckDuckGo may refuse frequent searches; then the next source is tried',
    plugins: 'Plugins',
    noPlugins: 'No plugins loaded',
    addPlugin: 'Add a plugin',
    addPluginHint: 'Copies a plugin file (.wasm) into the plugins folder. A newer version of a plugin replaces the old one',
    addPluginButton: 'Choose a file',
    addPluginTitle: 'Choose a plugin (.wasm)',
    pluginsAdded: 'Added: {names}. Restart to use them',
    restart: 'Restart',
    hostRestart: 'Restart the app on the computer',
    hostRestartHint: 'Restarts Poruneko on the computer this device is connected to',
    hostRestartConfirm: 'Restart Poruneko on the computer? (Downloads carry on after the restart)',
    hostRestarting: 'Restarting… this screen reloads once it is back',
    pluginHosts: 'connects to: {hosts}',
    pluginFormats: 'Susie archive plug-in ({formats})',
    pluginDefault: 'Default {filter}',
    pluginDefaultHint: 'Changing it on the site screen saves it here too',
    pluginsHint:
      'Plugins (.wasm) and Susie 64-bit archive plug-ins (.sph) in a "plugins" folder next to Poruneko.exe or in the data folder are loaded at the next start. A .wasm plugin can connect only to the hosts it lists, through the app. Susie plug-ins run directly inside the app, so add only ones you trust',
    window: 'Window',
    rememberWindow: 'Remember the window position and size',
    rememberScreen: 'Open the screen from the last exit at the next start',
    rememberScreenHint:
      'Restores the open tab and list, or the open work (with the page). A shuffle play goes on in the same order. For a work opened from a site or Favorites list, next / previous work follows the bookmarks',
    rememberWindowHint:
      'Restores the position, size and maximized state on the next launch (opens at the default position if the monitor is gone)',
    keys: 'Keys',
    uiLanguage: 'Display language',
    uiLanguageHint: 'The screen reloads when changed',
    uiLanguageAuto: 'Automatic (OS language)',
    fontScale: 'Text size',
    fontScaleNormal: '{p}% (default)',
    theme: 'Theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    themeSystem: 'Follow the OS',
    accent: 'Accent color',
    accentDefault: 'Default (pink)',
    accentCustom: 'Pick any color'
  },

  viewer: {
    videoPlay: 'Play',
    videoPause: 'Pause',
    videoMute: 'Mute',
    videoUnmute: 'Unmute',
    videoVolume: 'Volume',
    rangeStart: 'Start',
    rangeEnd: 'End',
    markSeparator: ' · ',
    pickStart: 'Click the start page',
    pickEnd: 'Click the end page',
    pickHint: 'Either side of a spread works. Use keys to turn pages, Esc to cancel',
    cancelPick: 'Cancel',
    framesLoaded: 'Loading frames {n} / {total}',
    reload: 'Reload',
    prefetching: 'Prefetching all pages',
    prefetch: 'Prefetch {done}/{total}',
    modes: {
      single: 'Single page (1)',
      spread: 'Two-page spread (2)',
      scroll: 'Vertical scroll (3)'
    },
    directionTitle: 'Reading direction (right to left: go left / left to right: go right)',
    rtl: 'Right to left',
    ltr: 'Left to right',
    rtlShort: 'RTL',
    ltrShort: 'LTR',
    spread: 'Spreads',
    fitsShort: {
      contain: 'Screen',
      width: 'Width',
      height: 'Height',
      original: '1:1'
    },
    coverSingleTitle: 'Show the cover alone (adjusts spread pairing)',
    coverSingle: 'Single cover',
    shiftTitle: 'Shift the spread pairing by one page from here (S). Press again at the same place to undo',
    shift: 'Shift by 1',
    resetShiftTitle: 'The spreads are shifted by one page. Press to undo all shifts in this work',
    fit: 'Fit',
    fits: {
      contain: 'Fit to screen',
      width: 'Fit to width',
      height: 'Fit to height',
      original: 'Original size'
    },
    thumbs: 'Page list (T)',
    display: 'Display settings (reading direction, fit, spread adjustments)',
    direction: 'Direction',
    slideshow: 'Slideshow',
    lockBar: 'Pin the toolbar (always shown, with the pages above it)',
    unlockBar: 'Unpin the toolbar (shown only when the cursor is at the bottom)',
    slideSecondsNow: 'Slideshow: every {n} s',
    edgeNext: 'Next work',
    edgePrev: 'Previous work',
    edgeHintNext: 'Turn the page once more to go there',
    edgeHintPrev: 'Turn back once more to go there',
    edgeGoNext: 'To the next work',
    edgeGoPrev: 'To the previous work',
    edgeClose: 'Close',
    slideshowStarted: 'Slideshow started (every {n} s)',
    slideshowStopped: 'Slideshow stopped',
    slideshowStart: 'Slideshow (every {n} s; hover for settings)',
    slideshowStop: 'Stop the slideshow',
    slideSeconds: 'seconds per page (Enter to start)',
    toFirst: 'Back to the first page',
    slidePlay: 'Play',
    slideStop: 'Stop',
    slideSecondsUnit: 's',
    slideNextWorkShort: 'Continue to the next work',
    slideNextWork: 'Go on to the next work after the last page',
    slideAutoShort: 'Auto',
    slideAuto:
      'Adjust the time to each page (beta): busy pages (many lines and text) longer and sparse ones shorter (the set seconds are for a typical view; a page shown alone in spread mode gets about half)',
    timeLeft: 'Time left (click the chosen place again to turn it off)',
    timeLeftClockLabel: 'Clock',
    timeLeftEdgeLabel: 'Progress bar',
    timeLeftOff: 'Off',
    timeLeftReverse: 'Reverse',
    timeLeftReverseTitle:
      'Fill the progress bar from the other end (right to left, bottom to top); with "Shrink", it shrinks toward the other end',
    timeLeftShrink: 'Shrink',
    timeLeftShrinkTitle: 'Start the progress bar full and shrink it (what is left is the time left)',
    timeLeftClock: {
      tl: 'Show the time left at the top left while the toolbar is hidden',
      tr: 'Show the time left at the top right while the toolbar is hidden',
      bl: 'Show the time left at the bottom left while the toolbar is hidden',
      br: 'Show the time left at the bottom right while the toolbar is hidden'
    },
    timeLeftEdge: {
      top: 'Show a progress bar of the time left along the top edge',
      bottom: 'Show a progress bar of the time left along the bottom edge',
      left: 'Show a progress bar of the time left along the left edge',
      right: 'Show a progress bar of the time left along the right edge'
    },
    rangeBookmark: 'Bookmark a page range (enter the artist etc., then pick the start and end pages)',
    exitFullscreen: 'Exit full screen (Esc)',
    fullscreen: 'Full screen (F)'
  },

  thumb: {
    change: 'Change thumbnail',
    changeTitle: 'Choose the page and area for the thumbnail',
    title: 'Choose thumbnail',
    prevPage: 'Previous page',
    nextPage: 'Next page',
    lockRatio: 'Match the card aspect ratio',
    lockHint: 'Drag the frame to move it and its corners to resize it',
    freeHint: 'Choose any aspect ratio. The card shrinks the whole area to fit',
    saved: 'Changed the thumbnail',
    reset: 'Reset the thumbnail to the cover',
    resetButton: 'Reset to cover'
  },

  viewTop: {
    fold: 'Hide the filters',
    unfold: 'Show the filters'
  },
  gestures: {
    title: 'Finger gestures',
    hint: 'Binds actions to taps with two or three fingers and swipes with two (a move that changes the distance between the fingers is a pinch, not a gesture). Many Android phones take a three-finger swipe down as a screenshot, and an iPad uses three-finger gestures for copy and paste',
    reset: 'Reset to defaults',
    viewer: 'Viewer',
    list: 'Lists and other screens',
    none: 'None',
    closeViewer: 'Close the viewer',
    maximize: 'Maximize the viewer (full screen)',
    ids: {
      swipe2Left: 'Swipe left with two fingers',
      swipe2Right: 'Swipe right with two fingers',
      swipe2Up: 'Swipe up with two fingers',
      swipe2Down: 'Swipe down with two fingers',
      tap2: 'Tap with two fingers',
      tap3: 'Tap with three fingers'
    }
  },
  androidConnect: {
    title: 'The PC connected to',
    current: 'Connected to {url}',
    hint: 'Change it to another address the PC shows in its settings (Remote access)',
    change: 'Change'
  },
  remote: {
    title: 'Remote access',
    hint: 'Lets browsers on your tablets and phones use Poruneko on this PC: on the home Wi-Fi, and when away through NordVPN Meshnet or Tailscale (nothing else on the internet can connect). Keep the PC on while using it',
    password: 'Password',
    passwordHint: 'The password browsers sign in with (8 characters or more)',
    passwordSet: 'Set. Setting a new one signs out the devices signed in',
    setPassword: 'Set',
    passwordSaved: 'The password is set',
    enable: 'Turn on remote access',
    enableHint: 'The first time, allow it if Windows asks about the firewall',
    failed: 'Could not start: {error}',
    urls: 'Addresses',
    urlsHint:
      'Open one in the browser of the device. Through Meshnet or Tailscale, use the one starting with 100. Adding it to the home screen opens it like an app',
    sessions: 'Devices signed in: {names}',
    deviceSettingsHint:
      'The display, viewer and key settings are kept for each device, by the name it signed in with (this PC keeps its own)',
    signOutAll: 'Sign out all',
    signedOut: 'All devices are signed out'
  },
  update: {
    title: 'Updates',
    available: 'Poruneko {version} is available',
    install: 'Update and restart',
    notes: 'Release notes',
    later: 'Later',
    skip: 'Skip this version',
    skipTitle: 'Do not notify about this version (Check now in Settings still does)',
    preparing: 'Preparing the download…',
    downloading: 'Downloading… {percent}%',
    openGitHub: 'View on GitHub',
    upToDate: 'You have the latest version',
    version: 'Version {version}',
    checkHint: 'Looks for a new version in the GitHub releases',
    checkNow: 'Check now',
    checkAtStart: 'Check for a new version at startup'
  },

  toasts: {
    unbookmarked: 'Removed the bookmark',
    rangeGone: 'This work has been deleted (make it again from the source gallery)',
    bookmarkedDownloading: 'Bookmarked (download started)',
    bookmarked: 'Bookmarked'
  },

  errors: {
    plugin: {
      message: '{text}',
      notWasm: 'Choose a plugin file (.wasm)',
      invalid: 'The file is not a Poruneko plugin: {detail}',
      copyFailed: 'Could not copy the plugin: {detail}'
    },
    remote: {
      shortPassword: 'The password needs {min} characters or more',
      noPassword: 'Set a password first',
      listenFailed: 'Could not start remote access: {detail}'
    },
    site: {
      noAction: 'The site cannot do that'
    },
    login: {
      none: 'The site has no sign-in page',
      busy: 'A sign-in window is already open',
      unsupported: 'Sign-in windows are not available here. Paste the login values instead',
      failed: 'Could not open the sign-in window: {detail}'
    },
    range: {
      invalid: 'Invalid page range (1-{max})',
      noArtist: 'Enter an artist name',
      noTitle: 'Enter a title',
      duplicate: 'The same page range is already bookmarked',
      noOrigin: 'The page range information is missing',
      sourceUnavailable: 'Could not load the source gallery: {detail}',
      notRange: 'This is not a page range bookmark',
      pageMismatch: 'The source gallery has {pages} pages, which does not match the page range',
      noSourcePages: 'The pages of the source gallery are not available',
      interrupted: 'Building was interrupted'
    },
    bookmark: {
      notBookmarked: 'Not bookmarked',
      unknownURL: 'No site can open a work at this URL'
    },
    creator: {
      unsupportedUrl: 'Enter the URL of a DLsite or FANZA Doujin product page',
      urlFailed: 'Could not read creator info from the page: {detail}',
      autoNotForRange: 'Creator info cannot be looked up automatically for page range bookmarks (edit it manually)'
    },
    download: {
      deleteWhileBuilding: 'Cannot delete while the cbz is being built',
      notDownloaded: 'Not downloaded yet',
      pagesFailed: 'Failed to fetch {count} pages ({detail})',
      packFailed: 'Failed to build the cbz: {detail}',
      pageMissing: 'Page {page} is missing',
      attachmentFailed: 'Could not download {name}: {detail}',
      attachmentUnreadable: 'Could not open {name}: {detail}',
      nothingChosen: 'Nothing is chosen to download'
    },
    library: {
      dirOverlapsSave: 'This folder overlaps the save location of a site ({path})',
      dirOverlapsLocal: 'This folder overlaps a local folder ({path})',
      dirOverlaps: 'This folder overlaps a folder already added ({path})',
      missing: 'The folder cannot be read (fixed by itself when it is back)',
      noInfo: 'The gallery info is missing'
    },
    tags: {
      noName: 'Enter a tag name'
    },
    favorites: {
      unsupported: 'This site does not support Favorites'
    },
    series: {
      noName: 'Enter a series name',
      notFound: 'The series was not found'
    },
    settings: {
      renameFailed: 'Failed to rename {count} files'
    },
    thumb: {
      invalidImage: 'Could not make the thumbnail image',
      saveFailed: 'Could not save the thumbnail: {detail}'
    },
    update: {
      checkFailed: 'Could not check for a new version: {detail}',
      noUpdate: 'There is no new version',
      noAsset: 'This version has no download',
      noChecksum: 'Cannot update because the download has no checksum',
      downloadFailed: 'The download failed: {detail}',
      checksumMismatch: 'The downloaded file is not valid (checksum mismatch)',
      writeFailed: 'Could not replace the app (check that its folder is writable): {detail}',
      restartFailed: 'Updated, but could not restart. Start the app manually',
      failed: 'The update failed: {detail}'
    },
    url: {
      notHTTP: 'Not an http(s) URL'
    }
  }
}
