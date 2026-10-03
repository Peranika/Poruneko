package library

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"poruneko/internal/model"
)

// cut a page range out of a downloaded work and check it can be read as a standalone work
func TestBuildRangeFromDownloaded(t *testing.T) {
	lib, st, src := setup(t)
	src.Pages = []model.PageInfo{{Index: 0}, {Index: 1}, {Index: 2}, {Index: 3}, {Index: 4}}
	src.PageCount = 5
	for i := range src.Pages {
		_ = lib.SavePage(src.Key, i, "webp", []byte{byte('a' + i)})
	}
	_ = lib.SaveInfo(src.Key, src)
	if _, err := lib.Pack(src.Key, src); err != nil {
		t.Fatal(err)
	}

	req := model.RangeRequest{SourceKey: src.Key, From: 2, To: 4, Title: "掲載作", Artists: []string{"作者X"}}
	dst := RangeDetail(src, req)
	if dst.Key != "local:example123-2-4" || dst.PageCount != 3 || dst.Origin.Title != "あさのひかり: 前編?" {
		t.Fatalf("detail: key=%s pages=%d origin=%+v", dst.Key, dst.PageCount, dst.Origin)
	}
	st.Put(model.Bookmark{Key: dst.Key, Summary: dst.GallerySummary, Creator: model.CreatorInfo{Status: "manual", Artists: req.Artists}})

	var last int
	if err := lib.BuildRange(context.Background(), src, dst, func(done, total int) { last = done }); err != nil {
		t.Fatal(err)
	}
	if last != 3 {
		t.Errorf("progress = %d", last)
	}
	// pages 2-4 are stored as pages 1-3
	for i, want := range []string{"b", "c", "d"} {
		if b, _, ok := lib.ReadPage(dst.Key, i); !ok || string(b) != want {
			t.Errorf("page %d = %q", i, b)
		}
	}
	path := lib.ArchivePath(dst.Key)
	if filepath.Base(path) != "[(作者X)] 掲載作.cbz" {
		t.Errorf("zip name = %s", filepath.Base(path))
	}
	if ci := readEntry(t, path, comicInfoEntry); !strings.Contains(ci, "元の作品: あさのひかり: 前編?（p.2–4）") {
		t.Errorf("ComicInfo:\n%s", ci)
	}
	if info := lib.LocalInfo(dst.Key); info == nil || info.Origin == nil || info.Origin.From != 2 {
		t.Errorf("local info: %+v", info)
	}
}

func TestRangeDetailMarksSiteTags(t *testing.T) {
	_, _, src := setup(t)
	d := RangeDetail(src, model.RangeRequest{SourceKey: src.Key, From: 1, To: 2, Title: "x", Artists: []string{"入力した作者"}, SiteArtists: []string{"sample artist"}})
	if !d.Origin.Tags || len(d.Artists) != 1 || d.Artists[0] != "sample artist" {
		t.Fatalf("origin=%+v artists=%v", d.Origin, d.Artists)
	}
}

// a page range bookmark without a cbz builds its details from the source gallery's pages
func TestLinkedRange(t *testing.T) {
	lib, st, src := setup(t)
	src.Pages = []model.PageInfo{{Index: 0, Name: "p0"}, {Index: 1, Name: "p1"}, {Index: 2, Name: "p2"}, {Index: 3, Name: "p3"}}
	src.PageCount = 4
	if err := lib.SaveInfo(src.Key, src); err != nil {
		t.Fatal(err)
	}
	dst := RangeDetail(src, model.RangeRequest{SourceKey: src.Key, From: 2, To: 3, Title: "掲載作", Artists: []string{"作者X"}})
	st.Put(model.Bookmark{Key: dst.Key, Summary: dst.GallerySummary, Download: model.DownloadState{Status: "none"}})

	d, err := lib.Detail(context.Background(), dst.Key)
	if err != nil {
		t.Fatal(err)
	}
	if d.Title != "掲載作" || len(d.Pages) != 2 || d.Pages[0].Name != "p1" || d.Pages[1].Index != 1 {
		t.Fatalf("detail: %+v", d)
	}
	if k, i, ok := lib.RangeSource(dst.Key, 1); !ok || k != src.Key || i != 2 {
		t.Fatalf("source of page 1 = %s %d %v", k, i, ok)
	}
	if _, _, ok := lib.RangeSource(dst.Key, 2); ok {
		t.Fatal("page out of range should not map")
	}
}
