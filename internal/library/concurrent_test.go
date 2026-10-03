package library

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"poruneko/internal/model"
)

// rewriting the work info while it is being viewed (while the zip is read repeatedly) must not be refused
// (on Windows an open file cannot be replaced, which used to cause Access is denied)
func TestUpdateInfoWhileReading(t *testing.T) {
	lib, _, d := setup(t)
	for i := range d.Pages {
		_ = lib.SavePage(d.Key, i, "webp", []byte{byte('a' + i)})
	}
	_ = lib.SaveInfo(d.Key, d)
	if _, err := lib.Pack(d.Key, d); err != nil {
		t.Fatal(err)
	}

	stop := make(chan struct{})
	var reads atomic.Int64
	var wg sync.WaitGroup
	for r := 0; r < 4; r++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				if _, _, ok := lib.ReadPage(d.Key, int(reads.Load()%3)); ok {
					reads.Add(1)
				}
			}
		}()
	}

	for i := 0; i < 15; i++ {
		name := fmt.Sprintf("artist%d", i)
		if err := lib.UpdateInfo(d.Key, func(x *model.GalleryDetail) { x.Artists = []string{name} }); err != nil {
			close(stop)
			wg.Wait()
			t.Fatalf("update %d: %v", i, err)
		}
		time.Sleep(10 * time.Millisecond)
	}
	close(stop)
	wg.Wait()

	if info := lib.LocalInfo(d.Key); info == nil || len(info.Artists) != 1 || info.Artists[0] != "artist14" {
		t.Fatalf("last update not applied: %+v", info)
	}
	if b, _, ok := lib.ReadPage(d.Key, 2); !ok || string(b) != "c" {
		t.Fatal("pages broken after rewrites")
	}
	t.Logf("%d reads during 15 rewrites", reads.Load())
}
