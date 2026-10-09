package library

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"poruneko/internal/netx"
	"poruneko/internal/site"
)

// Priority is the priority of an image fetch
type Priority int

const (
	// Foreground is viewing in the viewer (highest priority)
	Foreground Priority = iota
	// Background is downloads
	Background
)

const (
	// fgSlots is the number of connections always reserved for the viewer
	fgSlots = 4
	// viewerIdle is how long after the viewer's last fetch downloads go back to full speed
	viewerIdle = 4 * time.Second
)

// gate limits the number of concurrent connections to one site (each site has its own: congestion is a site's).
// A congested site returns 503s, so downloads and the viewer share the slots and the viewer comes first: while it
// is fetching, downloads of other works of the site get half their slots. The work being viewed is not held back
// (its download and the viewer fetch the same pages, which are merged)
type gate struct {
	mu        sync.Mutex
	bgInUse   int
	fgInUse   int
	fgWaiting int
	lastFg    time.Time
	// viewing is the work the viewer fetched for last
	viewing string
}

// gateOf is the gate of a site
func (l *Library) gateOf(site string) *gate {
	l.gmu.Lock()
	defer l.gmu.Unlock()
	if l.gates == nil {
		l.gates = map[string]*gate{}
	}
	g := l.gates[site]
	if g == nil {
		g = &gate{}
		l.gates[site] = g
	}
	return g
}

// acquire takes a fetch slot for a page of work. bgLimit is the download concurrency setting.
func (g *gate) acquire(ctx context.Context, pr Priority, bgLimit int, work string) bool {
	g.mu.Lock()
	if pr == Foreground {
		g.fgWaiting++
		g.lastFg = time.Now()
		g.viewing = work
	}
	g.mu.Unlock()
	for {
		g.mu.Lock()
		ok := false
		switch pr {
		case Foreground:
			// the viewer can use its reserved slots plus slots left free by downloads
			if g.fgInUse < fgSlots || g.fgInUse+g.bgInUse < fgSlots+max(1, bgLimit) {
				g.fgInUse++
				g.fgWaiting--
				g.lastFg = time.Now()
				ok = true
			}
		case Background:
			limit := max(1, bgLimit)
			if time.Since(g.lastFg) < viewerIdle && work != g.viewing {
				limit = max(1, bgLimit/2) // leave room for the viewer while it is fetching
			}
			if g.fgWaiting == 0 && g.bgInUse < limit {
				g.bgInUse++
				ok = true
			}
		}
		g.mu.Unlock()
		if ok {
			return true
		}
		select {
		case <-time.After(25 * time.Millisecond):
		case <-ctx.Done():
			if pr == Foreground {
				g.mu.Lock()
				g.fgWaiting--
				g.mu.Unlock()
			}
			return false
		}
	}
}

func (g *gate) release(pr Priority) {
	g.mu.Lock()
	if pr == Foreground {
		g.fgInUse--
	} else {
		g.bgInUse--
	}
	g.mu.Unlock()
}

// pendingFetch is a page being fetched. The fetch is canceled once all waiting callers are gone.
type pendingFetch struct {
	waiters int
	cancel  context.CancelFunc
	done    chan struct{}
	body    []byte
	ext     string
	err     error
}

// FetchPage fetches a page image from the site (concurrent fetches of the same page are merged).
// When every caller's ctx is done the fetch itself is canceled (e.g. the gallery page was closed).
// Congestion (503/429) is retried with backoff; expired URLs (403/404) are retried after refetching gg.js etc.
func (l *Library) FetchPage(ctx context.Context, p site.Provider, id string, index int, pr Priority) ([]byte, string, error) {
	// the image format is the plugin's own setting
	format := ""
	key := fmt.Sprintf("%s/%s/%d", p.ID(), id, index)

	l.pmu.Lock()
	pf := l.pending[key]
	if pf == nil {
		// no limit on the whole fetch (a large video from a slow server takes minutes): a fetch that stops getting
		// data ends by itself (netx), and one nobody waits for any more is cancelled
		fctx, cancel := context.WithCancel(context.Background())
		pf = &pendingFetch{cancel: cancel, done: make(chan struct{})}
		l.pending[key] = pf
		go func() {
			defer cancel()
			g := l.gateOf(string(p.ID()))
			if g.acquire(fctx, pr, l.st.Settings().DownloadConcurrency, id) {
				pf.body, pf.ext, pf.err = fetchImage(fctx, p, id, index, format, pr)
				g.release(pr)
			} else {
				pf.err = fctx.Err()
			}
			l.pmu.Lock()
			if l.pending[key] == pf {
				delete(l.pending, key)
			}
			l.pmu.Unlock()
			close(pf.done)
		}()
	}
	pf.waiters++
	l.pmu.Unlock()

	select {
	case <-pf.done:
		return pf.body, pf.ext, pf.err
	case <-ctx.Done():
		l.pmu.Lock()
		pf.waiters--
		if pf.waiters == 0 {
			pf.cancel()
			// a canceled fetch is not reused by the next call
			if l.pending[key] == pf {
				delete(l.pending, key)
			}
		}
		l.pmu.Unlock()
		return nil, "", ctx.Err()
	}
}

// sniffExt is the extension of an image by its content (def when it is not one it knows)
func sniffExt(b []byte, def string) string {
	switch ct := http.DetectContentType(b); ct {
	case "image/jpeg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/gif":
		return "gif"
	case "image/webp":
		return "webp"
	}
	return def
}

func fetchImage(ctx context.Context, p site.Provider, id string, index int, format string, pr Priority) ([]byte, string, error) {
	opts := &netx.Opts{Timeout: time.Minute, Retries: 5}
	if pr == Foreground {
		// while viewing, give up sooner so the user is not kept waiting and leave retries to the frontend
		opts = &netx.Opts{Timeout: 30 * time.Second, Retries: 3, MaxBackoff: 3 * time.Second}
	}
	// asked: the site told where the page is (a failure after that is the download's)
	asked := false
	try := func() ([]byte, string, error) {
		asked = false
		src, err := p.Image(ctx, id, index, format)
		if err != nil {
			return nil, "", err
		}
		asked = true
		if src.Entry != "" {
			body, err := pageArchives.entry(ctx, src)
			return body, src.Ext, err
		}
		o := *opts
		o.Headers = src.Headers
		if IsVideoExt(src.Ext) {
			o.Timeout = 3 * time.Minute // a video is much larger than a page image
			o.Large = true
		}
		res, err := netx.Get(ctx, src.URL, &o)
		if err != nil && src.Fallback != "" && netx.IsStatus(err, 404, 410) {
			// the file is missing: the site's other picture of the page, kept as what it is (a WebP thumbnail...)
			if res, err = netx.Get(ctx, src.Fallback, &o); err == nil {
				return res.Body, sniffExt(res.Body, src.Ext), nil
			}
		}
		if err != nil {
			return nil, "", err
		}
		return res.Body, src.Ext, nil
	}
	body, ext, err := try()
	// the URL may have expired, or its server be down: the plugin forgets what it knew and is asked once more (a
	// site with more than one server for a page can then give another)
	if err != nil && ctx.Err() == nil && asked {
		p.Invalidate()
		body, ext, err = try()
	}
	return body, ext, err
}
