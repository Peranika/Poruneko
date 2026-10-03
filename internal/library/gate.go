package library

import (
	"context"
	"fmt"
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

// gate limits the total number of concurrent connections to the site.
// Congestion returns 503s, so downloads and the viewer share the slots and the viewer comes first.
type gate struct {
	mu        sync.Mutex
	bgInUse   int
	fgInUse   int
	fgWaiting int
	lastFg    time.Time
}

// acquire takes a fetch slot. bgLimit is the download concurrency setting.
func (g *gate) acquire(ctx context.Context, pr Priority, bgLimit int) bool {
	g.mu.Lock()
	if pr == Foreground {
		g.fgWaiting++
		g.lastFg = time.Now()
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
			if time.Since(g.lastFg) < viewerIdle {
				limit = 1 // throttle downloads while viewing
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
		fctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		pf = &pendingFetch{cancel: cancel, done: make(chan struct{})}
		l.pending[key] = pf
		go func() {
			defer cancel()
			if l.gate.acquire(fctx, pr, l.st.Settings().DownloadConcurrency) {
				pf.body, pf.ext, pf.err = fetchImage(fctx, p, id, index, format, pr)
				l.gate.release(pr)
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

func fetchImage(ctx context.Context, p site.Provider, id string, index int, format string, pr Priority) ([]byte, string, error) {
	opts := &netx.Opts{Timeout: time.Minute, Retries: 5}
	if pr == Foreground {
		// while viewing, give up sooner so the user is not kept waiting and leave retries to the frontend
		opts = &netx.Opts{Timeout: 30 * time.Second, Retries: 3, MaxBackoff: 3 * time.Second}
	}
	try := func() ([]byte, string, error) {
		src, err := p.Image(ctx, id, index, format)
		if err != nil {
			return nil, "", err
		}
		o := *opts
		o.Headers = src.Headers
		res, err := netx.Get(ctx, src.URL, &o)
		if err != nil {
			return nil, "", err
		}
		return res.Body, src.Ext, nil
	}
	body, ext, err := try()
	if err != nil && ctx.Err() == nil && netx.IsStatus(err, 403, 404) {
		p.Invalidate()
		body, ext, err = try()
	}
	return body, ext, err
}
