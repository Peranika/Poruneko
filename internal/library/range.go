package library

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"

	"poruneko/internal/apperr"
	"poruneko/internal/model"
	"poruneko/internal/netx"
	"poruneko/internal/site"
	"poruneko/internal/store"
)

// Page range bookmarks: cut out some pages of a work and save them as a local work (cbz).
// Used e.g. to take only one artist's part out of a magazine or anthology.
// While there is no cbz (bookmarked without saving, or being built), the source gallery's pages are shown.

// RangeKey is the key of a cut-out work (the same range of the same work gets the same key)
func RangeKey(srcKey string, from, to int) string {
	return model.MakeKey(model.SiteLocal, fmt.Sprintf("%s-%d-%d", strings.ReplaceAll(srcKey, ":", ""), from, to))
}

// RangeDetail makes the details of the cut-out work (pages renumbered from 0)
func RangeDetail(src *model.GalleryDetail, req model.RangeRequest) *model.GalleryDetail {
	key := RangeKey(src.Key, req.From, req.To)
	_, id, _ := model.ParseKey(key)
	srcTitle := src.DisplayTitle()
	d := &model.GalleryDetail{GallerySummary: src.GallerySummary}
	d.Key, d.Site, d.ID = key, model.SiteLocal, id
	d.Title, d.JapaneseTitle = req.Title, req.Title
	// the work info uses the site's spellings for artists and groups (the display name comes from the creator info)
	d.Artists = nonNil(req.SiteArtists)
	d.Groups = nonNil(req.SiteGroups)
	d.Origin = &model.Origin{Key: src.Key, Title: srcTitle, From: req.From, To: req.To, Tags: true}
	for i, p := range src.Pages[req.From-1 : req.To] {
		p.Index = i
		d.Pages = append(d.Pages, p)
	}
	d.PageCount = len(d.Pages)
	return d
}

// RangeSource maps a page of a page range bookmark to the source gallery's page
func (l *Library) RangeSource(key string, index int) (srcKey string, srcIndex int, ok bool) {
	b, found := l.st.Bookmark(key)
	if !found || b.Summary.Origin == nil {
		return "", 0, false
	}
	o := b.Summary.Origin
	if index < 0 || index > o.To-o.From {
		return "", 0, false
	}
	return o.Key, o.From - 1 + index, true
}

// linkedDetail builds the details of a page range bookmark without a cbz from the source gallery's pages
func (l *Library) linkedDetail(ctx context.Context, key string) (*model.GalleryDetail, error) {
	b, ok := l.st.Bookmark(key)
	if !ok || b.Summary.Origin == nil {
		return nil, apperr.New("range.noOrigin", "page range information is missing")
	}
	o := b.Summary.Origin
	src, err := l.Detail(ctx, o.Key)
	if err != nil {
		return nil, apperr.Wrap(err, "range.sourceUnavailable", "cannot load the source gallery")
	}
	if o.From < 1 || o.From > o.To || o.To > len(src.Pages) {
		return nil, apperr.New("range.pageMismatch", fmt.Sprintf("the source gallery has %d pages, which does not match the range", len(src.Pages)), "pages", len(src.Pages))
	}
	d := &model.GalleryDetail{GallerySummary: b.Summary}
	for i, p := range src.Pages[o.From-1 : o.To] {
		p.Index = i
		d.Pages = append(d.Pages, p)
	}
	d.PageCount = len(d.Pages)
	return d, nil
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// BuildRange collects the source gallery's pages and makes the cut-out work's cbz.
// Downloaded pages are read locally; others are fetched from the site.
// Create the dst bookmark before calling (the cbz name and ComicInfo.xml come from its creator info).
func (l *Library) BuildRange(ctx context.Context, src, dst *model.GalleryDetail, progress func(done, total int)) error {
	if dst.Origin == nil {
		return apperr.New("range.noOrigin", "page range information is missing")
	}
	from := dst.Origin.From
	// the site is only used if some pages are not local (no network needed if all are downloaded)
	provider := sync.OnceValues(func() (site.Provider, error) {
		if src.Site == model.SiteLocal {
			return nil, apperr.New("range.noSourcePages", "the source gallery pages are not available")
		}
		return site.Get(src.Site)
	})

	total := len(dst.Pages)
	var done atomic.Int64
	var mu sync.Mutex
	var lastErr error
	// fetch collects the given pages and returns the missing ones (built pages are skipped, so it can resume)
	fetch := func(pages []model.PageInfo) (failed []model.PageInfo) {
		netx.ParallelEach(pages, 4, func(_ int, pg model.PageInfo) {
			if ctx.Err() != nil || l.HasPage(dst.Key, pg.Index) {
				return
			}
			srcIndex := from - 1 + pg.Index
			body, ext, ok := l.ReadPage(src.Key, srcIndex)
			var err error
			if !ok {
				var p site.Provider
				if p, err = provider(); err == nil {
					// someone is waiting for the build, so fetch with the same priority as viewing
					body, ext, err = l.FetchPage(ctx, p, src.ID, srcIndex, Foreground)
				} else {
					err = fmt.Errorf("page %d: %w", srcIndex+1, err)
				}
			}
			if err == nil {
				err = l.SavePage(dst.Key, pg.Index, ext, body)
			}
			if err != nil {
				mu.Lock()
				lastErr = err
				failed = append(failed, pg)
				mu.Unlock()
				return
			}
			progress(int(done.Add(1)), total)
		})
		return failed
	}

	done.Store(int64(l.countPages(dst.Key, dst.Pages)))
	progress(int(done.Load()), total)
	failed := fetchWithRetry(ctx, dst.Pages, fetch)
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if len(failed) > 0 {
		return apperr.New("download.pagesFailed", fmt.Sprintf("failed to fetch %d pages (%v)", len(failed), lastErr), "count", len(failed), "detail", fmt.Sprint(lastErr))
	}

	// if the setting uses the source gallery's cover as the thumbnail, save it
	// (for the first page in the range nothing is saved; the cbz's first page is used as is)
	if l.st.Settings().RangeThumb == store.RangeThumbSource {
		if p, err := provider(); err == nil {
			l.saveSiteThumb(ctx, p, src.ID, 0, dst.Key)
		}
	}
	_, err := l.Pack(dst.Key, dst)
	return err
}
