package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"slices"
	"strings"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/library"
	"poruneko/internal/meta"
	"poruneko/internal/model"
	"poruneko/internal/store"
)

// API for bookmarks, creator info and downloads

func (a *App) Bookmarks() []model.Bookmark { return a.st.Bookmarks() }

func errNotBookmarked() error { return apperr.New("bookmark.notBookmarked", "not bookmarked") }

// updateBookmark changes a bookmark and notifies the frontend (an error if it is not bookmarked)
func (a *App) updateBookmark(key string, fn func(b *model.Bookmark)) (model.Bookmark, error) {
	b, ok := a.st.Update(key, fn)
	if !ok {
		return b, errNotBookmarked()
	}
	a.notifyBookmarks()
	return b, nil
}

// notDownloaded is the download state of a work with nothing saved
func notDownloaded(b *model.Bookmark) model.DownloadState {
	return model.DownloadState{Status: model.DownloadNone, Total: b.Summary.PageCount}
}

// resetDownload makes a work one with nothing saved (what was chosen of its attachments goes too: its pages are the
// site's again)
func resetDownload(b *model.Bookmark) {
	b.Download = notDownloaded(b)
	b.DownloadChoice = nil
}

// Works in the local folders have records like bookmarks (for their tags, series and creator info) but are not
// bookmarks: they are listed in their folder's tab only and cannot be bookmarked

func (a *App) IsBookmarked(key string) bool { return a.st.Has(key) && !model.IsFileKey(key) }

func (a *App) AddBookmark(s model.GallerySummary) model.Bookmark {
	if b, ok := a.st.Bookmark(s.Key); ok || model.IsFileKey(s.Key) {
		return b
	}
	b := model.Bookmark{
		Key:      s.Key,
		AddedAt:  time.Now().UnixMilli(),
		Summary:  s,
		Creator:  model.CreatorInfo{Status: model.CreatorPending, Artists: []string{}},
		Download: model.DownloadState{Status: model.DownloadNone, Total: s.PageCount},
	}
	a.st.Put(b)
	a.notifyBookmarks()
	go a.resolve(b.Key)
	if a.st.Settings().AutoDownload {
		a.dl.Enqueue(b.Key)
	}
	return b
}

func (a *App) RemoveBookmark(key string) error {
	if !a.st.Has(key) || model.IsFileKey(key) {
		return nil
	}
	a.dl.Pause(key)
	defer a.notifyBookmarks()
	// leaving its series changes the numbers of the remaining works
	if x, _, ok := a.st.SeriesOf(key); ok {
		defer a.seriesChanged(slices.DeleteFunc(x.Keys, func(k string) bool { return k == key }))
	}
	// a local work made from a page range exists only as its cbz, so delete it with the bookmark
	if model.IsLocalKey(key) || a.st.Settings().DeleteFilesOnUnbookmark {
		err := a.lib.DeleteAll(key)
		a.st.Remove(key)
		return err
	}
	// the cbz is kept or not per the settings, but in-progress pages (.parts) and a chosen thumbnail are useless afterwards, so delete them
	a.lib.DeleteWork(key)
	a.lib.DeleteCustomThumb(key)
	a.st.Remove(key)
	return nil
}

// BookmarkRange cuts out the given page range of a gallery and bookmarks it as a local work.
// The user gives the creator, circle and title. The cbz is built in the background and progress is reported like downloads.
// If req.Download is false no cbz is made and the source gallery's pages are shown (StartDownload can make it later).
func (a *App) BookmarkRange(req model.RangeRequest) (model.Bookmark, error) {
	src, err := a.lib.Detail(a.ctx, req.SourceKey)
	if err != nil {
		return model.Bookmark{}, err
	}
	if req.From > req.To {
		req.From, req.To = req.To, req.From
	}
	if req.From < 1 || req.To > len(src.Pages) {
		return model.Bookmark{}, apperr.New("range.invalid", fmt.Sprintf("invalid page range (1-%d)", len(src.Pages)), "max", len(src.Pages))
	}
	req.Artists = slices.DeleteFunc(req.Artists, func(s string) bool { return strings.TrimSpace(s) == "" })
	if len(req.Artists) == 0 {
		return model.Bookmark{}, apperr.New("range.noArtist", "artist name is required")
	}
	req.Title, req.Circle = strings.TrimSpace(req.Title), strings.TrimSpace(req.Circle)
	if req.Title == "" {
		return model.Bookmark{}, apperr.New("range.noTitle", "title is required")
	}

	dst := library.RangeDetail(src, req)
	if a.st.Has(dst.Key) {
		return model.Bookmark{}, apperr.New("range.duplicate", "the same page range is already bookmarked")
	}
	status := model.DownloadNone
	if req.Download {
		status = model.DownloadDownloading
	}
	b := model.Bookmark{
		Key:      dst.Key,
		AddedAt:  time.Now().UnixMilli(),
		Summary:  dst.GallerySummary,
		Creator:  model.CreatorInfo{Status: model.CreatorManual, Circle: req.Circle, Artists: req.Artists, Source: "local", ResolvedAt: time.Now().UnixMilli()},
		Download: model.DownloadState{Status: status, Total: len(dst.Pages)},
	}
	a.st.Put(b)
	a.notifyBookmarks()

	if req.Download {
		a.startRangeBuild(src, dst)
	}
	return b, nil
}

// startRangeBuild builds a page range cbz in the background (fetched pages are skipped, so it can resume)
func (a *App) startRangeBuild(src, dst *model.GalleryDetail) {
	if !a.mark(a.building, dst.Key, true) {
		return
	}
	setState := func(fn func(s *model.DownloadState)) {
		if nb, ok := a.st.Update(dst.Key, func(x *model.Bookmark) { fn(&x.Download) }); ok {
			a.emitProgress(dst.Key, nb.Download)
		}
	}
	setState(func(s *model.DownloadState) {
		s.Status, s.Total = model.DownloadDownloading, len(dst.Pages)
		s.ClearError()
	})
	go func() {
		defer a.mark(a.building, dst.Key, false)
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		defer cancel()
		err := a.lib.BuildRange(ctx, src, dst, func(done, total int) {
			setState(func(s *model.DownloadState) { s.Done = done })
		})
		if err != nil {
			log.Printf("[range] %s: %v", dst.Key, err)
			setState(func(s *model.DownloadState) { s.Fail(err) })
			return
		}
		setState(func(s *model.DownloadState) {
			s.Status, s.Done = model.DownloadDone, len(dst.Pages)
			s.ClearError()
		})
		a.notifyBookmarks()
	}()
}

// retryRange builds the cbz of a page range bookmark (resuming one stopped by an error or interruption)
func (a *App) retryRange(key string) error {
	b, ok := a.st.Bookmark(key)
	if !ok || b.Summary.Origin == nil {
		return apperr.New("range.noOrigin", "page range information is missing")
	}
	if b.Download.Status == model.DownloadDone && a.lib.ArchivePath(key) != "" {
		return nil
	}
	o := b.Summary.Origin
	src, err := a.lib.Detail(a.ctx, o.Key)
	if err != nil {
		return apperr.Wrap(err, "range.sourceUnavailable", "cannot load the source gallery")
	}
	dst := library.RangeDetail(src, model.RangeRequest{
		SourceKey: o.Key, From: o.From, To: o.To, Title: b.Summary.DisplayTitle(), Artists: b.Creator.Artists, Circle: b.Creator.Circle,
		SiteArtists: b.Summary.Artists, SiteGroups: b.Summary.Groups,
	})
	dst.Origin.Tags = o.Tags // keep older ones (which contain the creator name) as they are
	a.startRangeBuild(src, dst)
	return nil
}

// SetRangeTags sets the artists and groups of a page range bookmark as written on the source site.
// Used by Favorites and the like (separate from the creator display name). Also written to the info in the cbz.
func (a *App) SetRangeTags(key string, artists, groups []string) (model.Bookmark, error) {
	if !model.IsLocalKey(key) {
		return model.Bookmark{}, apperr.New("range.notRange", "not a page range bookmark")
	}
	clean := func(ss []string) []string {
		out := []string{}
		for _, s := range ss {
			s = strings.ToLower(strings.TrimSpace(s))
			if s != "" && !slices.Contains(out, s) {
				out = append(out, s)
			}
		}
		return out
	}
	artists, groups = clean(artists), clean(groups)
	b, err := a.updateBookmark(key, func(b *model.Bookmark) {
		b.Summary.Artists, b.Summary.Groups = artists, groups
		if b.Summary.Origin != nil {
			b.Summary.Origin.Tags = true
		}
	})
	if err != nil {
		return b, err
	}
	if err := a.lib.UpdateInfo(key, func(d *model.GalleryDetail) {
		d.Artists, d.Groups = artists, groups
		if d.Origin != nil {
			d.Origin.Tags = true
		}
	}); err != nil {
		log.Printf("[range] %s: update info: %v", key, err)
	}
	return b, nil
}

// lookupCreator reports whether to look up the creator on DLsite / FANZA: only for Japanese works, and works without
// a language (mostly CG sets). For translated works the site's romanized names are the familiar ones, so they are used as they are.
func lookupCreator(s *model.GallerySummary) bool {
	return s.Language == "japanese" || s.Language == ""
}

// resolve fetches creator info from DLsite / FANZA (or takes the work's own for non-Japanese works) and applies it to the bookmark
func (a *App) resolve(key string) {
	if model.IsLocalKey(key) {
		return // local works use the creator info entered when they were made
	}
	if !a.mark(a.resolving, key, true) {
		return
	}
	defer a.mark(a.resolving, key, false)

	b, ok := a.st.Bookmark(key)
	if !ok {
		return
	}
	var info model.CreatorInfo
	if tc := b.Summary.TitleCreators; tc != nil && (tc.Circle != "" || len(tc.Artists) > 0) {
		// the title names them (a site that writes "[Circle (Artist)] Title")
		info = meta.FromTitle(&b.Summary)
	} else if pluginInfoOf(b.Summary.Site).Creators.FromSite || !lookupCreator(&b.Summary) {
		info = meta.FromSite(&b.Summary)
	} else {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		set := a.st.Settings()
		info = meta.Resolve(ctx, &b.Summary, set.MetaSources, set.FallbackSources)
	}
	a.st.Update(key, func(x *model.Bookmark) {
		// do not overwrite if it was set manually while resolving
		if x.Creator.Status != model.CreatorManual {
			x.Creator = info
		}
	})
	a.notifyBookmarks()
	a.refreshArchiveMeta(key)
}

// refreshArchiveMeta updates ComicInfo.xml of a work with a built cbz to the latest creator info
func (a *App) refreshArchiveMeta(key string) {
	if err := a.lib.RefreshMeta(key); err != nil {
		log.Printf("[library] refresh meta %s: %v", key, err)
	}
}

func (a *App) ResolveCreator(key string) (model.Bookmark, error) {
	if model.IsLocalKey(key) {
		return model.Bookmark{}, apperr.New("creator.autoNotForRange", "creator info cannot be resolved automatically for page range bookmarks")
	}
	if _, err := a.updateBookmark(key, func(b *model.Bookmark) { b.Creator.Status = model.CreatorPending }); err != nil {
		return model.Bookmark{}, err
	}
	a.resolve(key)
	b, _ := a.st.Bookmark(key)
	return b, nil
}

// CandidateFromURL reads creator info from a product page the user found (DLsite / FANZA Doujin only)
func (a *App) CandidateFromURL(rawURL string) (model.CreatorCandidate, error) {
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	return meta.CandidateFromURL(ctx, rawURL)
}

// UnlinkCreatorSource removes the link to the product page that creator info came from, keeping the names
// (when the linked page was the wrong work). The info counts as set manually afterwards.
func (a *App) UnlinkCreatorSource(key string) (model.Bookmark, error) {
	b, err := a.updateBookmark(key, func(b *model.Bookmark) {
		c := &b.Creator
		c.Status, c.Source = model.CreatorManual, "manual"
		c.ProductID, c.ProductTitle, c.URL, c.Score = "", "", "", 0
	})
	if err == nil {
		go a.refreshArchiveMeta(key)
	}
	return b, err
}

func (a *App) SearchCreatorCandidates(term string) []model.CreatorCandidate {
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	set := a.st.Settings()
	return meta.SearchCandidates(ctx, term, append(slices.Clone(set.MetaSources), set.FallbackSources...))
}

// cleanTags trims spaces around tags and merges duplicates that differ only in case
func cleanTags(tags []string) []string {
	clean := []string{}
	for _, t := range tags {
		t = strings.Join(strings.Fields(t), " ")
		if t != "" && !slices.ContainsFunc(clean, func(c string) bool { return strings.EqualFold(c, t) }) {
			clean = append(clean, t)
		}
	}
	return clean
}

// UpdateTags adds the add tags to and removes the remove tags from several bookmarks (e.g. tagging a whole series)
func (a *App) UpdateTags(keys, add, remove []string) {
	add, remove = cleanTags(add), cleanTags(remove)
	for _, k := range keys {
		a.st.Update(k, func(b *model.Bookmark) {
			tags := slices.DeleteFunc(slices.Clone(b.Tags), func(t string) bool {
				return slices.ContainsFunc(remove, func(r string) bool { return strings.EqualFold(r, t) })
			})
			b.Tags = cleanTags(append(tags, add...))
		})
	}
	a.notifyBookmarks()
}

// RenameTag renames a tag (replacing it on every bookmark that has it, merging if the new name is already there).
// Returns the number of bookmarks changed
func (a *App) RenameTag(from, to string) (int, error) {
	to = strings.Join(strings.Fields(to), " ")
	if to == "" {
		return 0, apperr.New("tags.noName", "tag name is required")
	}
	n := 0
	for _, b := range a.st.Bookmarks() {
		if !slices.Contains(b.Tags, from) {
			continue
		}
		a.st.Update(b.Key, func(x *model.Bookmark) {
			tags := slices.Clone(x.Tags)
			tags[slices.Index(tags, from)] = to
			x.Tags = cleanTags(tags)
		})
		n++
	}
	if n > 0 {
		a.notifyBookmarks()
	}
	return n, nil
}

// SetCustomThumb sets a bookmark's thumbnail to an image made from the page and area the user chose.
// The frontend crops the image (WebP) and passes it as base64 (it can decode AVIF and the like)
func (a *App) SetCustomThumb(key string, spec model.ThumbSpec, imageBase64 string) (model.Bookmark, error) {
	if !a.st.Has(key) {
		return model.Bookmark{}, errNotBookmarked()
	}
	data, err := base64.StdEncoding.DecodeString(imageBase64)
	if err != nil || len(data) == 0 {
		return model.Bookmark{}, apperr.New("thumb.invalidImage", "invalid thumbnail image")
	}
	if err := a.lib.SaveCustomThumb(key, data); err != nil {
		return model.Bookmark{}, apperr.Wrap(err, "thumb.saveFailed", "failed to save the thumbnail")
	}
	spec.UpdatedAt = time.Now().UnixMilli()
	return a.updateBookmark(key, func(b *model.Bookmark) { b.CustomThumb = &spec })
}

// ClearCustomThumb resets the thumbnail to the gallery cover
func (a *App) ClearCustomThumb(key string) (model.Bookmark, error) {
	a.lib.DeleteCustomThumb(key)
	return a.updateBookmark(key, func(b *model.Bookmark) { b.CustomThumb = nil })
}

// SetBookmarkTitle gives a bookmark the user's own title ("" or the work's own title goes back to it).
// The cbz is renamed and its ComicInfo.xml updated when the file name format uses the title.
func (a *App) SetBookmarkTitle(key, title string) (model.Bookmark, error) {
	title = strings.Join(strings.Fields(title), " ")
	b, err := a.updateBookmark(key, func(b *model.Bookmark) {
		if title == b.Summary.DisplayTitle() {
			title = ""
		}
		b.CustomTitle = title
	})
	if err == nil {
		go a.refreshArchiveMeta(key)
	}
	return b, err
}

// SetBookmarkTags sets the user's tags on a bookmark (replacing them with tags)
func (a *App) SetBookmarkTags(key string, tags []string) (model.Bookmark, error) {
	clean := cleanTags(tags)
	return a.updateBookmark(key, func(b *model.Bookmark) { b.Tags = clean })
}

// SetCreator sets the creator and circle manually. Passing candidate also records its work info.
func (a *App) SetCreator(key string, circle string, artists []string, candidate *model.CreatorCandidate) (model.Bookmark, error) {
	if artists == nil {
		artists = []string{}
	}
	b, err := a.updateBookmark(key, func(b *model.Bookmark) {
		c := b.Creator
		c.Status, c.Circle, c.Artists, c.Source = model.CreatorManual, circle, artists, "manual"
		c.ResolvedAt = time.Now().UnixMilli()
		if candidate != nil {
			c.Source, c.ProductID, c.ProductTitle, c.URL, c.Score =
				candidate.Source, candidate.ProductID, candidate.ProductTitle, candidate.URL, candidate.Score
		}
		b.Creator = c
	})
	if err != nil {
		return b, err
	}
	go a.refreshArchiveMeta(key)
	return b, nil
}

// ---------------------------------------------------------------- History

// History returns the works opened in the viewer, newest first
func (a *App) History() []model.HistoryEntry { return a.st.History() }

// AddHistory records that a work was opened in the viewer (origin: browse / favorites / bookmarks, "" to keep the one recorded)
func (a *App) AddHistory(s model.GallerySummary, origin string) { a.st.AddHistory(s, origin) }

// RemoveHistory removes a work from the history
func (a *App) RemoveHistory(key string) { a.st.RemoveHistory(key) }

// ClearHistory removes the whole history
func (a *App) ClearHistory() { a.st.ClearHistory() }

// ---------------------------------------------------------------- Downloads

// StartDownload starts a download (page range bookmarks resume their build)
func (a *App) StartDownload(key string) error {
	if model.IsFileKey(key) {
		return nil // the user's own archive is already on disk
	}
	if model.IsLocalKey(key) {
		return a.retryRange(key)
	}
	a.dl.Enqueue(key)
	return nil
}

// DownloadOptions is what can be chosen to download of a work: its pages, and the archives among its attachments
// (their images and videos are added after the pages)
type DownloadOptions struct {
	Pages       int                `json:"pages"`
	Attachments []model.Attachment `json:"attachments"`
}

// DownloadOptions lists what of a work can be downloaded (no attachments: only its pages, nothing to choose)
func (a *App) DownloadOptions(key string) (DownloadOptions, error) {
	d, err := a.lib.Detail(a.ctx, key)
	if err != nil {
		return DownloadOptions{}, err
	}
	o := DownloadOptions{Pages: len(d.Pages), Attachments: []model.Attachment{}}
	// a saved work's pages include those of the attachments it was downloaded with: count the post's own files
	if b, ok := a.st.Bookmark(key); ok && b.DownloadChoice != nil && b.DownloadChoice.Planned {
		if b.DownloadChoice.Pages {
			o.Pages = b.DownloadChoice.SitePages
		} else if n, err := a.sitePageCount(key); err == nil {
			o.Pages = n // none of them were kept: only the site knows
		} else {
			return DownloadOptions{}, err
		}
	}
	for _, at := range d.Attachments {
		if library.CanOpenArchive(at.Name) {
			o.Attachments = append(o.Attachments, at)
		}
	}
	return o, nil
}

// sitePageCount is how many pages a work has on its site
func (a *App) sitePageCount(key string) (int, error) {
	p, id, err := workSite(key)
	if err != nil {
		return 0, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	d, err := p.Gallery(ctx, id)
	if err != nil {
		return 0, err
	}
	return len(d.Pages), nil
}

// StartDownloadWith starts a download of what was chosen: the work's pages (pages) and archives among its
// attachments (by Attachment.Index)
func (a *App) StartDownloadWith(key string, pages bool, attachments []int) error {
	c, err := downloadChoice(pages, attachments)
	if err != nil {
		return err
	}
	if _, ok := a.st.Update(key, func(b *model.Bookmark) { b.DownloadChoice = c }); !ok {
		return errNotBookmarked()
	}
	return a.StartDownload(key)
}

// downloadChoice is what the user chose to download (something must be)
func downloadChoice(pages bool, attachments []int) (*model.DownloadChoice, error) {
	if !pages && len(attachments) == 0 {
		return nil, apperr.New("download.nothingChosen", "nothing to download")
	}
	return model.NewDownloadChoice(pages, attachments), nil
}

// ChangeDownloadChoice chooses again what to keep of a downloaded work with attachments: its cbz is built again
// with the pages and archives now chosen. What it keeps is taken from the saved work; only what was added is
// downloaded
func (a *App) ChangeDownloadChoice(key string, pages bool, attachments []int) error {
	next, err := downloadChoice(pages, attachments)
	if err != nil {
		return err
	}
	b, ok := a.st.Bookmark(key)
	if !ok {
		return errNotBookmarked()
	}
	if b.Download.Status != model.DownloadDone || model.IsFileKey(key) || model.IsLocalKey(key) {
		return apperr.New("download.notDownloaded", "not downloaded yet")
	}
	if b.DownloadChoice.Same(next) {
		return nil
	}
	if err := a.lib.Rechoose(key, b.DownloadChoice, next); err != nil {
		return err
	}
	a.st.Update(key, func(b *model.Bookmark) {
		b.DownloadChoice = next
		b.Download = notDownloaded(b)
	})
	a.dl.Enqueue(key)
	a.notifyBookmarks()
	return nil
}

func (a *App) PauseDownload(key string) { a.dl.Pause(key) }

func (a *App) DeleteDownload(key string) error {
	if model.IsFileKey(key) {
		return nil // the user's own archive is never deleted
	}
	if model.IsLocalKey(key) {
		// deleting the cbz turns it back into a bookmark that shows the source gallery's pages
		if a.isBuilding(key) {
			return apperr.New("download.deleteWhileBuilding", "cannot delete while the cbz is being built")
		}
	} else {
		a.dl.Pause(key)
	}
	if err := a.lib.Delete(key); err != nil {
		return err
	}
	a.st.Update(key, func(b *model.Bookmark) { resetDownload(b) })
	a.notifyBookmarks()
	return nil
}

// VerifyDownloads checks that the cbz of each downloaded bookmark exists and resets those deleted
// outside the app to unsaved (page range bookmarks go back to showing the source gallery's pages).
// Called at startup and when the Bookmarks screen opens.
func (a *App) VerifyDownloads() {
	var keys []string
	for _, b := range a.st.Bookmarks() {
		// the user's own archives are checked by the library scan (a missing one is marked, not reset)
		if b.Download.Status == model.DownloadDone && !model.IsFileKey(b.Key) {
			keys = append(keys, b.Key)
		}
	}
	a.resetMissing(keys)
}

// resetMissing resets the download state of the keys whose cbz is missing to unsaved
func (a *App) resetMissing(keys []string) {
	missing := a.lib.FindMissing(keys)
	for _, k := range missing {
		a.st.Update(k, func(b *model.Bookmark) {
			resetDownload(b)
			b.ArchiveFile = ""
		})
	}
	if len(missing) > 0 {
		log.Printf("[library] reset %d bookmarks whose cbz is missing: %v", len(missing), missing)
		a.notifyBookmarks()
	}
}

// ---------------------------------------------------------------- Temporary files (.parts)

// isViewCache reports whether a work dir only holds pages saved while viewing
// (works downloading, queued, paused or failed need them to resume, so they are excluded)
func (a *App) isViewCache(key string) bool {
	b, ok := a.st.Bookmark(key)
	return ok && b.Download.Status == model.DownloadNone && !a.isBuilding(key)
}

// cleanTempFiles cleans up temporary files at startup. Work dirs of non-bookmarked works are always deleted;
// pages saved while viewing are deleted when the setting is "Delete at startup" or "Delete when the viewer closes"
// (with "Make a cbz when all pages are saved", complete works are made into cbz files)
func (a *App) cleanTempFiles() {
	policy := a.st.Settings().TempFiles
	n := 0
	for _, k := range a.lib.WorkKeys() {
		orphan := !a.st.Has(k)
		if orphan || (policy != store.TempFilesPack && a.isViewCache(k)) {
			a.lib.DeleteWork(k)
			n++
			continue
		}
		// also make cbz files of works whose pages were all saved by the last run
		a.pageCached(k)
	}
	if n > 0 {
		log.Printf("[library] deleted %d temporary work dirs", n)
	}
}

// pageCached is called when a page is saved while viewing.
// With "Make a cbz when all pages are saved", once all pages are there it is queued as a download and packed into a cbz
// (the pages are already there, so nothing is fetched; it only adds the work info and thumbnail)
func (a *App) pageCached(key string) {
	if a.st.Settings().TempFiles != store.TempFilesPack || !a.isViewCache(key) {
		return
	}
	b, _ := a.st.Bookmark(key)
	if n := b.Summary.PageCount; n > 0 && a.lib.CountLocalPages(key, n) >= n {
		log.Printf("[library] %s: all pages cached, building the cbz", key)
		a.dl.Enqueue(key)
	}
}

// OpenFolder opens the save location in Explorer (with the cbz selected if it exists)
func (a *App) OpenFolder(key string) error {
	path, isFile := a.lib.RevealPath(key)
	if path == "" {
		return apperr.New("download.notDownloaded", "not downloaded yet")
	}
	return a.sh.reveal(path, isFile)
}
