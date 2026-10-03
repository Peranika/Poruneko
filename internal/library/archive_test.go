package library

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"poruneko/internal/model"
	"poruneko/internal/store"
)

func setup(t *testing.T) (*Library, *store.Store, *model.GalleryDetail) {
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := store.Open()
	lib := New(st)
	t.Cleanup(lib.Close)
	d := &model.GalleryDetail{
		GallerySummary: model.GallerySummary{
			Key: "example:123", Site: "example", ID: "123", Title: "Asa no Hikari", JapaneseTitle: "あさのひかり: 前編?",
			Language: "japanese", Date: "2026-09-30 21:18:00-05", Type: "doujinshi",
			Tags: []model.TagInfo{{NS: "female", Name: "sole female"}},
		},
		Pages: []model.PageInfo{{Index: 0}, {Index: 1}, {Index: 2}},
	}
	st.Put(model.Bookmark{Key: d.Key, Summary: d.GallerySummary, Creator: model.CreatorInfo{Circle: "見本サークル", Artists: []string{"見本太郎"}}})
	return lib, st, d
}

func readEntry(t *testing.T, path, name string) string {
	zr, err := zip.OpenReader(path)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	for _, f := range zr.File {
		if f.Name == name {
			r, _ := f.Open()
			b, _ := io.ReadAll(r)
			r.Close()
			return string(b)
		}
	}
	return ""
}

func TestPackReadRefreshDelete(t *testing.T) {
	lib, st, d := setup(t)
	if err := lib.SaveInfo(d.Key, d); err != nil {
		t.Fatal(err)
	}
	// readable from the work dir even mid-download
	for i := range d.Pages {
		if err := lib.SavePage(d.Key, i, "webp", []byte{byte('a' + i)}); err != nil {
			t.Fatal(err)
		}
	}
	if b, _, ok := lib.ReadPage(d.Key, 1); !ok || string(b) != "b" {
		t.Fatal("read from work dir failed")
	}

	path, err := lib.Pack(d.Key, d)
	if err != nil {
		t.Fatal(err)
	}
	if want := "[見本サークル (見本太郎)] あさのひかり： 前編？.cbz"; filepath.Base(path) != want {
		t.Errorf("zip name = %q, want %q", filepath.Base(path), want)
	}
	if _, err := os.Stat(lib.WorkDir(d.Key)); !os.IsNotExist(err) {
		t.Error("work dir should be removed after pack")
	}
	for i := range d.Pages {
		b, ext, ok := lib.ReadPage(d.Key, i)
		if !ok || string(b) != string(rune('a'+i)) || ext != "webp" {
			t.Fatalf("page %d from zip: %q %s %v", i, b, ext, ok)
		}
		if !lib.HasPage(d.Key, i) {
			t.Fatalf("HasPage(%d) false", i)
		}
	}
	if info := lib.LocalInfo(d.Key); info == nil || len(info.Pages) != 3 {
		t.Fatal("LocalInfo from zip failed")
	}
	ci := readEntry(t, path, comicInfoEntry)
	for _, want := range []string{"<Publisher>見本サークル</Publisher>", "<Writer>見本太郎</Writer>", "<Manga>YesAndRightToLeft</Manga>", "<Year>2026</Year>"} {
		if !strings.Contains(ci, want) {
			t.Errorf("ComicInfo missing %s\n%s", want, ci)
		}
	}

	// still found after a restart (index rebuilt)
	if New(st).ArchivePath(d.Key) != path {
		t.Error("index rebuild failed")
	}

	// apply a creator info change (replaceable even while the zip is open)
	st.Update(d.Key, func(b *model.Bookmark) { b.Creator.Circle = "新サークル" })
	if err := lib.RefreshMeta(d.Key); err != nil {
		t.Fatal(err)
	}
	// the file name changes along with the creator info
	newPath := lib.ArchivePath(d.Key)
	if want := "[新サークル (見本太郎)] あさのひかり： 前編？.cbz"; filepath.Base(newPath) != want {
		t.Errorf("renamed = %q, want %q", filepath.Base(newPath), want)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("old zip should be moved")
	}
	path = newPath
	if ci := readEntry(t, path, comicInfoEntry); !strings.Contains(ci, "<Publisher>新サークル</Publisher>") {
		t.Errorf("ComicInfo not refreshed:\n%s", ci)
	}
	if b, _, ok := lib.ReadPage(d.Key, 2); !ok || string(b) != "c" {
		t.Fatal("page lost after refresh")
	}

	if err := lib.Delete(d.Key); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("zip should be deleted")
	}
	if lib.HasPage(d.Key, 0) {
		t.Error("page should be gone")
	}
}

func TestPackMissingPage(t *testing.T) {
	lib, _, d := setup(t)
	_ = lib.SavePage(d.Key, 0, "webp", []byte("x"))
	if _, err := lib.Pack(d.Key, d); err == nil {
		t.Fatal("pack should fail when pages are missing")
	}
}

func TestRenameLegacyExt(t *testing.T) {
	lib, st, d := setup(t)
	if err := lib.SaveInfo(d.Key, d); err != nil {
		t.Fatal(err)
	}
	for i := range d.Pages {
		if err := lib.SavePage(d.Key, i, "webp", []byte{byte('a' + i)}); err != nil {
			t.Fatal(err)
		}
	}
	path, err := lib.Pack(d.Key, d)
	if err != nil {
		t.Fatal(err)
	}
	// a .zip from an older version (with no record in the bookmark)
	legacy := strings.TrimSuffix(path, ".cbz") + ".zip"
	if err := os.Rename(path, legacy); err != nil {
		t.Fatal(err)
	}
	st.Update(d.Key, func(b *model.Bookmark) { b.ArchiveFile = "" })
	lib.scanned = nil

	if n := lib.RenameLegacyExt(); n != 1 {
		t.Fatalf("renamed = %d", n)
	}
	if got := lib.ArchivePath(d.Key); got != path {
		t.Fatalf("path = %q, want %q", got, path)
	}
	if b, _, ok := lib.ReadPage(d.Key, 2); !ok || string(b) != "c" {
		t.Fatal("read after rename failed")
	}
}

func TestFindMissing(t *testing.T) {
	lib, st, d := setup(t)
	if err := lib.SaveInfo(d.Key, d); err != nil {
		t.Fatal(err)
	}
	for i := range d.Pages {
		if err := lib.SavePage(d.Key, i, "webp", []byte{byte('a' + i)}); err != nil {
			t.Fatal(err)
		}
	}
	path, err := lib.Pack(d.Key, d)
	if err != nil {
		t.Fatal(err)
	}
	if m := lib.FindMissing([]string{d.Key}); len(m) != 0 {
		t.Fatalf("exists: %v", m)
	}

	// if moved outside the app, search the save location again and record the new place
	moved := filepath.Join(filepath.Dir(path), "moved", "x.cbz")
	if err := os.MkdirAll(filepath.Dir(moved), 0o755); err != nil {
		t.Fatal(err)
	}
	lib.Close()
	if err := os.Rename(path, moved); err != nil {
		t.Fatal(err)
	}
	if m := lib.FindMissing([]string{d.Key}); len(m) != 0 {
		t.Fatalf("moved: %v", m)
	}
	if b, _ := st.Bookmark(d.Key); b.ArchiveFile != "moved/x.cbz" {
		t.Fatalf("archive file = %q", b.ArchiveFile)
	}

	// if deleted outside the app, report it as missing
	lib.Close()
	if err := os.Remove(moved); err != nil {
		t.Fatal(err)
	}
	if m := lib.FindMissing([]string{d.Key}); len(m) != 1 || m[0] != d.Key {
		t.Fatalf("deleted: %v", m)
	}

	// do not decide when the save folder itself is missing (e.g. an external drive was unplugged)
	s := st.Settings()
	s.LibraryDir = filepath.Join(t.TempDir(), "unplugged")
	st.SetSettings(s)
	if m := lib.FindMissing([]string{d.Key}); m != nil {
		t.Fatalf("no library dir: %v", m)
	}
}

func TestWorkDirs(t *testing.T) {
	lib, _, d := setup(t)
	if keys := lib.WorkKeys(); len(keys) != 0 {
		t.Fatalf("empty: %v", keys)
	}
	for i := 0; i < 2; i++ {
		if err := lib.SavePage(d.Key, i, "webp", []byte{1}); err != nil {
			t.Fatal(err)
		}
	}
	if keys := lib.WorkKeys(); len(keys) != 1 || keys[0] != d.Key {
		t.Fatalf("keys: %v", keys)
	}
	if n := lib.CountLocalPages(d.Key, 3); n != 2 {
		t.Fatalf("count: %d", n)
	}
	lib.DeleteWork(d.Key)
	if keys := lib.WorkKeys(); len(keys) != 0 {
		t.Fatalf("after delete: %v", keys)
	}
	// do not leave an empty .parts folder either
	if _, err := os.Stat(filepath.Join(lib.rootFor(d.Key), partsDir)); !os.IsNotExist(err) {
		t.Fatalf(".parts should be removed: %v", err)
	}
}
