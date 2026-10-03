package main

import (
	"log"
	"path"
	"slices"
	"strings"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/library"
	"poruneko/internal/model"
)

// The local library: the archives in the local folders become works ("file:@<folder id>/<relative path>").
// They are scanned at startup, when a folder is added and on request. The files are only read.

// ScanLibrary registers the archives in the local folders that are not works yet and drops works whose file is gone
// (only marked while their whole folder cannot be read). Archives the user removed from the library are skipped.
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
				x.Download.Fail(apperr.New("library.missing", "the folder of the file cannot be read"))
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

// folderSeries makes each subfolder of the local folders a series: its works in file name order, named after the
// folder. A folder becomes a series once it holds two works that are in no series; after that, works added to the
// folder (added: the works this scan added) join its series. Deleting the series stops this for the folder.
// The top of each local folder is not a series
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

// RemoveFromLibrary takes a work in a local folder out of the app (bookmark, tags and series included).
// The file stays on disk and does not come back at the next scan
func (a *App) RemoveFromLibrary(key string) error {
	if !model.IsFileKey(key) {
		return apperr.New("library.notLocal", "not a work in a local folder")
	}
	if !a.st.Has(key) {
		return nil
	}
	a.dropFileWorks([]string{key}, true)
	a.notifyBookmarks()
	return nil
}

// dropFileWorks takes works in the local folders out of the app (records, tags, thumbnails and series places).
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

// RestoreIgnoredArchives lets the archives removed from the library come back, and scans
func (a *App) RestoreIgnoredArchives() int {
	s := a.st.Settings()
	s.LibraryIgnored = nil
	a.st.SetSettings(s)
	return a.ScanLibrary()
}
