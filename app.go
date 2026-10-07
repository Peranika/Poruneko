package main

import (
	"context"
	"log"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode"

	"poruneko/internal/apperr"
	"poruneko/internal/imgserver"
	"poruneko/internal/library"
	"poruneko/internal/meta"
	"poruneko/internal/model"
	"poruneko/internal/remote"
	"poruneko/internal/store"
	"poruneko/internal/update"
	"poruneko/internal/webapi"
)

// App is the API exposed to the frontend
type App struct {
	ctx       context.Context
	sh        shell // the window around the app
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

	// remote access from browsers on other devices (app_remote.go; the desktop only)
	remote    *remote.Server
	remoteAPI *webapi.Server
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
	if a.remote != nil {
		_ = a.remote.Start()
	}
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
	if a.remote != nil {
		a.remote.Stop()
		a.remoteAPI.Close()
	}
	a.lib.Close()
	a.st.Flush()
}

func (a *App) notifyBookmarks() { a.sh.emit("bookmarks:changed", nil) }

// emitProgress reports download progress (including page range cbz builds) to the frontend
func (a *App) emitProgress(key string, s model.DownloadState) {
	a.sh.emit("download:progress", model.DownloadProgress{Key: key, State: s})
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

func (a *App) Gallery(key string) (*model.GalleryDetail, error) {
	// if a cbz that should be downloaded was deleted outside the app, reset it to unsaved before opening
	if b, ok := a.st.Bookmark(key); ok && b.Download.Status == model.DownloadDone && !model.IsFileKey(key) {
		a.resetMissing([]string{key})
	}
	return a.lib.Detail(a.ctx, key)
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
