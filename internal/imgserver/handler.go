// Package imgserver is the HTTP handler that serves images to the frontend.
// It is installed as Wails AssetServer middleware and serves from the same origin.
//
//	/poru/img/{site}/{id}/{index}        page images (from the cbz if downloaded)
//	/poru/thumb/{site}/{id}/{index}      thumbnails (small size with ?small=1)
package imgserver

import (
	"context"
	"errors"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"poruneko/internal/library"
	"poruneko/internal/model"
	"poruneko/internal/netx"
	"poruneko/internal/site"
	"poruneko/internal/store"
)

const Prefix = "/poru/"

type Handler struct {
	lib    *library.Library
	st     *store.Store
	thumbs *netx.Cache[[]byte]
	// pages holds page images fetched from the site (so prefetched ones can be returned at once when shown)
	pages *byteLRU

	// OnPageSaved is called after a page is saved while viewing (for the setting that makes a cbz when all pages are saved)
	OnPageSaved func(key string)

	// active holds in-flight requests per gallery (canceled together when the gallery page closes)
	mu     sync.Mutex
	active map[string]map[int]context.CancelFunc
	seq    int
}

func New(lib *library.Library, st *store.Store) *Handler {
	return &Handler{
		lib:    lib,
		st:     st,
		thumbs: netx.NewCache[[]byte](time.Hour, 1000),
		pages:  newByteLRU(300 << 20),
		active: map[string]map[int]context.CancelFunc{},
	}
}

// track registers ctx as a fetch for gallery key and returns a cancelable ctx and a cleanup func
func (h *Handler) track(ctx context.Context, key string) (context.Context, func()) {
	ctx, cancel := context.WithCancel(ctx)
	h.mu.Lock()
	h.seq++
	id := h.seq
	if h.active[key] == nil {
		h.active[key] = map[int]context.CancelFunc{}
	}
	h.active[key][id] = cancel
	h.mu.Unlock()
	return ctx, func() {
		h.mu.Lock()
		delete(h.active[key], id)
		if len(h.active[key]) == 0 {
			delete(h.active, key)
		}
		h.mu.Unlock()
		cancel()
	}
}

// CancelGallery cancels all unfinished viewer fetches (including prefetches) for a gallery,
// so that remaining pages are not fetched after its page closes and do not slow down the next gallery.
// Downloads for bookmarks are not stopped here.
func (h *Handler) CancelGallery(key string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := len(h.active[key])
	for _, cancel := range h.active[key] {
		cancel()
	}
	delete(h.active, key)
	return n
}

// Middleware intercepts /poru/ and passes everything else on
func (h *Handler) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, Prefix) {
			h.ServeHTTP(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// if debug is true, every request is logged (env PORUNEKO_DEBUG=1)
var debug = os.Getenv("PORUNEKO_DEBUG") != ""

type statusRecorder struct {
	http.ResponseWriter
	code  int
	bytes int
}

func (s *statusRecorder) WriteHeader(c int) { s.code = c; s.ResponseWriter.WriteHeader(c) }
func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.code == 0 {
		s.code = 200
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if debug {
		rec := &statusRecorder{ResponseWriter: w}
		start := time.Now()
		defer func() {
			log.Printf("[img] %s -> %d %dB %s", r.URL.String(), rec.code, rec.bytes, time.Since(start).Round(time.Millisecond))
		}()
		w = rec
	}
	// the id can contain "/" (the path of a user's archive in the library folder): it is everything between the
	// site and the page number
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, Prefix), "/")
	if len(parts) < 4 {
		http.NotFound(w, r)
		return
	}
	kind, siteID, id := parts[0], parts[1], strings.Join(parts[2:len(parts)-1], "/")
	index, err := strconv.Atoi(parts[len(parts)-1])
	if err != nil {
		http.NotFound(w, r)
		return
	}
	key := model.MakeKey(siteID, id)
	ctx := r.Context()

	switch kind {
	case "img":
		err = h.image(ctx, w, key, siteID, id, index)
	case "thumb":
		err = h.thumb(ctx, w, key, siteID, id, index, r.URL.Query().Get("small") == "")
	default:
		http.NotFound(w, r)
		return
	}
	switch {
	case err == nil || ctx.Err() != nil:
	case errors.Is(err, context.Canceled):
		// a fetch canceled by closing the gallery page (not an error)
		http.Error(w, "canceled", http.StatusServiceUnavailable)
	default:
		log.Printf("[img] %s: %v", r.URL.Path, err)
		http.Error(w, err.Error(), http.StatusBadGateway)
	}
}

func writeImage(w http.ResponseWriter, body []byte, ext string) {
	ct := mime.TypeByExtension("." + ext)
	if ct == "" {
		ct = "image/" + ext
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "max-age=86400")
	_, _ = w.Write(body)
}

func writeFile(w http.ResponseWriter, path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	writeImage(w, b, strings.TrimPrefix(filepath.Ext(path), "."))
	return nil
}

func (h *Handler) image(ctx context.Context, w http.ResponseWriter, key, siteID, id string, index int) error {
	if b, ext, ok := h.lib.ReadPage(key, index); ok {
		writeImage(w, b, ext)
		return nil
	}
	// a page range bookmark without a cbz serves the source gallery's pages (cancellation counts toward this gallery)
	if siteID == model.SiteLocal {
		src, err := h.sourcePage(key, index)
		if err != nil {
			return err
		}
		return h.remoteImage(ctx, w, key, src.key, src.site, src.id, src.index)
	}
	return h.remoteImage(ctx, w, key, key, siteID, id, index)
}

// sourcePage is the source gallery page corresponding to a page of a page range bookmark
type sourcePage struct {
	key, site, id string
	index         int
}

func (h *Handler) sourcePage(key string, index int) (sourcePage, error) {
	srcKey, srcIndex, ok := h.lib.RangeSource(key, index)
	if !ok {
		return sourcePage{}, errors.New("page not found")
	}
	s, id, err := model.ParseKey(srcKey)
	return sourcePage{key: srcKey, site: s, id: id, index: srcIndex}, err
}

// remoteImage serves a page image from the site (trackKey is the gallery CancelGallery cancels by)
func (h *Handler) remoteImage(ctx context.Context, w http.ResponseWriter, trackKey, key, siteID, id string, index int) error {
	if trackKey != key {
		if b, ext, ok := h.lib.ReadPage(key, index); ok {
			writeImage(w, b, ext)
			return nil
		}
	}
	ck := key + "/" + strconv.Itoa(index)
	if b, ext, ok := h.pages.Get(ck); ok {
		writeImage(w, b, ext)
		return nil
	}
	p, err := site.Get(siteID)
	if err != nil {
		return err
	}
	ctx, done := h.track(ctx, trackKey)
	defer done()
	body, ext, err := h.lib.FetchPage(ctx, p, id, index, library.Foreground)
	if err != nil {
		return err
	}
	h.pages.Put(ck, body, ext)
	// save it while viewing if bookmarked
	if h.st.Has(key) {
		go func() {
			if h.lib.SavePage(key, index, ext, body) == nil && h.OnPageSaved != nil {
				h.OnPageSaved(key)
			}
		}()
	}
	writeImage(w, body, ext)
	return nil
}

func (h *Handler) thumb(ctx context.Context, w http.ResponseWriter, key, siteID, id string, index int, big bool) error {
	// the list cover uses the thumbnail chosen by the user if there is one
	if index == 0 && big {
		if p := h.lib.CustomThumb(key); p != "" {
			return writeFile(w, p)
		}
	}
	// the user's own archives: a cached small thumbnail, or the page itself if it cannot be decoded
	if siteID == model.SiteFile {
		if b, ok := h.lib.FileThumb(key, index, big); ok {
			writeImage(w, b, "jpeg")
			return nil
		}
		if b, ext, ok := h.lib.ReadPage(key, index); ok {
			writeImage(w, b, ext)
			return nil
		}
		return os.ErrNotExist
	}
	// local works made from a page range are served from the cbz (or the source gallery's thumbnail without one)
	if siteID == model.SiteLocal {
		// the list cover can be set to the source gallery's cover (the default is the first page in the range)
		cover := index == 0 && big
		useSource := cover && h.st.Settings().RangeThumb == store.RangeThumbSource
		if p := h.lib.LocalThumb(key); p != "" && useSource {
			return writeFile(w, p)
		}
		if !useSource {
			if b, ext, ok := h.lib.ReadPage(key, index); ok {
				writeImage(w, b, ext)
				return nil
			}
		}
		src, err := h.sourcePage(key, index)
		if err != nil {
			return err
		}
		if useSource {
			src.index = 0
		}
		return h.thumb(ctx, w, src.key, src.site, src.id, src.index, big)
	}
	if index == 0 && big {
		if p := h.lib.LocalThumb(key); p != "" {
			return writeFile(w, p)
		}
	}
	ck := key + "/" + strconv.Itoa(index) + "/" + strconv.FormatBool(big)
	if b, ok := h.thumbs.Get(ck); ok {
		writeImage(w, b, "webp")
		return nil
	}
	fetch := func() ([]byte, error) {
		p, err := site.Get(siteID)
		if err != nil {
			return nil, err
		}
		src, err := p.Thumb(ctx, id, index, big)
		if err != nil {
			return nil, err
		}
		res, err := netx.Get(ctx, src.URL, &netx.Opts{Headers: src.Headers})
		if err != nil {
			p.Invalidate()
			if src, err = p.Thumb(ctx, id, index, big); err == nil {
				res, err = netx.Get(ctx, src.URL, &netx.Opts{Headers: src.Headers})
			}
		}
		if err != nil {
			return nil, err
		}
		return res.Body, nil
	}
	b, err := fetch()
	if err != nil {
		// offline, fall back to downloaded page images
		if b, ext, ok := h.lib.ReadPage(key, index); ok {
			writeImage(w, b, ext)
			return nil
		}
		return err
	}
	h.thumbs.Set(ck, b)
	writeImage(w, b, "webp")
	return nil
}
