package library

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"poruneko/internal/model"
	"poruneko/internal/store"
)

// fakeFormat reads ".fake" archives from memory (stands in for a Susie plug-in)
type fakeFormat struct{ files map[string][]byte }

func (f *fakeFormat) Name() string                                  { return "fake" }
func (f *fakeFormat) Extensions() []string                          { return []string{".fake"} }
func (f *fakeFormat) Supports(path string) bool                     { return true }
func (f *fakeFormat) Read(_ string, e ArchiveEntry) ([]byte, error) { return f.files[e.Name], nil }
func (f *fakeFormat) Entries(string) ([]ArchiveEntry, error) {
	var out []ArchiveEntry
	for name, b := range f.files {
		out = append(out, ArchiveEntry{Name: name, Size: int64(len(b))})
	}
	return out, nil
}

func TestPluginFormat(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := store.Open()
	s := st.Settings()
	s.LibraryDir = dir
	st.SetSettings(s)
	lib := New(st)
	t.Cleanup(lib.Close)
	p1, p2, p10 := pngBytes(t, 10, 10), pngBytes(t, 20, 10), pngBytes(t, 30, 10)
	RegisterFormat(&fakeFormat{files: map[string][]byte{
		"p10.png": p10, "p2.png": p2, "p1.png": p1, "readme.txt": []byte("x"),
		"ComicInfo.xml": []byte(`<ComicInfo><Title>Fake Book</Title><Writer>Someone</Writer></ComicInfo>`),
	}})
	if err := os.WriteFile(filepath.Join(dir, "a.fake"), []byte("fake archive"), 0o644); err != nil {
		t.Fatal(err)
	}
	found := lib.FindArchives()
	if len(found) != 1 || found[0] != "a.fake" {
		t.Fatalf("found %v", found)
	}
	d, err := lib.ArchiveDetail("a.fake")
	if err != nil {
		t.Fatal(err)
	}
	if d.JapaneseTitle != "Fake Book" || len(d.Artists) != 1 || len(d.Pages) != 3 || d.Pages[2].Name != "p10.png" {
		t.Fatalf("%+v %+v", d.GallerySummary, d.Pages)
	}
	st.Put(model.Bookmark{Key: d.Key, ArchiveFile: "a.fake"})
	if b, _, ok := lib.ReadPage(d.Key, 1); !ok || !bytes.Equal(b, p2) {
		t.Fatal("page 2")
	}
	if !lib.HasPage(d.Key, 2) || lib.HasPage(d.Key, 3) {
		t.Fatal("HasPage")
	}
}

// an archive whose pages the format cannot extract is not a work
type brokenFormat struct{ fakeFormat }

func (b *brokenFormat) Extensions() []string { return []string{".broken"} }
func (b *brokenFormat) Read(string, ArchiveEntry) ([]byte, error) {
	return nil, os.ErrPermission
}

func TestPluginFormatUnreadable(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := store.Open()
	s := st.Settings()
	s.LibraryDir = dir
	st.SetSettings(s)
	lib := New(st)
	t.Cleanup(lib.Close)
	RegisterFormat(&brokenFormat{fakeFormat{files: map[string][]byte{"p1.png": pngBytes(t, 5, 5)}}})
	_ = os.WriteFile(filepath.Join(dir, "b.broken"), []byte("x"), 0o644)
	if _, err := lib.ArchiveDetail("b.broken"); err == nil {
		t.Fatal("an unreadable archive became a work")
	}
}
