package devsync

import (
	"slices"
	"testing"
	"time"

	"poruneko/internal/model"
)

func bm(key string, added int64) model.Bookmark {
	return model.Bookmark{Key: key, AddedAt: added, Summary: model.GallerySummary{Key: key, Title: "t-" + key}}
}

func keys(s model.SyncState) []string {
	var out []string
	for _, b := range s.Bookmarks {
		out = append(out, b.Key)
	}
	return out
}

var now = time.UnixMilli(1_000_000_000)

func TestMergeUnion(t *testing.T) {
	a := model.SyncState{Bookmarks: []model.Bookmark{bm("x:1", 10)}}
	b := model.SyncState{Bookmarks: []model.Bookmark{bm("x:2", 20)}}
	m := Merge(a, b, now)
	if got := keys(m); !slices.Equal(got, []string{"x:1", "x:2"}) {
		t.Fatalf("keys %v", got)
	}
}

func TestMergePartsFromWhoChangedThemLast(t *testing.T) {
	a := bm("x:1", 10)
	a.Tags, a.Edited.Tags = []string{"from-a"}, 50
	b := bm("x:1", 10)
	b.Creator, b.Edited.Creator = model.CreatorInfo{Circle: "from-b"}, 60
	b.Tags, b.Edited.Tags = []string{"old-b"}, 40
	m := Merge(model.SyncState{Bookmarks: []model.Bookmark{a}}, model.SyncState{Bookmarks: []model.Bookmark{b}}, now)
	got := m.Bookmarks[0]
	if !slices.Equal(got.Tags, []string{"from-a"}) || got.Creator.Circle != "from-b" {
		t.Fatalf("got tags %v, circle %q", got.Tags, got.Creator.Circle)
	}
	if got.Edited.Tags != 50 || got.Edited.Creator != 60 {
		t.Fatalf("edited %+v", got.Edited)
	}
	// the same the other way round
	m2 := Merge(model.SyncState{Bookmarks: []model.Bookmark{b}}, model.SyncState{Bookmarks: []model.Bookmark{a}}, now)
	if got2 := m2.Bookmarks[0]; !slices.Equal(got2.Tags, got.Tags) || got2.Creator.Circle != got.Creator.Circle {
		t.Fatalf("not symmetric: %+v", got2)
	}
}

func TestMergeDeletion(t *testing.T) {
	// deleted on b after it last changed on a: it goes
	a := model.SyncState{Bookmarks: []model.Bookmark{bm("x:1", 10)}}
	b := model.SyncState{Deleted: map[string]int64{"b:x:1": 20}}
	if got := keys(Merge(a, b, now)); len(got) != 0 {
		t.Fatalf("deleted bookmark kept: %v", got)
	}
	// changed on a after it was deleted on b: it stays
	c := bm("x:1", 10)
	c.Edited.Tags = 30
	if got := keys(Merge(model.SyncState{Bookmarks: []model.Bookmark{c}}, b, now)); len(got) != 1 {
		t.Fatalf("bookmark changed after the deletion is gone")
	}
	// bookmarked again after the deletion: it stays
	if got := keys(Merge(model.SyncState{Bookmarks: []model.Bookmark{bm("x:1", 25)}}, b, now)); len(got) != 1 {
		t.Fatalf("bookmark added again is gone")
	}
}

func TestMergeOldDeletionsForgotten(t *testing.T) {
	old := now.Add(-deletionsKept - time.Hour).UnixMilli()
	m := Merge(model.SyncState{Deleted: map[string]int64{"b:x:1": old, "b:x:2": now.UnixMilli()}}, model.SyncState{}, now)
	if _, ok := m.Deleted["b:x:1"]; ok {
		t.Fatal("old deletion kept")
	}
	if _, ok := m.Deleted["b:x:2"]; !ok {
		t.Fatal("recent deletion lost")
	}
}

func TestMergeSeries(t *testing.T) {
	a := model.SyncState{Series: []model.Series{{ID: "s1", Name: "old", CreatedAt: 1, UpdatedAt: 10, Keys: []string{"x:1"}}}}
	b := model.SyncState{Series: []model.Series{{ID: "s1", Name: "new", CreatedAt: 1, UpdatedAt: 20, Keys: []string{"x:1", "x:2"}}}}
	m := Merge(a, b, now)
	if len(m.Series) != 1 || m.Series[0].Name != "new" {
		t.Fatalf("series %+v", m.Series)
	}
	m = Merge(a, model.SyncState{Deleted: map[string]int64{"s:s1": 15}}, now)
	if len(m.Series) != 0 {
		t.Fatalf("deleted series kept: %+v", m.Series)
	}
}

func TestMergeAddedAtIsTheFirst(t *testing.T) {
	m := Merge(model.SyncState{Bookmarks: []model.Bookmark{bm("x:1", 30)}}, model.SyncState{Bookmarks: []model.Bookmark{bm("x:1", 10)}}, now)
	if m.Bookmarks[0].AddedAt != 10 {
		t.Fatalf("addedAt %d", m.Bookmarks[0].AddedAt)
	}
}
