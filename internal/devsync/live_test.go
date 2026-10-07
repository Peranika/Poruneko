package devsync

import (
	"context"
	"os"
	"testing"
	"time"

	"poruneko/internal/model"
)

// TestLivePair pairs with a real device showing a code and syncs one bookmark with it. It runs only when
// PORUNEKO_SYNC_PEER (host:port) and PORUNEKO_SYNC_CODE are set (an Android emulator: adb forward tcp:47500 tcp:47391)
func TestLivePair(t *testing.T) {
	addr, code := os.Getenv("PORUNEKO_SYNC_PEER"), os.Getenv("PORUNEKO_SYNC_CODE")
	if addr == "" || code == "" {
		t.Skip("PORUNEKO_SYNC_PEER / PORUNEKO_SYNC_CODE not set")
	}
	key := os.Getenv("PORUNEKO_SYNC_KEY")
	d := newDevice(t, "live-test")
	if key != "" {
		d.state.Bookmarks = []model.Bookmark{{Key: key, AddedAt: time.Now().UnixMilli(), Summary: model.GallerySummary{Key: key, Site: "hitomi", ID: key[len("hitomi:"):], Title: "sync test", PageCount: 1}}}
	}
	p, err := d.svc.Pair(context.Background(), addr, code)
	if err != nil {
		t.Fatal(err)
	}
	if err := d.svc.syncWith(context.Background(), p, addr); err != nil {
		t.Fatal(err)
	}
	t.Logf("paired with %s; now %d bookmarks: %v", p.Name, len(d.keys()), d.keys())
}
