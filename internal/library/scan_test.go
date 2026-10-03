package library

import (
	"archive/zip"
	"bytes"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"poruneko/internal/model"
	"poruneko/internal/store"
)

func pngBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, w, h))); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// an archive of the user's own: pages named and nested any way, with a ComicInfo.xml and junk entries
func TestArchiveDetailOfUserArchive(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := store.Open()
	s := st.Settings()
	s.LibraryDir = dir
	st.SetSettings(s)
	lib := New(st)
	t.Cleanup(lib.Close) // Windows cannot delete the zip while it is open

	if err := os.MkdirAll(filepath.Join(dir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	f, _ := os.Create(filepath.Join(dir, "sub", "My Book.zip"))
	w := zip.NewWriter(f)
	for _, e := range []struct {
		name string
		data []byte
	}{
		{"book/img10.png", pngBytes(t, 30, 40)},
		{"book/img2.png", pngBytes(t, 20, 10)},
		{"book/img1.png", pngBytes(t, 10, 20)},
		{"__MACOSX/book/._img1.png", []byte("x")},
		{"book/.hidden.png", []byte("x")},
		{"ComicInfo.xml", []byte(`<ComicInfo><Title>本のタイトル</Title><Writer>作者A, 作者B</Writer><Teams>サークルC</Teams><Tags>female:glasses, story</Tags></ComicInfo>`)},
	} {
		fw, _ := w.Create(e.name)
		_, _ = fw.Write(e.data)
	}
	_ = w.Close()
	_ = f.Close()

	found := lib.FindArchives()
	if len(found) != 1 || found[0] != "sub/My Book.zip" {
		t.Fatalf("found %v", found)
	}
	d, err := lib.ArchiveDetail(found[0])
	if err != nil {
		t.Fatal(err)
	}
	if d.Key != "file:sub/My Book.zip" || d.Site != model.SiteFile || d.JapaneseTitle != "本のタイトル" {
		t.Fatalf("summary %+v", d.GallerySummary)
	}
	if len(d.Artists) != 2 || d.Artists[1] != "作者B" || len(d.Groups) != 1 || d.Groups[0] != "サークルC" || len(d.Tags) != 2 || d.Tags[0].NS != "female" {
		t.Fatalf("creators / tags %+v %+v %+v", d.Artists, d.Groups, d.Tags)
	}
	// natural order, junk left out, sizes from the headers
	if len(d.Pages) != 3 || d.Pages[0].Name != "img1.png" || d.Pages[1].Name != "img2.png" || d.Pages[2].Name != "img10.png" {
		t.Fatalf("pages %+v", d.Pages)
	}
	if d.Pages[0].Width != 10 || d.Pages[0].Height != 20 {
		t.Fatalf("size %+v", d.Pages[0])
	}
	// the second page is the second image in natural order (the scan records where the work's file is)
	st.Put(model.Bookmark{Key: d.Key, ArchiveFile: found[0]})
	b, _, ok := lib.ReadPage("file:sub/My Book.zip", 1)
	if !ok || !bytes.Equal(b, pngBytes(t, 20, 10)) {
		t.Fatalf("page 2 not the second image")
	}
	// thumbnails: small pages are used as they are
	if b, ok := lib.FileThumb(d.Key, 0, true); !ok || !bytes.Equal(b, pngBytes(t, 10, 20)) {
		t.Fatalf("small page thumbnail")
	}
}

// an archive with nothing but images: the file name is the title and every list is empty, not nil
func TestArchiveDetailWithoutInfo(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := store.Open()
	s := st.Settings()
	s.LibraryDir = dir
	st.SetSettings(s)
	lib := New(st)
	t.Cleanup(lib.Close)
	f, _ := os.Create(filepath.Join(dir, "Plain Book.cbz"))
	w := zip.NewWriter(f)
	fw, _ := w.Create("1.png")
	_, _ = fw.Write(pngBytes(t, 8, 8))
	_ = w.Close()
	_ = f.Close()
	d, err := lib.ArchiveDetail("Plain Book.cbz")
	if err != nil {
		t.Fatal(err)
	}
	if d.JapaneseTitle != "Plain Book" || d.Artists == nil || d.Groups == nil || d.Parodies == nil || d.Characters == nil || d.Tags == nil {
		t.Fatalf("%+v", d.GallerySummary)
	}
}

func TestNaturalCompare(t *testing.T) {
	for _, c := range [][2]string{{"a2", "a10"}, {"page9.jpg", "page010.jpg"}, {"A1", "b1"}, {"x", "x1"}} {
		if naturalCompare(c[0], c[1]) >= 0 {
			t.Errorf("%s should come before %s", c[0], c[1])
		}
	}
}

func TestParseFileName(t *testing.T) {
	for _, c := range []struct{ in, title, circle, artists string }{
		{"[Circle A (Artist B)] Some Title (Parody)", "Some Title (Parody)", "Circle A", "Artist B"},
		{"[Artist C] 本の名前", "本の名前", "", "Artist C"},
		{"［サークルD（作者E、作者F）］題名", "題名", "サークルD", "作者E|作者F"},
		{"No Brackets", "No Brackets", "", ""},
		{"[Only Bracket]", "[Only Bracket]", "", ""},
	} {
		title, circle, artists := parseFileName(c.in)
		if title != c.title || circle != c.circle || strings.Join(artists, "|") != c.artists {
			t.Errorf("%q: got %q %q %q", c.in, title, circle, artists)
		}
	}
}

// a large page is shrunk to a JPEG thumbnail and cached
func TestFileThumbShrinks(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := store.Open()
	s := st.Settings()
	s.LibraryDir = dir
	st.SetSettings(s)
	lib := New(st)
	t.Cleanup(lib.Close)
	f, _ := os.Create(filepath.Join(dir, "Big.cbz"))
	w := zip.NewWriter(f)
	fw, _ := w.Create("001.png")
	_, _ = fw.Write(pngBytes(t, 1200, 1700))
	_ = w.Close()
	_ = f.Close()
	st.Put(model.Bookmark{Key: FileKey("Big.cbz"), ArchiveFile: "Big.cbz"})
	b, ok := lib.FileThumb(FileKey("Big.cbz"), 0, true)
	if !ok {
		t.Fatal("no thumbnail")
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil || format != "jpeg" || cfg.Width != 480 || cfg.Height != 680 {
		t.Fatalf("%s %dx%d %v", format, cfg.Width, cfg.Height, err)
	}
	if b2, ok := lib.FileThumb(FileKey("Big.cbz"), 0, true); !ok || !bytes.Equal(b, b2) {
		t.Fatal("not cached")
	}
}
