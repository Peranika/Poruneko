package store

import (
	"os"
	"path/filepath"
	"testing"

	"poruneko/internal/model"
)

func TestPluginSettingsPersist(t *testing.T) {
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := Open()
	if s := st.Settings(); s.PluginSettings == nil {
		t.Fatal("plugin settings should be an empty map")
	}
	s := st.Settings()
	s.PluginSettings = map[string]map[string]string{"site": {"sort": "popular-week", "language": "japanese"}}
	st.SetSettings(s)
	st.Flush()

	// still there after a restart
	if s := Open().Settings(); s.PluginSettings["site"]["sort"] != "popular-week" || s.PluginSettings["site"]["language"] != "japanese" {
		t.Fatalf("after reopen: %v", s.PluginSettings)
	}
}

func TestMouseGesturesDefaultForOldSettings(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PORUNEKO_DATA_DIR", dir)
	// an older settings file (without mouseGestures) still gets the default of enabled
	if err := os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{"autoDownload":false}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if s := Open().Settings(); !s.MouseGestures || s.AutoDownload {
		t.Fatalf("mouseGestures=%v autoDownload=%v", s.MouseGestures, s.AutoDownload)
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

// values kept per owner survive a restart, and removing the last one removes the owner
func TestOwnerSettingsPersist(t *testing.T) {
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := Open()
	common := map[string]string{"minLikes": "100"}
	st.SetOwnerValue("twitter", "123", "minLikes", "1000", "100")
	st.SetOwnerValue("twitter", "456", "minLikes", "10", "100")
	st.SetOwnerValue("other", "123", "minLikes", "5", "100")
	st.Flush()

	st = Open()
	o := st.Owner("twitter", "123")
	if v := o.Resolve(common)["minLikes"]; v != "1000" {
		t.Fatalf("after reopen: %q", v)
	}
	all := st.OwnersOf("twitter")
	if o := all["456"]; len(all) != 2 || o.Resolve(common)["minLikes"] != "10" {
		t.Fatalf("owners of twitter: %v", all)
	}
	st.SetOwnerValue("twitter", "123", "minLikes", "", "100")
	st.Flush()
	if all := Open().OwnersOf("twitter"); len(all) != 1 {
		t.Fatalf("after removing: %v", all)
	}
}

// values older versions kept as they were become shares of the common values, keeping what they show
func TestScaleOwnerValues(t *testing.T) {
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := Open()
	st.SetOwnerValue("x", "big", "minLikes", "1000", "0") // kept as it is, like an older version did
	st.SetOwnerValue("x", "small", "minLikes", "5", "0")
	st.ScaleOwnerValues(func(site string) map[string]string { return map[string]string{"minLikes": "100"} })
	big := st.Owner("x", "big")
	if big.Scales["minLikes"] != 10 || len(big.Values) != 0 {
		t.Fatalf("big %+v", big)
	}
	if got := big.Resolve(map[string]string{"minLikes": "1000"})["minLikes"]; got != "10000" {
		t.Fatalf("big with common 1000: %s", got)
	}
	st.Flush()
	if o := Open().Owner("x", "small"); o.Scales["minLikes"] != 0.05 {
		t.Fatalf("small after reopening %+v", o)
	}
}
