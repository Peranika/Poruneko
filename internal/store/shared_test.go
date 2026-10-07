package store

import (
	"slices"
	"testing"

	"poruneko/internal/model"
)

func newBookmark(key string) model.Bookmark {
	return model.Bookmark{Key: key, AddedAt: 1, Summary: model.GallerySummary{Key: key, Title: "t"}}
}

func TestStampsOnlySharedParts(t *testing.T) {
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := Open()
	st.Put(newBookmark("x:1"))
	b, _ := st.Update("x:1", func(b *model.Bookmark) { b.Download.Done = 3 })
	if b.Edited != (model.EditedAt{}) {
		t.Fatalf("a download stamped the bookmark: %+v", b.Edited)
	}
	b, _ = st.Update("x:1", func(b *model.Bookmark) { b.Tags = append(b.Tags, "mine") })
	if b.Edited.Tags == 0 || b.Edited.Creator != 0 {
		t.Fatalf("tags not stamped alone: %+v", b.Edited)
	}
}

func TestDeletionsKept(t *testing.T) {
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := Open()
	st.Put(newBookmark("x:1"))
	st.Put(newBookmark("file:@1/a.zip"))
	st.Remove("x:1")
	st.Remove("file:@1/a.zip")
	x := st.CreateSeries("s")
	st.DeleteSeries(x.ID)
	st.Flush()
	d := Open().SyncState().Deleted
	if _, ok := d["b:x:1"]; !ok {
		t.Fatalf("bookmark deletion not kept: %v", d)
	}
	if _, ok := d["b:file:@1/a.zip"]; ok {
		t.Fatal("a local archive's deletion is shared")
	}
	if _, ok := d["s:"+x.ID]; !ok {
		t.Fatalf("series deletion not kept: %v", d)
	}
}

func TestApplySync(t *testing.T) {
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := Open()
	mine := newBookmark("x:1")
	mine.Download = model.DownloadState{Status: model.DownloadDone, Done: 5, Total: 5}
	mine.ArchiveFile = "a.cbz"
	st.Put(mine)
	st.Put(newBookmark("x:2"))

	in := newBookmark("x:1")
	in.Tags, in.Edited.Tags = []string{"t"}, 50
	c := st.ApplySync(model.SyncState{
		Bookmarks: []model.Bookmark{in, newBookmark("x:3")},
		Series:    []model.Series{{ID: "s1", Name: "S", CreatedAt: 1, UpdatedAt: 9, Keys: []string{"x:3", "x:9", "x:1"}}},
		Deleted:   map[string]int64{"b:x:2": 60},
	})
	if !slices.Equal(c.Added, []string{"x:3"}) || !slices.Equal(c.Removed, []string{"x:2"}) {
		t.Fatalf("changes %+v", c)
	}
	b, _ := st.Bookmark("x:1")
	if !slices.Equal(b.Tags, []string{"t"}) || b.Download.Status != model.DownloadDone || b.ArchiveFile != "a.cbz" {
		t.Fatalf("bookmark %+v", b)
	}
	x, ok := st.GetSeries("s1")
	if !ok || !slices.Equal(x.Keys, []string{"x:3", "x:1"}) || x.UpdatedAt != 9 {
		t.Fatalf("series %+v", x)
	}
}
