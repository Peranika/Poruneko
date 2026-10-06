package main

import (
	"context"
	"log"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"poruneko/internal/apperr"
	"poruneko/internal/imgserver"
	"poruneko/internal/library"
	"poruneko/internal/meta"
	"poruneko/internal/model"
	"poruneko/internal/site"
	"poruneko/internal/store"
	"poruneko/internal/update"
)

// App is the API exposed to the frontend
type App struct {
	ctx       context.Context
	st        *store.Store
	lib       *library.Library
	dl        *library.Downloader
	img       *imgserver.Handler
	resolveMu sync.Mutex      // guards resolving and building
	resolving map[string]bool // bookmarks whose creator info is being fetched
	building  map[string]bool // page range bookmarks whose cbz is being built
	relocMu   sync.Mutex      // renames cbz files for series changes one at a time
	scanMu    sync.Mutex      // one library scan at a time

	winMu sync.Mutex
	// window position and size before going full screen (saved instead if the app quits while full screen)
	beforeFullscreen *model.WindowState

	updateMu      sync.Mutex
	pendingUpdate *update.Release // the newer version found (installed by InstallUpdate)
}

func NewApp(st *store.Store, lib *library.Library, dl *library.Downloader, img *imgserver.Handler) *App {
	return &App{st: st, lib: lib, dl: dl, img: img, resolving: map[string]bool{}, building: map[string]bool{}}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// restore the previous window position (move it before it is shown)
	if a.st.Settings().RememberWindow {
		if w, ok := store.WindowState(); ok {
			placeWindow(w)
		}
	}
	a.dl.OnProgress = a.emitProgress
	a.img.OnPageSaved = a.pageCached
	a.dl.ResumeAll()
	a.markInterruptedRanges()
	go func() {
		if n := a.lib.RenameLegacyExt(); n > 0 {
			log.Printf("[library] renamed %d .zip files to .cbz", n)
			a.notifyBookmarks()
		}
		a.applyCollectiveCircles()
		a.restoreLoneCircles()
		a.cleanRangeTags()
		a.VerifyDownloads()
		a.ScanLibrary()
		a.cleanTempFiles()
		// resolve pending creator info one by one
		for _, b := range a.st.Bookmarks() {
			if b.Creator.Status == model.CreatorPending {
				a.resolve(b.Key)
			}
		}
	}()
}

// applyCollectiveCircles sets the circle of existing bookmarks with many artists to
// "magazine" or "anthology" (manually set ones are kept). Running it again gives the same result.
func (a *App) applyCollectiveCircles() {
	changed := false
	for _, b := range a.st.Bookmarks() {
		if b.Creator.Status == model.CreatorManual || b.Creator.Status == model.CreatorPending {
			continue
		}
		c := meta.CollectiveCircle(b.Creator, &b.Summary)
		// keep circles already set to a magazine / anthology name, even one in the other language
		if c == "" || meta.IsCollectiveCircle(b.Creator.Circle) {
			continue
		}
		a.st.Update(b.Key, func(x *model.Bookmark) { x.Creator.Circle = c })
		a.refreshArchiveMeta(b.Key) // update ComicInfo.xml and the file name
		changed = true
	}
	if changed {
		a.notifyBookmarks()
	}
}

// restoreLoneCircles moves circle names back from the creator field. Older versions put a circle found on
// DLsite / FANZA without a creator into the creator field; the chosen candidate shows it was a circle.
// Manually set ones are kept. Running it again gives the same result.
func (a *App) restoreLoneCircles() {
	changed := false
	for _, b := range a.st.Bookmarks() {
		c := b.Creator
		if c.Status == model.CreatorManual || c.Status == model.CreatorPending || c.Circle != "" || len(c.Artists) != 1 {
			continue
		}
		if c.Source != "dlsite" && c.Source != "fanza" {
			continue
		}
		i := slices.IndexFunc(c.Candidates, func(x model.CreatorCandidate) bool { return x.Source == c.Source && x.ProductID == c.ProductID })
		if i < 0 || len(c.Candidates[i].Artists) > 0 || c.Candidates[i].Circle != c.Artists[0] {
			continue
		}
		a.st.Update(b.Key, func(x *model.Bookmark) { x.Creator.Circle, x.Creator.Artists = c.Artists[0], []string{} })
		a.refreshArchiveMeta(b.Key) // update ComicInfo.xml and the file name
		changed = true
	}
	if changed {
		a.notifyBookmarks()
	}
}

// markInterruptedRanges marks page range bookmarks whose build was cut off by quitting as errors (not resumed)
func (a *App) markInterruptedRanges() {
	for _, b := range a.st.Bookmarks() {
		if model.IsLocalKey(b.Key) && b.Download.Status == model.DownloadDownloading && a.lib.ArchivePath(b.Key) == "" {
			a.st.Update(b.Key, func(x *model.Bookmark) {
				x.Download.Fail(apperr.New("range.interrupted", "building the range was interrupted"))
			})
		}
	}
}

// cleanRangeTags removes typed creator names mixed into the site artists of page range bookmarks.
// Older versions prefilled the field with the creator name, so names not from the site (Japanese etc.) may remain.
func (a *App) cleanRangeTags() {
	for _, b := range a.st.Bookmarks() {
		o := b.Summary.Origin
		if !model.IsLocalKey(b.Key) || o == nil || !o.Tags {
			continue
		}
		kept := slices.DeleteFunc(slices.Clone(b.Summary.Artists), func(name string) bool {
			return !isASCII(name) && slices.ContainsFunc(b.Creator.Artists, func(c string) bool { return strings.EqualFold(c, name) })
		})
		if len(kept) == len(b.Summary.Artists) {
			continue
		}
		if _, err := a.SetRangeTags(b.Key, kept, b.Summary.Groups); err != nil {
			log.Printf("[range] %s: clean tags: %v", b.Key, err)
		}
	}
}

// isASCII reports whether s is written the way site tags are (romanized)
func isASCII(s string) bool {
	for _, r := range s {
		if r > unicode.MaxASCII {
			return false
		}
	}
	return true
}

// beforeClose saves the window position and size before quitting
func (a *App) beforeClose(context.Context) bool {
	if !a.st.Settings().RememberWindow {
		return false
	}
	a.winMu.Lock()
	before := a.beforeFullscreen
	a.winMu.Unlock()
	w, ok := getWindowState()
	if before != nil {
		w, ok = *before, true
	}
	if ok {
		if err := store.SaveWindowState(w); err != nil {
			log.Println("[window]", err)
		}
	}
	return false
}

func (a *App) shutdown(context.Context) {
	a.lib.Close()
	a.st.Flush()
}

func (a *App) notifyBookmarks() { runtime.EventsEmit(a.ctx, "bookmarks:changed") }

// emitProgress reports download progress (including page range cbz builds) to the frontend
func (a *App) emitProgress(key string, s model.DownloadState) {
	runtime.EventsEmit(a.ctx, "download:progress", model.DownloadProgress{Key: key, State: s})
}

// mark sets or clears an in-progress flag (resolving / building). When setting, returns false if already set
func (a *App) mark(set map[string]bool, key string, on bool) bool {
	a.resolveMu.Lock()
	defer a.resolveMu.Unlock()
	if !on {
		delete(set, key)
		return true
	}
	if set[key] {
		return false
	}
	set[key] = true
	return true
}

func (a *App) isBuilding(key string) bool {
	a.resolveMu.Lock()
	defer a.resolveMu.Unlock()
	return a.building[key]
}

// ---------------------------------------------------------------- Viewing

// browseSite is the site the browse screens use
// browseSite is the site with this id (the first site if empty)
func browseSite(id model.SiteID) (site.Provider, error) {
	if id != "" {
		return site.Get(id)
	}
	if p := site.Default(); p != nil {
		return p, nil
	}
	return nil, apperr.New("site.none", "no site plugin is installed")
}

// siteOfBookmark is the site a bookmark belongs to: its key's site, or for a page range work its source's site
func siteOfBookmark(b *model.Bookmark) model.SiteID {
	s, _, _ := model.ParseKey(b.Key)
	if s == model.SiteLocal && b.Summary.Origin != nil {
		s, _, _ = model.ParseKey(b.Summary.Origin.Key)
	}
	return s
}

// Sites returns the available sites (the frontend shows the browse screens only when there is one)
func (a *App) Sites() []model.SiteInfo {
	out := []model.SiteInfo{}
	for _, p := range site.All() {
		_, any := p.(site.AnyLister)
		info := model.SiteInfo{ID: p.ID(), Name: p.Name(), Favorites: any, Dir: a.st.SiteDir(p.ID())}
		if pi := pluginInfo(p.ID()); pi != nil {
			info.Icon, info.Browse = pi.Icon, pi.Browse
			info.FromURL, info.OwnFavorites, info.FileNameFormat = pi.Has("fromURL"), pi.OwnFavorites, pi.FileNameFormat
			info.Status = pi.Has("status")
			info.Version, info.Hosts = pi.Version, pi.DisplayHosts
			if len(info.Hosts) == 0 {
				info.Hosts = pi.Hosts
			}
			info.FavoriteNames = pi.OwnFavorites && pi.Has("favoriteNames")
			if model.IsLoadMore(pi.LoadMore) {
				info.LoadMore = pi.LoadMore
			}
		}
		out = append(out, info)
	}
	return out
}

// SiteStatus is a site's state as its plugin tells it (such as the API calls left), shown on its tab
func (a *App) SiteStatus(siteID model.SiteID) []model.StatusLine {
	p, err := site.Get(siteID)
	if err != nil {
		return []model.StatusLine{}
	}
	if s, ok := p.(interface {
		Status(context.Context) []model.StatusLine
	}); ok {
		ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
		defer cancel()
		return s.Status(ctx)
	}
	return []model.StatusLine{}
}

// viewSite is a site plugin with its own screens' headers
type viewSite interface {
	ViewHeader(ctx context.Context, view, query string) (*model.ViewHeader, error)
	ViewAction(ctx context.Context, view, query, action string) (model.Text, error)
}

// ViewHeader is the header of a plugin's own screen for its input (nil when the plugin shows none)
func (a *App) ViewHeader(siteID model.SiteID, view, query string) (*model.ViewHeader, error) {
	p, err := site.Get(siteID)
	if err != nil {
		return nil, err
	}
	v, ok := p.(viewSite)
	if !ok {
		return nil, nil
	}
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	h, err := v.ViewHeader(ctx, view, query)
	if err != nil {
		log.Printf("[view] %s %s header: %v", siteID, view, err)
	}
	return h, err
}

// ViewAction does a button of a plugin's own screen (such as following a user); the message is shown after it
func (a *App) ViewAction(siteID model.SiteID, view, query, action string) (model.Text, error) {
	p, err := site.Get(siteID)
	if err != nil {
		return nil, err
	}
	v, ok := p.(viewSite)
	if !ok {
		return nil, apperr.New("site.noAction", "the site has no such action")
	}
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	return v.ViewAction(ctx, view, query, action)
}

// OpenAttachment opens an attachment of a work (a file that is not a page) in the browser, from where its site
// says it is now. Downloading attachments into the library comes later; until then this is how they are reached
func (a *App) OpenAttachment(key string, index int) error {
	siteID, id, err := model.ParseKey(key)
	if err != nil {
		return err
	}
	p, err := site.Get(siteID)
	if err != nil {
		return err
	}
	src, ok := p.(site.AttachmentSource)
	if !ok {
		return apperr.New("site.noAction", "the site has no attachments")
	}
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	at, err := src.Attachment(ctx, id, index)
	if err != nil {
		return err
	}
	return a.OpenExternal(at.URL)
}

// WebURL returns the web page of a work on its site ("" when there is none, e.g. local archives)
func (a *App) WebURL(key string) string { return site.WebURL(key) }

func (a *App) List(q model.ListQuery) (*model.ListResult, error) {
	p, err := browseSite(q.Site)
	if err != nil {
		return nil, err
	}
	r, err := p.List(a.ctx, q)
	if err != nil {
		log.Printf("[list] %s (view %q, page %d): %v", p.ID(), q.View, q.Page, err)
		return nil, err
	}
	r.FilterStats(browseSpec(p.ID()), q.Filters, a.st.OwnersOf(p.ID()))
	return r, nil
}

// OwnerSettings are the values of a site's filters kept for one owner of its works (such as an X user), which
// override the common ones for that owner's works wherever they are listed
func (a *App) OwnerSettings(siteID model.SiteID, owner string) map[string]string {
	return a.st.OwnerValues(siteID, owner)
}

// SetOwnerSetting keeps the value of a filter for one owner of a site's works ("" goes back to the common value)
func (a *App) SetOwnerSetting(siteID model.SiteID, owner, filterID, value string) map[string]string {
	return a.st.SetOwnerValue(siteID, owner, filterID, value)
}

// browseSpec is what a site's plugin says about its screens (nil for none)
func browseSpec(id model.SiteID) *model.BrowseSpec {
	if pi := pluginInfo(id); pi != nil {
		return pi.Browse
	}
	return nil
}

// AddBookmarkFromURL bookmarks the work at a URL on one of the sites (such as one copied from the browser)
func (a *App) AddBookmarkFromURL(rawURL string) (model.Bookmark, error) {
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	rawURL = strings.TrimSpace(rawURL)
	for _, p := range site.All() {
		r, ok := p.(site.URLReader)
		if !ok {
			continue
		}
		id, err := r.FromURL(ctx, rawURL)
		if err != nil {
			return model.Bookmark{}, err
		}
		if id == "" {
			continue
		}
		key := model.MakeKey(p.ID(), id)
		if b, ok := a.st.Bookmark(key); ok {
			return b, nil
		}
		d, err := p.Gallery(ctx, id)
		if err != nil {
			return model.Bookmark{}, err
		}
		return a.AddBookmark(d.GallerySummary), nil
	}
	return model.Bookmark{}, apperr.New("bookmark.unknownURL", "no site knows this URL: "+rawURL)
}

func (a *App) Gallery(key string) (*model.GalleryDetail, error) {
	// if a cbz that should be downloaded was deleted outside the app, reset it to unsaved before opening
	if b, ok := a.st.Bookmark(key); ok && b.Download.Status == model.DownloadDone && !model.IsFileKey(key) {
		a.resetMissing([]string{key})
	}
	return a.lib.Detail(a.ctx, key)
}

func (a *App) Suggest(siteID, term string) ([]model.Suggestion, error) {
	p, err := browseSite(siteID)
	if err != nil {
		return nil, err
	}
	return p.Suggest(a.ctx, term)
}

// CancelViewerLoads is called when a gallery page is closed. It drops the remaining viewer fetches
// (prefetches) for that gallery so they do not slow down loading the next one.
func (a *App) CancelViewerLoads(key string) {
	if n := a.img.CancelGallery(key); n > 0 {
		log.Printf("[viewer] %s: canceled %d pending loads", key, n)
	}
	// with "Delete when the viewer closes", delete the pages saved while viewing (after waiting a little for saves to finish)
	if a.st.Settings().TempFiles == store.TempFilesViewerClose {
		time.AfterFunc(2*time.Second, func() {
			if a.isViewCache(key) {
				a.lib.DeleteWork(key)
			}
		})
	}
}

func init() { log.SetFlags(log.Ltime) }
