package main

import (
	"log"
	"slices"
	"strings"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/model"
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
	}

	// works whose file is gone are marked; they recover when the file is back at the same place
	changed := added > 0
	for _, b := range a.st.Bookmarks() {
		if !model.IsFileKey(b.Key) {
			continue
		}
		present := foundSet[strings.ToLower(b.ArchiveFile)]
		missing := b.Download.Status == model.DownloadError && b.Download.ErrorCode == "library.missing"
		switch {
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
	if changed {
		a.notifyBookmarks()
	}
	log.Printf("[library] scanned %d archives in %s: %d added", len(found), time.Since(start).Round(time.Millisecond), added)
	return added
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

// RestoreIgnoredArchives lets the archives removed from the library come back, and scans
func (a *App) RestoreIgnoredArchives() int {
	s := a.st.Settings()
	s.LibraryIgnored = nil
	a.st.SetSettings(s)
	return a.ScanLibrary()
}
