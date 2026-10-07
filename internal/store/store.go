// Package store persists settings to a JSON file and bookmarks to SQLite.
package store

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"poruneko/internal/model"
)

// jsonFile is a JSON file written lazily and atomically
type jsonFile struct {
	path string
}

func (f *jsonFile) load(v any) {
	b, err := os.ReadFile(f.path)
	if err != nil {
		return
	}
	if err := json.Unmarshal(b, v); err != nil {
		// move a broken file aside and start with defaults
		_ = os.WriteFile(fmt.Sprintf("%s.broken-%d", f.path, time.Now().Unix()), b, 0o644)
	}
}

func (f *jsonFile) write(v any) error {
	b, err := json.MarshalIndent(v, "", " ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(f.path), 0o755); err != nil {
		return err
	}
	tmp := f.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, f.path)
}

// Store serves all reads from memory and writes changes lazily
type Store struct {
	mu        sync.RWMutex
	settings  model.Settings
	bookmarks map[string]*model.Bookmark
	series    map[string]*model.Series
	sf        *jsonFile
	db        *bookmarkDB
	dirty     bool            // the settings changed
	changed   map[string]bool // keys of bookmarks to write (deleted if gone)
	changedS  map[string]bool // IDs of series to write (deleted if gone)
	// owners are the settings kept per owner of works (owners.go)
	owners   map[string]*model.OwnerSettings
	changedO map[string]bool // keys of owners' settings to write (deleted if gone)
	// deleted are the shared bookmarks and series deleted, kept for syncing (shared.go)
	deleted  map[string]*deletion
	changedD map[string]bool

	history      []model.HistoryEntry // works opened in the viewer, newest first (history.go)
	hf           *jsonFile
	historyDirty bool
	saveTimer    *time.Timer
}

// DataDir is where app data is stored (can be changed with env PORUNEKO_DATA_DIR)
func DataDir() string {
	if d := os.Getenv("PORUNEKO_DATA_DIR"); d != "" {
		return d
	}
	d, err := os.UserConfigDir()
	if err != nil {
		d = "."
	}
	return filepath.Join(d, "Poruneko")
}

// defaultLibraryDir is where works are saved until the user chooses: PORUNEKO_LIBRARY_DIR (set by the Android
// app: a folder the user can reach without a permission), else the data folder's
func defaultLibraryDir(dataDir string) string {
	if d := os.Getenv("PORUNEKO_LIBRARY_DIR"); d != "" {
		return d
	}
	return filepath.Join(dataDir, "library")
}

func Open() *Store {
	dir := DataDir()
	s := &Store{
		settings: model.Settings{
			LibraryDir:          defaultLibraryDir(dir),
			MouseGestures:       true,
			InfiniteScroll:      true,
			RememberWindow:      true,
			AutoDownload:        true,
			DownloadConcurrency: 4,
			RangeThumb:          RangeThumbPage,
			TempFiles:           TempFilesStartup,
			FontScale:           100,
			Viewer:              model.ViewerSettings{Mode: "spread", Direction: "rtl", CoverSingle: true, Fit: "contain", Predecode: DefaultPredecode, SlideSeconds: DefaultSlideSeconds},
			MetaSources:         []string{"dlsite", "fanza"},
			FallbackSources:     []string{"pawchive", "duckduckgo"},
			SourcesRev:          currentSourcesRev,
			FileNameFormat:      DefaultFileNameFormat,
		},
		bookmarks: map[string]*model.Bookmark{},
		series:    map[string]*model.Series{},
		sf:        &jsonFile{path: filepath.Join(dir, "settings.json")},
		hf:        &jsonFile{path: filepath.Join(dir, "history.json")},
		db:        &bookmarkDB{path: filepath.Join(dir, "bookmarks.db")},
		changed:   map[string]bool{},
		changedS:  map[string]bool{},
		owners:    map[string]*model.OwnerSettings{},
		changedO:  map[string]bool{},
		deleted:   map[string]*deletion{},
		changedD:  map[string]bool{},
	}
	s.sf.load(&s.settings)
	s.hf.load(&s.history)
	s.loadBookmarks(dir)
	s.loadSeries()
	s.loadOwners()
	s.loadDeleted()
	normalizeSettings(&s.settings, filepath.Join(dir, "library"))
	if migrateSources(&s.settings) {
		s.dirty = true
		s.scheduleFlush()
	}
	return s
}

// loadBookmarks loads from the DB. Without a DB it migrates from the old bookmarks.json
func (s *Store) loadBookmarks(dir string) {
	bms, err := loadTable[model.Bookmark](s.db, bookmarksTable)
	if err != nil {
		log.Printf("[store] bookmarks.db: %v", err)
		return
	}
	if len(bms) > 0 {
		s.bookmarks = bms
		return
	}
	old := &jsonFile{path: filepath.Join(dir, "bookmarks.json")}
	if _, err := os.Stat(old.path); err != nil {
		return
	}
	old.load(&s.bookmarks)
	for k := range s.bookmarks {
		s.changed[k] = true
	}
	if err := s.flushBookmarks(); err != nil {
		log.Printf("[store] failed to migrate bookmarks.json: %v", err)
		return
	}
	_ = os.Rename(old.path, old.path+".migrated")
	log.Printf("[store] migrated %d bookmarks from bookmarks.json", len(s.bookmarks))
}

// save writes after 300ms in a batch (settings)
func (s *Store) save() {
	s.dirty = true
	s.scheduleFlush()
}

// touch writes after 300ms in a batch (bookmarks)
func (s *Store) touch(key string) {
	s.changed[key] = true
	s.scheduleFlush()
}

func (s *Store) scheduleFlush() {
	if s.saveTimer == nil {
		s.saveTimer = time.AfterFunc(300*time.Millisecond, func() { s.Flush() })
	}
}

func (s *Store) Flush() {
	s.mu.Lock()
	s.saveTimer = nil
	dirty := s.dirty
	s.dirty = false
	settings := s.settings
	historyDirty := s.historyDirty
	s.historyDirty = false
	history := slices.Clone(s.history)
	if err := s.flushBookmarks(); err != nil {
		log.Printf("[store] bookmarks: %v", err)
	}
	s.mu.Unlock()

	if historyDirty {
		if err := s.hf.write(history); err != nil {
			log.Printf("[store] history: %v", err)
		}
	}
	if dirty {
		if err := s.sf.write(settings); err != nil {
			log.Printf("[store] settings: %v", err)
		}
	}
}

// flushBookmarks writes changed bookmarks and series (call with the lock held; on failure retries next time)
func (s *Store) flushBookmarks() error {
	if len(s.changed) == 0 && len(s.changedS) == 0 && len(s.changedO) == 0 && len(s.changedD) == 0 {
		return nil
	}
	err := s.db.write(map[table]changes{
		bookmarksTable: collect(s.changed, s.bookmarks, func(b *model.Bookmark) int64 { return b.AddedAt }),
		seriesTable:    collect(s.changedS, s.series, func(x *model.Series) int64 { return x.CreatedAt }),
		ownersTable:    collect(s.changedO, s.owners, func(o *model.OwnerSettings) int64 { return o.UpdatedAt }),
		deletedTable:   collect(s.changedD, s.deleted, func(d *deletion) int64 { return d.At }),
	})
	if err != nil {
		return err
	}
	clear(s.changed)
	clear(s.changedS)
	clear(s.changedO)
	clear(s.changedD)
	return nil
}

// collect splits the changed keys into rows to write and rows to delete
func collect[T any](changed map[string]bool, m map[string]*T, ts func(*T) int64) changes {
	c := changes{put: map[string]row{}}
	for k := range changed {
		if v, ok := m[k]; ok {
			c.put[k] = row{ts: ts(v), v: v}
		} else {
			c.del = append(c.del, k)
		}
	}
	return c
}

// ---------------------------------------------------------------- Window

func windowFile() *jsonFile { return &jsonFile{path: filepath.Join(DataDir(), "window.json")} }

// WindowState is the window position and size at the last exit (false if not saved)
func WindowState() (model.WindowState, bool) {
	var w model.WindowState
	windowFile().load(&w)
	return w, w.Width > 0 && w.Height > 0
}

func SaveWindowState(w model.WindowState) error { return windowFile().write(w) }

// ---------------------------------------------------------------- Settings

func (s *Store) Settings() model.Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

// SiteDir is where a site's works are saved: the folder chosen for it, or LibraryDir/<site id>
func (s *Store) SiteDir(site model.SiteID) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if d := s.settings.SiteDirs[site]; d != "" {
		return d
	}
	return filepath.Join(s.settings.LibraryDir, site)
}

func (s *Store) SetSettings(v model.Settings) model.Settings {
	s.mu.Lock()
	defer s.mu.Unlock()
	normalizeSettings(&v, s.settings.LibraryDir)
	s.settings = v
	s.save()
	return s.settings
}

// ---------------------------------------------------------------- Bookmarks

func (s *Store) Bookmarks() []model.Bookmark {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]model.Bookmark, 0, len(s.bookmarks))
	for _, b := range s.bookmarks {
		out = append(out, *b)
	}
	slices.SortFunc(out, func(a, b model.Bookmark) int { return int(b.AddedAt - a.AddedAt) })
	return out
}

func (s *Store) Bookmark(key string) (model.Bookmark, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.bookmarks[key]
	if !ok {
		return model.Bookmark{}, false
	}
	return *b, true
}

func (s *Store) Has(key string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.bookmarks[key]
	return ok
}

func (s *Store) Put(b model.Bookmark) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if old, ok := s.bookmarks[b.Key]; ok {
		stamp(&b, old, time.Now().UnixMilli())
	}
	s.bookmarks[b.Key] = &b
	s.touch(b.Key)
}

// Update changes a bookmark (false if it does not exist)
func (s *Store) Update(key string, fn func(b *model.Bookmark)) (model.Bookmark, bool) {
	return s.update(key, fn, true)
}

// update changes a bookmark; with stampIt the parts the devices share that changed are stamped with the time
func (s *Store) update(key string, fn func(b *model.Bookmark), stampIt bool) (model.Bookmark, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.bookmarks[key]
	if !ok {
		return model.Bookmark{}, false
	}
	var before model.Bookmark
	if stampIt {
		before = cloneShared(b)
	}
	fn(b)
	if stampIt {
		stamp(b, &before, time.Now().UnixMilli())
	}
	s.touch(key)
	return *b, true
}

func (s *Store) Remove(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if b, ok := s.bookmarks[key]; ok && b.Shared() {
		s.markDeleted("b:"+key, time.Now().UnixMilli())
	}
	delete(s.bookmarks, key)
	s.touch(key)
	s.removeFromSeries(key, "")
}

// normalizeSettings fixes invalid or missing values (on load and on save)
func normalizeSettings(v *model.Settings, libraryDir string) {
	if v.PluginSettings == nil {
		v.PluginSettings = map[string]map[string]string{}
	}
	if strings.TrimSpace(v.FileNameFormat) == "" {
		v.FileNameFormat = DefaultFileNameFormat
	}
	v.Viewer.Predecode = min(max(v.Viewer.Predecode, 0), MaxPredecode)
	if v.Viewer.SlideSeconds < 1 {
		v.Viewer.SlideSeconds = DefaultSlideSeconds
	}
	v.Viewer.SlideSeconds = min(v.Viewer.SlideSeconds, 3600)
	if v.Viewer.SlideTimeLeft {
		if v.Viewer.SlideClock == "" {
			v.Viewer.SlideClock = "bl"
		}
		v.Viewer.SlideTimeLeft = false
	}
	if !slices.Contains([]string{"tl", "tr", "bl", "br"}, v.Viewer.SlideClock) {
		v.Viewer.SlideClock = ""
	}
	if !slices.Contains([]string{"top", "bottom", "left", "right"}, v.Viewer.SlideEdge) {
		v.Viewer.SlideEdge = ""
	}
	if !slices.Contains([]string{"weak", "strong"}, v.Viewer.Moire) {
		v.Viewer.Moire = ""
	}
	v.DownloadConcurrency = max(v.DownloadConcurrency, 1)
	if v.LibraryDir == "" {
		v.LibraryDir = libraryDir
	}
	if v.SiteOrder == nil {
		v.SiteOrder = []string{}
	}
	if v.SiteScreenOrder == nil {
		v.SiteScreenOrder = map[string][]string{}
	}
	if v.SiteScreens != "grid" {
		v.SiteScreens = ""
	}
	if v.SiteLoadMore == nil {
		v.SiteLoadMore = map[string]string{}
	}
	for k, m := range v.SiteLoadMore {
		if !model.IsLoadMore(m) {
			delete(v.SiteLoadMore, k)
		}
	}
	if v.SiteFileNameFormats == nil {
		v.SiteFileNameFormats = map[string]string{}
	}
	for k, f := range v.SiteFileNameFormats {
		if strings.TrimSpace(f) == "" {
			delete(v.SiteFileNameFormats, k)
		}
	}
	if v.SiteDirs == nil {
		v.SiteDirs = map[string]string{}
	}
	if v.LocalDirs == nil {
		v.LocalDirs = []model.LocalDir{}
	}
	for i, d := range v.LocalDirs {
		if strings.TrimSpace(d.Name) == "" {
			v.LocalDirs[i].Name = filepath.Base(d.Path)
		}
		if d.Icon == "" {
			v.LocalDirs[i].Icon = "folder"
		}
	}
	if !validRangeThumb(v.RangeThumb) {
		v.RangeThumb = RangeThumbPage
	}
	if !validTempFiles(v.TempFiles) {
		v.TempFiles = TempFilesStartup
	}
	v.FontScale = clampFontScale(v.FontScale)
	if v.Theme != "light" && v.Theme != "system" {
		v.Theme = ""
	}
	if !accentColor.MatchString(v.Accent) {
		v.Accent = ""
	}
	if v.UILanguage != "ja" && v.UILanguage != "en" {
		v.UILanguage = ""
	}
}

// migrateSources updates the creator info sources of settings from older versions (true if changed)
func migrateSources(v *model.Settings) bool {
	changed := false
	// add fallbacks added later (pawchive, DuckDuckGo), once
	if v.SourcesRev < currentSourcesRev {
		for _, src := range []string{"pawchive", "duckduckgo"} {
			if !slices.Contains(v.FallbackSources, src) {
				v.FallbackSources = append(v.FallbackSources, src)
			}
		}
		v.SourcesRev = currentSourcesRev
		changed = true
	}
	// pixiv, FANBOX and Patreon were removed as fallbacks
	n := len(v.FallbackSources)
	v.FallbackSources = slices.DeleteFunc(v.FallbackSources, func(src string) bool {
		return src == "pixiv" || src == "fanbox" || src == "patreon"
	})
	return changed || len(v.FallbackSources) != n
}

// DefaultFileNameFormat is the default cbz file name format
const DefaultFileNameFormat = "[{group} ({artist})] {title}"

// currentSourcesRev is the version of the default sources (1: added pawchive and DuckDuckGo)
const currentSourcesRev = 1

// values of Settings.RangeThumb
const (
	RangeThumbPage   = "page"   // first page in the range
	RangeThumbSource = "source" // the source gallery's cover
)

func validRangeThumb(v string) bool { return v == RangeThumbPage || v == RangeThumbSource }

// values of Settings.TempFiles (how pages saved to .parts while viewing undownloaded bookmarks are handled)
const (
	TempFilesStartup     = "startup"     // delete at startup
	TempFilesViewerClose = "viewerClose" // delete when the gallery page closes
	TempFilesPack        = "pack"        // make a cbz once all pages are saved
)

// accentColor is the form of the accent color setting (#rrggbb)
var accentColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// clampFontScale keeps the text size within 80-150% (100% if unset)
func clampFontScale(v int) int {
	if v == 0 {
		return 100
	}
	return min(150, max(80, v))
}

func validTempFiles(v string) bool {
	return v == TempFilesStartup || v == TempFilesViewerClose || v == TempFilesPack
}

// DefaultSlideSeconds is the default slideshow interval
const DefaultSlideSeconds = 5

// default and maximum number of pages to decode in advance (each page uses a few MB to tens of MB of memory)
const (
	DefaultPredecode = 4
	MaxPredecode     = 30
)
