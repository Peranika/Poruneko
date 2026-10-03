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
		if !g.acquire(ctx, Background, 3) {
			t.Fatal("bg acquire failed")
		}
	}
	// blocks once the limit of 3 is reached
	tctx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	if g.acquire(tctx, Background, 3) {
		t.Fatal("bg should be limited")
	}
	// the viewer gets a reserved slot even when downloads use up all slots
	for i := 0; i < fgSlots; i++ {
		if !g.acquire(ctx, Foreground, 3) {
			t.Fatal("fg acquire failed")
		}
	}
}

func TestGateThrottlesBackgroundWhileViewing(t *testing.T) {
	var g gate
	ctx := context.Background()
	g.acquire(ctx, Foreground, 8)
	g.release(Foreground)
	// right after viewing, downloads are limited to 1
	if !g.acquire(ctx, Background, 8) {
		t.Fatal("first bg should pass")
	}
	tctx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	if g.acquire(tctx, Background, 8) {
		t.Fatal("bg should be throttled to 1 while viewing")
	}
	// back to normal after a while without viewing
	g.mu.Lock()
	g.lastFg = time.Now().Add(-viewerIdle - time.Second)
	g.mu.Unlock()
	if !g.acquire(ctx, Background, 8) {
		t.Fatal("bg should recover after viewer idle")
	}
}

func TestGateBackgroundYieldsToWaitingForeground(t *testing.T) {
	var g gate
	ctx := context.Background()
	for i := 0; i < fgSlots+1; i++ { // the viewer uses up its reserved slots plus the shared one
		g.acquire(ctx, Foreground, 1)
	}
	done := make(chan bool)
	go func() { done <- g.acquire(ctx, Foreground, 1) }() // a waiting viewer
	time.Sleep(50 * time.Millisecond)
	tctx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	if g.acquire(tctx, Background, 1) {
		t.Fatal("bg must not take a slot while fg is waiting")
	}
	g.release(Foreground)
	if !<-done {
		t.Fatal("waiting fg should get the slot")
	}
}
