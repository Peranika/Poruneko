package devsync

import (
	"context"
	"errors"
	"slices"
	"strconv"
	"sync"
	"testing"
	"time"

	"poruneko/internal/model"
)

// device is a Service with its shared data in memory
type device struct {
	mu    sync.Mutex
	state model.SyncState
	svc   *Service
}

func newDevice(t *testing.T, name string, bookmarks ...string) *device {
	t.Setenv("PORUNEKO_DEVICE_NAME", name)
	d := &device{state: model.SyncState{Deleted: map[string]int64{}}}
	for _, k := range bookmarks {
		d.state.Bookmarks = append(d.state.Bookmarks, model.Bookmark{Key: k, AddedAt: time.Now().UnixMilli()})
	}
	d.svc = New(t.TempDir(), func() model.SyncState {
		d.mu.Lock()
		defer d.mu.Unlock()
		return d.state
	}, func(remote model.SyncState) error {
		d.mu.Lock()
		defer d.mu.Unlock()
		d.state = Merge(d.state, remote, time.Now())
		return nil
	}, nil)
	d.svc.bind = "127.0.0.1"
	t.Cleanup(d.svc.Close)
	return d
}

func (d *device) keys() []string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return keys(d.state)
}

func TestPairAndSync(t *testing.T) {
	pc := newDevice(t, "pc", "x:1")
	phone := newDevice(t, "phone", "x:2")
	ps, err := pc.svc.StartPairing()
	if err != nil {
		t.Fatal(err)
	}
	addr := "127.0.0.1:" + strconv.Itoa(pc.svc.port)
	ctx := context.Background()

	if _, err := phone.svc.Pair(ctx, addr, "AAAA-AAAA"); !errors.Is(err, ErrWrongCode) {
		t.Fatalf("wrong code: %v", err)
	}
	if _, err := phone.svc.Pair(ctx, addr, " "+ps.Code[:4]+ps.Code[5:]+" "); err != nil {
		t.Fatalf("pair: %v", err)
	}
	if st := pc.svc.Status(); len(st.Peers) != 1 || st.Peers[0].Name != "phone" || st.Pairing != nil {
		t.Fatalf("pc status %+v", st)
	}
	// the code is used up
	if _, err := newDevice(t, "other").svc.Pair(ctx, addr, ps.Code); !errors.Is(err, ErrNotPairing) {
		t.Fatalf("second pairing: %v", err)
	}

	res := phone.svc.SyncNow(ctx)
	if len(res) != 1 || res[0].Error != "" {
		t.Fatalf("sync %+v", res)
	}
	want := []string{"x:1", "x:2"}
	if !slices.Equal(pc.keys(), want) || !slices.Equal(phone.keys(), want) {
		t.Fatalf("pc %v, phone %v", pc.keys(), phone.keys())
	}
}

func TestTooManyWrongCodes(t *testing.T) {
	pc := newDevice(t, "pc")
	phone := newDevice(t, "phone")
	if _, err := pc.svc.StartPairing(); err != nil {
		t.Fatal(err)
	}
	addr := "127.0.0.1:" + strconv.Itoa(pc.svc.port)
	for range pairingTries {
		_, _ = phone.svc.Pair(context.Background(), addr, "AAAA-AAAA")
	}
	if pc.svc.Status().Pairing != nil {
		t.Fatal("pairing still open after too many wrong codes")
	}
}

func TestSyncRefusedFromStranger(t *testing.T) {
	pc := newDevice(t, "pc")
	if _, err := pc.svc.StartPairing(); err != nil {
		t.Fatal(err)
	}
	stranger := newDevice(t, "stranger")
	p := Peer{ID: "someone", Name: "pc", Secret: randomBytes(32)}
	err := stranger.svc.syncWith(context.Background(), p, "127.0.0.1:"+strconv.Itoa(pc.svc.port))
	if err == nil {
		t.Fatal("a device that is not paired synced")
	}
}
