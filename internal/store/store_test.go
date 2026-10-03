package store

import (
	"os"
	"path/filepath"
	"testing"

	"poruneko/internal/model"
)

func TestSortAndLanguagePersist(t *testing.T) {
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := Open()
	if s := st.Settings(); s.Sort != "date" || s.Language != "all" {
		t.Fatalf("defaults: sort=%q language=%q", s.Sort, s.Language)
	}
	s := st.Settings()
	s.Sort, s.Language = "popular-week", "japanese"
	st.SetSettings(s)
	st.Flush()

	// still there after a restart
	if s := Open().Settings(); s.Sort != "popular-week" || s.Language != "japanese" {
		t.Fatalf("after reopen: sort=%q language=%q", s.Sort, s.Language)
	}

	// invalid values revert to defaults
	s.Sort, s.Language = "bogus", ""
	if got := st.SetSettings(s); got.Sort != "date" || got.Language != "all" {
		t.Fatalf("invalid values: sort=%q language=%q", got.Sort, got.Language)
	}
}

func TestMouseGesturesDefaultForOldSettings(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PORUNEKO_DATA_DIR", dir)
	// an older settings file (without mouseGestures) still gets the default of enabled
	if err := os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{"language":"japanese"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if s := Open().Settings(); !s.MouseGestures || s.Language != "japanese" {
		t.Fatalf("mouseGestures=%v language=%q", s.MouseGestures, s.Language)
	}
}

func TestPredecodeDefaultAndClamp(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PORUNEKO_DATA_DIR", dir)
	// an older settings file (without predecode) still gets the default
	if err := os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{"viewer":{"mode":"single"}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	st := Open()
	if v := st.Settings().Viewer; v.Predecode != DefaultPredecode || v.Mode != "single" {
		t.Fatalf("viewer=%+v", v)
	}
	s := st.Settings()
	s.Viewer.Predecode = 999
	if got := st.SetSettings(s).Viewer.Predecode; got != MaxPredecode {
		t.Fatalf("clamp: %d", got)
	}
}

func TestBookmarksPersistAndMigrate(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PORUNEKO_DATA_DIR", dir)
	// an old bookmarks.json is moved into the DB and renamed to .migrated
	old := `{"example:1":{"key":"example:1","addedAt":1,"summary":{"title":"a"}},"example:2":{"key":"example:2","addedAt":2}}`
	if err := os.WriteFile(filepath.Join(dir, "bookmarks.json"), []byte(old), 0o644); err != nil {
		t.Fatal(err)
	}
	st := Open()
	if bs := st.Bookmarks(); len(bs) != 2 || bs[0].Key != "example:2" {
		t.Fatalf("migrated: %+v", bs)
	}
	if _, err := os.Stat(filepath.Join(dir, "bookmarks.json.migrated")); err != nil {
		t.Fatal(err)
	}

	st.Update("example:1", func(b *model.Bookmark) { b.ArchiveFile = "x.zip" })
	st.Remove("example:2")
	st.Put(model.Bookmark{Key: "example:3", AddedAt: 3})
	st.Flush()

	st2 := Open()
	if b, ok := st2.Bookmark("example:1"); !ok || b.ArchiveFile != "x.zip" || b.Summary.Title != "a" {
		t.Fatalf("updated: %+v", b)
	}
	if st2.Has("example:2") || !st2.Has("example:3") {
		t.Fatalf("remove/put: %+v", st2.Bookmarks())
	}
}

func TestSeries(t *testing.T) {
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := Open()
	for _, k := range []string{"example:1", "example:2", "example:3"} {
		st.Put(model.Bookmark{Key: k})
	}
	a := st.CreateSeries(" 連作A ")
	b := st.CreateSeries("連作B")
	// duplicates and non-bookmarked works are dropped
	st.UpdateSeries(a.ID, func(x *model.Series) { x.Keys = []string{"example:2", "example:1", "example:2", "example:9"} })
	if x, _ := st.GetSeries(a.ID); x.Name != "連作A" || len(x.Keys) != 2 || x.Keys[0] != "example:2" {
		t.Fatalf("series A: %+v", x)
	}
	// adding to another series removes it from the old one
	touched, _ := st.UpdateSeries(b.ID, func(x *model.Series) { x.Keys = append(x.Keys, "example:1") })
	if len(touched) != 2 {
		t.Fatalf("touched: %+v", touched)
	}
	if x, i, ok := st.SeriesOf("example:1"); !ok || x.ID != b.ID || i != 0 {
		t.Fatalf("SeriesOf: %+v %d %v", x, i, ok)
	}
	// removing the bookmark also removes it from the series
	st.Remove("example:2")
	st.Flush()

	st2 := Open()
	if x, _ := st2.GetSeries(a.ID); len(x.Keys) != 0 {
		t.Fatalf("after remove: %+v", x)
	}
	if list := st2.SeriesList(); len(list) != 2 || list[0].ID != a.ID {
		t.Fatalf("list: %+v", list)
	}
	st2.DeleteSeries(a.ID)
	st2.Flush()
	if _, ok := Open().GetSeries(a.ID); ok {
		t.Fatal("series should be deleted")
	}
}

func TestHistory(t *testing.T) {
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := Open()
	st.AddHistory(model.GallerySummary{Key: "example:1"}, "browse")
	st.AddHistory(model.GallerySummary{Key: "example:2"}, "bookmarks")
	// opening again moves it to the top; "" keeps the origin recorded before
	st.AddHistory(model.GallerySummary{Key: "example:1"}, "")
	h := st.History()
	if len(h) != 2 || h[0].Key != "example:1" || h[0].Origin != "browse" || h[1].Key != "example:2" {
		t.Fatalf("history = %+v", h)
	}
	st.Flush()
	if h := Open().History(); len(h) != 2 || h[0].Key != "example:1" {
		t.Fatalf("after reopening: %+v", h)
	}
	st.RemoveHistory("example:2")
	if h := st.History(); len(h) != 1 {
		t.Fatalf("after removing: %+v", h)
	}
}
