package netx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// a body that keeps coming is not cut off by the timeout; one that stops is
func TestTimeoutIsForStalls(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gap := 80 * time.Millisecond
		if r.URL.Path == "/stalls" {
			gap = 400 * time.Millisecond
		}
		for i := 0; i < 5; i++ {
			_, _ = w.Write([]byte(strings.Repeat("x", 100)))
			w.(http.Flusher).Flush()
			time.Sleep(gap)
		}
	}))
	defer srv.Close()
	o := &Opts{Timeout: 200 * time.Millisecond, Retries: -1}
	// 5 parts 80ms apart: 400ms in all, more than the timeout, but never 200ms without data
	res, err := Get(context.Background(), srv.URL+"/steady", o)
	if err != nil || len(res.Body) != 500 {
		t.Fatalf("a steady body failed: %v", err)
	}
	if _, err := Get(context.Background(), srv.URL+"/stalls", o); err == nil {
		t.Fatal("a body that stops for longer than the timeout should fail")
	}
}
