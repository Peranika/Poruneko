package library

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"poruneko/internal/model"
	"poruneko/internal/site"
)

// slowProvider is a fake site that blocks (until canceled) before returning the image source
type slowProvider struct {
	calls   atomic.Int32
	stopped atomic.Int32
}

func (s *slowProvider) ID() model.SiteID { return "slow" }
func (s *slowProvider) Name() string     { return "slow" }
func (s *slowProvider) List(context.Context, model.ListQuery) (*model.ListResult, error) {
	return nil, nil
}
func (s *slowProvider) Gallery(context.Context, string) (*model.GalleryDetail, error) {
	return nil, nil
}
func (s *slowProvider) Image(ctx context.Context, id string, index int, retry bool) (*site.ImageSource, error) {
	s.calls.Add(1)
	<-ctx.Done()
	s.stopped.Add(1)
	return nil, ctx.Err()
}
func (s *slowProvider) Thumb(context.Context, string, int, bool, bool) (*site.ImageSource, error) {
	return nil, nil
}
func (s *slowProvider) Suggest(context.Context, string) ([]model.Suggestion, error) { return nil, nil }

func TestFetchPageCancelsWhenAllWaitersLeave(t *testing.T) {
	lib, _, _ := setup(t)
	p := &slowProvider{}
	ctx1, cancel1 := context.WithCancel(context.Background())
	ctx2, cancel2 := context.WithCancel(context.Background())
	errs := make(chan error, 2)
	go func() { _, _, err := lib.FetchPage(ctx1, p, "1", 0, Foreground); errs <- err }()
	go func() { _, _, err := lib.FetchPage(ctx2, p, "1", 0, Foreground); errs <- err }()
	time.Sleep(100 * time.Millisecond)
	if p.calls.Load() != 1 {
		t.Fatalf("same page should be fetched once, got %d", p.calls.Load())
	}
	cancel1()
	time.Sleep(100 * time.Millisecond)
	if p.stopped.Load() != 0 {
		t.Fatal("fetch must continue while another caller still waits")
	}
	cancel2()
	<-errs
	<-errs
	time.Sleep(100 * time.Millisecond)
	if p.stopped.Load() != 1 {
		t.Fatal("fetch should be canceled after all callers left")
	}
	// a canceled fetch is not reused; the next call fetches again
	ctx3, cancel3 := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel3()
	_, _, _ = lib.FetchPage(ctx3, p, "1", 0, Foreground)
	if p.calls.Load() != 2 {
		t.Fatalf("expected a fresh fetch after cancel, calls=%d", p.calls.Load())
	}
}
