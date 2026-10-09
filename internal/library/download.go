package library

import (
	"context"
	"fmt"
	"slices"
	"sync"
	"sync/atomic"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/model"
	"poruneko/internal/netx"
	"poruneko/internal/site"
	"poruneko/internal/store"
)

const maxParallelGalleries = 2

// Downloader is the download queue for bookmarked works
type Downloader struct {
	lib        *Library
	st         *store.Store
	mu         sync.Mutex
	queue      []string
	running    map[string]context.CancelFunc
	OnProgress func(key string, state model.DownloadState)
}

func NewDownloader(lib *Library, st *store.Store) *Downloader {
	return &Downloader{lib: lib, st: st, running: map[string]context.CancelFunc{}, OnProgress: func(string, model.DownloadState) {}}
}

func (d *Downloader) setState(key string, fn func(s *model.DownloadState)) {
	b, ok := d.st.Update(key, func(b *model.Bookmark) { fn(&b.Download) })
	if ok {
		d.OnProgress(key, b.Download)
	}
}

func (d *Downloader) Enqueue(key string) {
	// local works made from a page range have no source site (the cbz is made when they are created)
	if site, _, _ := model.ParseKey(key); site == model.SiteLocal {
		return
	}
	d.mu.Lock()
	_, running := d.running[key]
	if running || slices.Contains(d.queue, key) || !d.st.Has(key) {
		d.mu.Unlock()
		return
	}
	d.queue = append(d.queue, key)
	d.mu.Unlock()
	d.setState(key, func(s *model.DownloadState) {
		s.Status = model.DownloadQueued
		s.ClearError()
	})
	d.pump()
}

func (d *Downloader) Pause(key string) {
	d.mu.Lock()
	d.queue = slices.DeleteFunc(d.queue, func(k string) bool { return k == key })
	cancel := d.running[key]
	d.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	d.setState(key, func(s *model.DownloadState) {
		if s.Status != model.DownloadDone {
			s.Status = model.DownloadPaused
		}
	})
}

// ResumeAll resumes downloads left unfinished at the last exit
func (d *Downloader) ResumeAll() {
	for _, b := range d.st.Bookmarks() {
		if b.Download.Status == model.DownloadQueued || b.Download.Status == model.DownloadDownloading {
			d.Enqueue(b.Key)
		}
	}
}

func (d *Downloader) pump() {
	d.mu.Lock()
	defer d.mu.Unlock()
	for len(d.running) < maxParallelGalleries && len(d.queue) > 0 {
		key := d.queue[0]
		d.queue = d.queue[1:]
		ctx, cancel := context.WithCancel(context.Background())
		d.running[key] = cancel
		go func() {
			err := d.run(ctx, key)
			if err != nil && ctx.Err() == nil {
				d.setState(key, func(s *model.DownloadState) { s.Fail(err) })
			}
			cancel()
			d.mu.Lock()
			delete(d.running, key)
			d.mu.Unlock()
			d.pump()
		}()
	}
}

func (d *Downloader) run(ctx context.Context, key string) error {
	siteID, id, err := model.ParseKey(key)
	if err != nil {
		return err
	}
	p, err := site.Get(siteID)
	if err != nil {
		return err
	}
	detail, err := p.Gallery(ctx, id)
	if err != nil {
		return err
	}
	// already a cbz, so it is done
	if d.lib.ArchivePath(key) != "" {
		if info := d.lib.LocalInfo(key); info != nil {
			detail = info // its pages may include those of attachments
		}
		total := len(detail.Pages)
		d.setState(key, func(s *model.DownloadState) {
			s.Status, s.Done, s.Total, s.Error = model.DownloadDone, total, total, ""
		})
		return nil
	}
	// with attachments chosen, their images and videos are taken out first, then the work info is saved: a viewer
	// that reads it finds those pages already there
	sitePages := len(detail.Pages)
	if b, ok := d.st.Bookmark(key); ok && b.DownloadChoice != nil {
		d.setState(key, func(s *model.DownloadState) { s.Status = model.DownloadDownloading })
		var planned *model.DownloadChoice
		if detail, planned, err = d.lib.addAttachments(ctx, p, id, key, detail, *b.DownloadChoice); err != nil {
			return err
		}
		sitePages = planned.SitePages
		d.st.Update(key, func(b *model.Bookmark) { b.DownloadChoice = planned })
	}
	total := len(detail.Pages)
	if err := d.lib.SaveInfo(key, detail); err != nil {
		return err
	}
	settings := d.st.Settings()

	if d.lib.LocalThumb(key) == "" {
		d.lib.saveSiteThumb(ctx, p, id, 0, key)
	}

	var done atomic.Int64
	done.Store(int64(d.lib.countPages(key, detail.Pages)))
	d.setState(key, func(s *model.DownloadState) {
		s.Status = model.DownloadDownloading
		s.Done = int(done.Load())
		s.Total = total
	})

	var lastEmit atomic.Int64
	var lastErr atomic.Value
	fetchPages := func(pages []model.PageInfo) (failed []model.PageInfo) {
		var mu sync.Mutex
		netx.ParallelEach(pages, settings.DownloadConcurrency, func(_ int, pg model.PageInfo) {
			if ctx.Err() != nil || d.lib.HasPage(key, pg.Index) {
				return
			}
			// concurrent connections are shared by all works and the viewer (the viewer comes first)
			body, ext, err := d.lib.FetchPage(ctx, p, id, pg.Index, Background)
			if err == nil {
				err = d.lib.SavePage(key, pg.Index, ext, body)
			}
			if err != nil {
				if ctx.Err() == nil {
					lastErr.Store(err.Error())
					mu.Lock()
					failed = append(failed, pg)
					mu.Unlock()
				}
				return
			}
			n := done.Add(1)
			now := time.Now().UnixMilli()
			if now-lastEmit.Load() > 250 {
				lastEmit.Store(now)
				d.setState(key, func(s *model.DownloadState) { s.Done = int(n) })
			}
		})
		return failed
	}

	// the pages from attachments are there already; the site's are fetched
	failed := fetchWithRetry(ctx, detail.Pages[:sitePages], fetchPages)
	if ctx.Err() != nil {
		return nil
	}
	if len(failed) > 0 {
		detail, _ := lastErr.Load().(string)
		err := apperr.New("download.pagesFailed", fmt.Sprintf("failed to fetch %d pages (%s)", len(failed), detail), "count", len(failed), "detail", detail)
		d.setState(key, func(s *model.DownloadState) {
			s.Done = int(done.Load())
			s.Fail(err)
		})
		return nil
	}
	// once all pages are there, pack them into the work's cbz
	if _, err := d.lib.Pack(key, detail); err != nil {
		return apperr.Wrap(err, "download.packFailed", "failed to build the cbz")
	}
	d.setState(key, func(s *model.DownloadState) {
		s.Status, s.Done, s.Total, s.Error = model.DownloadDone, total, total, ""
	})
	return nil
}

// fetchWithRetry collects pages with fetch and refetches missing pages after a short wait
// (503s from congestion often succeed later). Returns the pages still missing at the end.
func fetchWithRetry(ctx context.Context, pages []model.PageInfo, fetch func([]model.PageInfo) (failed []model.PageInfo)) []model.PageInfo {
	failed := fetch(pages)
	for retry := 0; len(failed) > 0 && retry < 2 && ctx.Err() == nil; retry++ {
		select {
		case <-time.After(time.Duration(5*(retry+1)) * time.Second):
		case <-ctx.Done():
		}
		failed = fetch(failed)
	}
	return failed
}

// saveSiteThumb saves the site's thumbnail (page index of gallery id) as the thumbnail of work key.
// Failures are ignored since lists fall back to the page image.
func (l *Library) saveSiteThumb(ctx context.Context, p site.Provider, id string, index int, key string) {
	src, err := p.Thumb(ctx, id, index, true)
	if err != nil {
		return
	}
	if res, err := netx.Get(ctx, src.URL, &netx.Opts{Headers: src.Headers}); err == nil {
		_ = l.SaveThumb(key, res.Body)
	}
}
