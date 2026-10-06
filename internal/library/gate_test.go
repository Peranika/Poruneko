package library

import (
	"context"
	"testing"
	"time"
)

func TestGateBackgroundLimit(t *testing.T) {
	var g gate
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if !g.acquire(ctx, Background, 3, "a") {
			t.Fatal("bg acquire failed")
		}
	}
	// blocks once the limit of 3 is reached
	tctx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	if g.acquire(tctx, Background, 3, "a") {
		t.Fatal("bg should be limited")
	}
	// the viewer gets a reserved slot even when downloads use up all slots
	for i := 0; i < fgSlots; i++ {
		if !g.acquire(ctx, Foreground, 3, "b") {
			t.Fatal("fg acquire failed")
		}
	}
}

// while the viewer fetches, downloads of other works get half their slots; the viewed work's keeps them all
func TestGateThrottlesOtherWorksWhileViewing(t *testing.T) {
	var g gate
	ctx := context.Background()
	g.acquire(ctx, Foreground, 8, "viewed")
	g.release(Foreground)
	for i := 0; i < 4; i++ {
		if !g.acquire(ctx, Background, 8, "other") {
			t.Fatalf("bg %d of another work should pass (half of 8)", i)
		}
	}
	tctx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	if g.acquire(tctx, Background, 8, "other") {
		t.Fatal("another work's download should be held to half while viewing")
	}
	// the work being viewed is not held back
	if !g.acquire(ctx, Background, 8, "viewed") {
		t.Fatal("the viewed work's download should not be throttled")
	}
	// back to normal after a while without viewing
	g.mu.Lock()
	g.lastFg = time.Now().Add(-viewerIdle - time.Second)
	g.mu.Unlock()
	if !g.acquire(ctx, Background, 8, "other") {
		t.Fatal("bg should recover after viewer idle")
	}
}

func TestGateBackgroundYieldsToWaitingForeground(t *testing.T) {
	var g gate
	ctx := context.Background()
	for i := 0; i < fgSlots+1; i++ { // the viewer uses up its reserved slots plus the shared one
		g.acquire(ctx, Foreground, 1, "a")
	}
	done := make(chan bool)
	go func() { done <- g.acquire(ctx, Foreground, 1, "a") }() // a waiting viewer
	time.Sleep(50 * time.Millisecond)
	tctx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	if g.acquire(tctx, Background, 1, "a") {
		t.Fatal("bg must not take a slot while fg is waiting")
	}
	g.release(Foreground)
	if !<-done {
		t.Fatal("waiting fg should get the slot")
	}
}

// each site has its own gate: viewing one site's work does not hold back another site's downloads
func TestGatesPerSite(t *testing.T) {
	l := &Library{}
	ctx := context.Background()
	a, b := l.gateOf("hitomi"), l.gateOf("pixiv")
	if a == b || l.gateOf("hitomi") != a {
		t.Fatal("each site should have one gate of its own")
	}
	a.acquire(ctx, Foreground, 2, "viewed")
	a.release(Foreground)
	for i := 0; i < 2; i++ {
		if !b.acquire(ctx, Background, 2, "other") {
			t.Fatal("another site's downloads should keep their slots")
		}
	}
}
