package library

import (
	"archive/zip"
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"

	"poruneko/internal/site"
)

// pages in one zip are read from it, and the zip is fetched once for all of them
func TestArchivedPages(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, name := range []string{"000000.jpg", "000001.jpg", "000002.jpg"} {
		w, _ := zw.Create(name)
		_, _ = w.Write([]byte("frame " + name))
	}
	_ = zw.Close()
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		_, _ = w.Write(buf.Bytes())
	}))
	defer srv.Close()

	a := &archives{cache: pageArchives.cache, loading: map[string]*archiveLoad{}}
	var wg sync.WaitGroup
	for _, name := range []string{"000000.jpg", "000001.jpg", "000002.jpg", "000001.jpg"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			b, err := a.entry(context.Background(), &site.ImageSource{URL: srv.URL, Entry: name})
			if err != nil || string(b) != "frame "+name {
				t.Errorf("%s: %q %v", name, b, err)
			}
		}()
	}
	wg.Wait()
	if n := hits.Load(); n != 1 {
		t.Errorf("the zip was fetched %d times, want 1", n)
	}
	if _, err := a.entry(context.Background(), &site.ImageSource{URL: srv.URL, Entry: "missing.jpg"}); err == nil {
		t.Error("a file not in the zip should fail")
	}
}
