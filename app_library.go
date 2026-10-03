package main

import (
	"encoding/base64"
	"log"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"poruneko/internal/apperr"
	"poruneko/internal/library"
	"poruneko/internal/model"
	"poruneko/internal/store"
)

// The local library: the cbz / zip files in the library folder become works ("file:<relative path>").
// They are scanned at startup, when the library folder changes and on request. The files are only read.

// ScanLibrary registers the archives in the library folder that are not works yet and marks works whose file is gone
// (they come back by themselves when the file returns). Archives the user removed from the library are skipped.
// Returns the number of works added
func (a *App) ScanLibrary() int {
	a.scanMu.Lock()
	defer a.scanMu.Unlock()
	start := time.Now()
	found := a.lib.FindArchives()
	foundSet := map[string]bool{}
	for _, rel := range found {
		foundSet[strings.ToLower(rel)] = true
	}
	// archives already shown as works: the user's own ones and the cbz files the app saved for other works
	known := map[string]bool{}
	for _, b := range a.st.Bookmarks() {
		if b.ArchiveFile != "" {
			known[strings.ToLower(b.ArchiveFile)] = true
		}
	}
	ignored := map[string]bool{}
	for _, rel := range a.st.Settings().LibraryIgnored {
		ignored[strings.ToLower(rel)] = true
	}

	added := 0
	addedKeys := map[string]bool{}
	for _, rel := range found {
		lower := strings.ToLower(rel)
		if known[lower] || ignored[lower] {
			continue
		}
		d, err := a.lib.ArchiveDetail(rel)
		if err != nil {
			log.Printf("[library] %s: %v", rel, err)
			continue
		}
		if len(d.Pages) == 0 {
			continue // not a comic (no images)
		}
		n := len(d.Pages)
		a.st.Put(model.Bookmark{
			Key:         d.Key,
			AddedAt:     a.lib.ArchiveModTime(rel),
			Summary:     d.GallerySummary,
			Creator:     archiveCreator(&d.GallerySummary),
			Download:    model.DownloadState{Status: model.DownloadDone, Done: n, Total: n},
			ArchiveFile: rel,
		})
		added++
		addedKeys[d.Key] = true
	}

	a.folderSeries(addedKeys)

	// works whose file is gone leave the library. When the whole folder cannot be read (a drive that is not
	// connected), they are only marked and recover when it is back
	changed := added > 0
	var gone []string
	for _, b := range a.st.Bookmarks() {
		if !model.IsFileKey(b.Key) {
			continue
		}
		present := foundSet[strings.ToLower(b.ArchiveFile)]
		missing := b.Download.Status == model.DownloadError && b.Download.ErrorCode == "library.missing"
		switch {
		case !present && a.lib.RootAvailable(b.ArchiveFile):
			gone = append(gone, b.Key)
		case !present && !missing:
			a.lib.ForgetFileDetail(b.Key)
			a.st.Update(b.Key, func(x *model.Bookmark) {
				x.Download.Fail(apperr.New("library.missing", "the file is not in the library folder"))
			})
			changed = true
		case present && missing:
			a.st.Update(b.Key, func(x *model.Bookmark) {
				x.Download = model.DownloadState{Status: model.DownloadDone, Done: x.Summary.PageCount, Total: x.Summary.PageCount}
			})
			changed = true
		}
	}
	if len(gone) > 0 {
		a.dropFileWorks(gone, false)
		changed = true
	}
	if changed {
		a.notifyBookmarks()
	}
	log.Printf("[library] scanned %d archives in %s: %d added, %d gone", len(found), time.Since(start).Round(time.Millisecond), added, len(gone))
	return added
}

// folderSeries makes each subfolder of the library folders a series: its works in file name order, named after the
// folder. A folder becomes a series once it holds two works that are in no series; after that, works added to the
// folder (added: the works this scan added) join its series. Deleting the series stops this for the folder.
// The top of the save location and of each local folder is not a series
func (a *App) folderSeries(added map[string]bool) {
	off := map[string]bool{}
	for _, f := range a.st.Settings().FolderSeriesOff {
		off[strings.ToLower(f)] = true
	}
	existing := map[string]model.Series{}
	for _, s := range a.st.SeriesList() {
		if s.Folder != "" {
			existing[strings.ToLower(s.Folder)] = s
		}
	}
	// works in no series, by folder
	groups := map[string][]model.Bookmark{}
	var folders []string
	for _, b := range a.st.Bookmarks() {
		if !model.IsFileKey(b.Key) || b.ArchiveFile == "" {
			continue
		}
		folder := path.Dir(b.ArchiveFile)
		if _, ok := library.LocalDirOf(b.ArchiveFile); folder == "." || (ok && !strings.Contains(folder, "/")) {
			continue
		}
		if _, _, in := a.st.SeriesOf(b.Key); in {
			continue
		}
		if groups[folder] == nil {
			folders = append(folders, folder)
		}
		groups[folder] = append(groups[folder], b)
	}
	slices.Sort(folders)
	for _, folder := range folders {
		if off[strings.ToLower(folder)] {
			continue
		}
		list := groups[folder]
		slices.SortFunc(list, func(x, y model.Bookmark) int {
			return library.NaturalCompare(path.Base(x.ArchiveFile), path.Base(y.ArchiveFile))
		})
		var keys []string
		s, ok := existing[strings.ToLower(folder)]
		for _, b := range list {
			if !ok || added[b.Key] {
				keys = append(keys, b.Key)
			}
		}
		if !ok {
			if len(keys) < 2 {
				continue
			}
			s = a.st.CreateSeries(path.Base(folder))
		}
		if _, err := a.updateSeries(s.ID, func(x *model.Series) {
			x.Folder = folder
			x.Keys = append(x.Keys, keys...)
		}); err != nil {
			log.Printf("[library] series of %s: %v", folder, err)
		}
	}
}

// archiveCreator is the creator info of a user's archive: what its metadata says, without looking anything up
// (a large library would send many searches; the user can look a work up from its creator info)
func archiveCreator(s *model.GallerySummary) model.CreatorInfo {
	info := model.CreatorInfo{Status: model.CreatorNotFound, Source: "site", Artists: slices.Clone(s.Artists), ResolvedAt: time.Now().UnixMilli()}
	if len(s.Groups) > 0 {
		info.Circle = s.Groups[0]
	}
	if info.Artists == nil {
		info.Artists = []string{}
	}
	if info.Circle != "" || len(info.Artists) > 0 {
		info.Status = model.CreatorMatched
	}
	return info
}

// forgetArchive keeps an archive the user removed from the library from coming back at the next scan
func (a *App) forgetArchive(key string) {
	b, ok := a.st.Bookmark(key)
	if !ok || b.ArchiveFile == "" {
		return
	}
	s := a.st.Settings()
	if !slices.Contains(s.LibraryIgnored, b.ArchiveFile) {
		s.LibraryIgnored = append(s.LibraryIgnored, b.ArchiveFile)
		a.st.SetSettings(s)
	}
	a.lib.ForgetFileDetail(key)
}

// RemoveFromLibrary takes a work in the library folder out of the app (bookmark, tags and series included).
// The file stays on disk and does not come back at the next scan
func (a *App) RemoveFromLibrary(key string) error {
	if !model.IsFileKey(key) {
		return apperr.New("library.notLocal", "not a work in the library folder")
	}
	if !a.st.Has(key) {
		return nil
	}
	a.dropFileWorks([]string{key}, true)
	a.notifyBookmarks()
	return nil
}

// dropFileWorks takes works in the library folders out of the app (records, tags, thumbnails and series places).
// A series left with no works is deleted (a folder series comes back if its files do). With forget, the archives
// do not come back at the next scan
func (a *App) dropFileWorks(keys []string, forget bool) {
	var affected []string
	emptied := map[string]bool{}
	for _, key := range keys {
		if x, _, ok := a.st.SeriesOf(key); ok {
			affected = append(affected, x.Keys...)
			emptied[x.ID] = true
		}
		if forget {
			a.forgetArchive(key)
		}
		a.lib.ForgetFileDetail(key)
		a.lib.DeleteWork(key)
		a.lib.DeleteCustomThumb(key)
		a.st.Remove(key)
	}
	for id := range emptied {
		if x, ok := a.st.GetSeries(id); ok && len(x.Keys) == 0 {
			a.st.DeleteSeries(id)
		}
	}
	// leaving a series changes the numbers of the remaining works
	affected = slices.DeleteFunc(affected, func(k string) bool { return slices.Contains(keys, k) })
	if len(emptied) > 0 {
		a.seriesChanged(affected)
	}
}

// AddLocalDir opens a dialog to choose another folder for the Local tab, adds it and scans
// ("" if cancelled). A folder overlapping the save location or another local folder is refused
func (a *App) AddLocalDir(title string) (string, error) {
	cur := a.st.Settings()
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: title})
	if err != nil || dir == "" {
		return "", err
	}
	dir = filepath.Clean(dir)
	// the save locations hold the site plugins' downloads, which are not local works
	saves := []string{cur.LibraryDir}
	for _, d := range cur.SiteDirs {
		saves = append(saves, d)
	}
	for _, d := range saves {
		if overlaps(dir, d) {
			return "", apperr.New("library.dirOverlapsSave", "the folder overlaps a save location", "path", d)
		}
	}
	id := 1
	for _, d := range cur.LocalDirs {
		if overlaps(dir, d.Path) {
			return "", apperr.New("library.dirOverlaps", "the folder overlaps a folder already listed", "path", d.Path)
		}
		id = max(id, d.ID+1)
	}
	cur.LocalDirs = append(slices.Clone(cur.LocalDirs), model.LocalDir{ID: id, Path: dir, Name: filepath.Base(dir), Icon: "folder"})
	a.st.SetSettings(cur)
	go a.ScanLibrary()
	return dir, nil
}

// SetLocalDir changes the name and icon of a local folder's tab
func (a *App) SetLocalDir(id int, name, icon string) error {
	cur := a.st.Settings()
	dirs := slices.Clone(cur.LocalDirs)
	i := slices.IndexFunc(dirs, func(d model.LocalDir) bool { return d.ID == id })
	if i < 0 {
		return apperr.New("library.noDir", "the folder is not in the list")
	}
	if name = strings.TrimSpace(name); name == "" {
		name = filepath.Base(dirs[i].Path)
	}
	dirs[i].Name, dirs[i].Icon = name, icon
	cur.LocalDirs = dirs
	a.st.SetSettings(cur)
	return nil
}

// MoveLocalDir moves a local folder's tab up (-1) or down (1)
func (a *App) MoveLocalDir(id, dir int) {
	cur := a.st.Settings()
	dirs := slices.Clone(cur.LocalDirs)
	i := slices.IndexFunc(dirs, func(d model.LocalDir) bool { return d.ID == id })
	if j := i + dir; i >= 0 && j >= 0 && j < len(dirs) {
		dirs[i], dirs[j] = dirs[j], dirs[i]
		cur.LocalDirs = dirs
		a.st.SetSettings(cur)
	}
}

// IconFile is an image in the icons folder, for the tabs of the local folders
type IconFile struct {
	Name string `json:"name"`
	URL  string `json:"url"` // data URL
}

// iconsDir is where the user puts images for the tab icons
func iconsDir() string { return filepath.Join(store.DataDir(), "icons") }

var iconTypes = map[string]string{
	".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
	".gif": "image/gif", ".ico": "image/x-icon", ".bmp": "image/bmp",
}

// LocalIcons returns the images in the icons folder (up to 1 MB each)
func (a *App) LocalIcons() []IconFile {
	out := []IconFile{}
	entries, _ := os.ReadDir(iconsDir())
	for _, e := range entries {
		mime := iconTypes[strings.ToLower(filepath.Ext(e.Name()))]
		if e.IsDir() || mime == "" {
			continue
		}
		if fi, err := e.Info(); err != nil || fi.Size() > 1<<20 {
			continue
		}
		b, err := os.ReadFile(filepath.Join(iconsDir(), e.Name()))
		if err != nil {
			continue
		}
		out = append(out, IconFile{Name: e.Name(), URL: "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b)})
	}
	return out
}

// OpenIconsFolder opens the icons folder (made if missing) in the file manager
func (a *App) OpenIconsFolder() error {
	if err := os.MkdirAll(iconsDir(), 0o755); err != nil {
		return err
	}
	return revealInExplorer(iconsDir(), false)
}

// RemoveLocalDir takes a folder out of the Local tab with its works (their tags and series too; the files stay)
func (a *App) RemoveLocalDir(id int) {
	cur := a.st.Settings()
	cur.LocalDirs = slices.DeleteFunc(slices.Clone(cur.LocalDirs), func(d model.LocalDir) bool { return d.ID == id })
	// the removed archives of the folder are forgotten too (its works would not come back with the same id)
	inDir := func(rel string) bool {
		d, ok := library.LocalDirOf(rel)
		return ok && d == id
	}
	cur.LibraryIgnored = slices.DeleteFunc(slices.Clone(cur.LibraryIgnored), inDir)
	cur.FolderSeriesOff = slices.DeleteFunc(slices.Clone(cur.FolderSeriesOff), inDir)
	a.st.SetSettings(cur)
	for _, s := range a.st.SeriesList() {
		if s.Folder != "" && inDir(s.Folder+"/") {
			a.st.DeleteSeries(s.ID)
		}
	}
	a.seriesChanged(nil)
	var keys []string
	for _, b := range a.st.Bookmarks() {
		if model.IsFileKey(b.Key) && inDir(b.ArchiveFile) {
			keys = append(keys, b.Key)
		}
	}
	if len(keys) > 0 {
		a.dropFileWorks(keys, false)
		a.notifyBookmarks()
	}
}

// overlaps reports whether one folder is the other or inside it
func overlaps(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	a, b = strings.ToLower(filepath.Clean(a)), strings.ToLower(filepath.Clean(b))
	sep := string(filepath.Separator)
	return a == b || strings.HasPrefix(a, strings.TrimSuffix(b, sep)+sep) || strings.HasPrefix(b, strings.TrimSuffix(a, sep)+sep)
}

// RestoreIgnoredArchives lets the archives removed from the library come back, and scans
func (a *App) RestoreIgnoredArchives() int {
	s := a.st.Settings()
	s.LibraryIgnored = nil
	a.st.SetSettings(s)
	return a.ScanLibrary()
}
