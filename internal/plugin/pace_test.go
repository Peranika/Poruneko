package plugin

import (
	"context"
	"testing"
	"time"
)

// requests to a paced host (and its subdomains) start at least the pace apart; other hosts do not wait
func TestPace(t *testing.T) {
	p := &Plugin{Info: Info{Pace: map[string]int{"example.com": 50}}}
	ctx := context.Background()
	start := time.Now()
	for _, u := range []string{"https://example.com/a", "https://www.example.com/b", "https://example.com/c"} {
		if err := p.pace(ctx, u); err != nil {
			t.Fatal(err)
		}
	}
	if d := time.Since(start); d < 100*time.Millisecond {
		t.Errorf("three paced requests took %v, want 100ms or more", d)
	}
	start = time.Now()
	if err := p.pace(ctx, "https://other.org/x"); err != nil || time.Since(start) > 20*time.Millisecond {
		t.Errorf("another host waited %v (%v)", time.Since(start), err)
	}
	// a canceled request gives up waiting
	cctx, cancel := context.WithCancel(ctx)
	cancel()
	_ = p.pace(ctx, "https://example.com/d")
	if err := p.pace(cctx, "https://example.com/e"); err == nil {
		t.Error("a canceled request should not wait")
	}
}
