package library

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"sync"
	"time"

	"poruneko/internal/netx"
	"poruneko/internal/site"
)

// Pages in an archive: a site whose pages are files of one zip (a pixiv ugoira's frames) gives the zip and each
// page's file (ImageSource.Entry). The zip is fetched once, by whoever asks first (the viewer and the download wait
// for the same fetch), kept for a while, and each page is read from it

// archiveCacheTime / archiveCacheMax limit the zips kept in memory
const (
	archiveCacheTime = 10 * time.Minute
	archiveCacheMax  = 3
)

type archives struct {
	cache   *netx.Cache[*zip.Reader]
	mu      sync.Mutex
	loading map[string]*archiveLoad
}

type archiveLoad struct {
	done chan struct{}
	zr   *zip.Reader
	err  error
}

var pageArchives = &archives{cache: netx.NewCache[*zip.Reader](archiveCacheTime, archiveCacheMax), loading: map[string]*archiveLoad{}}

// open is the zip at a URL, fetched once for everyone asking for it
func (a *archives) open(ctx context.Context, src *site.ImageSource) (*zip.Reader, error) {
	if zr, ok := a.cache.Get(src.URL); ok {
		return zr, nil
	}
	a.mu.Lock()
	l := a.loading[src.URL]
	if l == nil {
		l = &archiveLoad{done: make(chan struct{})}
		a.loading[src.URL] = l
		go func() {
			// not tied to the first asker: the others may still want it when it gives up
			fctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			defer cancel()
			res, err := netx.Get(fctx, src.URL, &netx.Opts{Headers: src.Headers, Timeout: 5 * time.Minute, Retries: 3})
			if err == nil {
				l.zr, err = zip.NewReader(bytes.NewReader(res.Body), int64(len(res.Body)))
			}
			l.err = err
			if err == nil {
				a.cache.Set(src.URL, l.zr)
			}
			a.mu.Lock()
			delete(a.loading, src.URL)
			a.mu.Unlock()
			close(l.done)
		}()
	}
	a.mu.Unlock()
	select {
	case <-l.done:
		return l.zr, l.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// entry is a file of the zip at src (src.Entry)
func (a *archives) entry(ctx context.Context, src *site.ImageSource) ([]byte, error) {
	zr, err := a.open(ctx, src)
	if err != nil {
		return nil, err
	}
	for _, f := range zr.File {
		if f.Name == src.Entry {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()
			return io.ReadAll(rc)
		}
	}
	return nil, fmt.Errorf("%s is not in %s", src.Entry, src.URL)
}
