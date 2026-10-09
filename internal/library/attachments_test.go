package library

import (
	"archive/zip"
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"poruneko/internal/model"
	"poruneko/internal/site"
)

// attachmentProvider is a fake site whose works have one attachment, served at url
type attachmentProvider struct {
	slowProvider
	url string
}

func (a *attachmentProvider) Attachment(context.Context, string, int) (*site.ImageSource, error) {
	return &site.ImageSource{URL: a.url}, nil
}

func zipOf(t *testing.T, files map[string]string) []byte {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for name, body := range files {
		f, err := w.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		f.Write([]byte(body))
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestAddAttachmentsAppendsArchiveMedia(t *testing.T) {
	lib, _, d := setup(t)
	body := zipOf(t, map[string]string{
		"set/img10.png": "ten", "set/img2.png": "two", "set/clip.mp4": "video", "readme.txt": "text", "__MACOSX/set/._img2.png": "fork",
	})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write(body) }))
	defer srv.Close()
	p := &attachmentProvider{url: srv.URL}
	d.Attachments = []model.Attachment{{Index: 0, Name: "extra.zip", Kind: "archive"}}

	out, c, err := lib.addAttachments(context.Background(), p, "123", d.Key, d, model.DownloadChoice{Pages: true, Attachments: []int{0}})
	if err != nil {
		t.Fatal(err)
	}
	if c.SitePages != 3 || len(out.Pages) != 6 || out.PageCount != 6 || !slices.Equal(c.Counts, []int{3}) || !c.Planned {
		t.Fatalf("choice %+v, pages %d (count %d); want 3 site pages of 6", c, len(out.Pages), out.PageCount)
	}
	// natural order, images and videos only, after the site's pages
	want := []struct {
		name  string
		video bool
		body  string
	}{{"clip.mp4", true, "video"}, {"img2.png", false, "two"}, {"img10.png", false, "ten"}}
	for i, w := range want {
		pg := out.Pages[3+i]
		if pg.Index != 3+i || pg.Name != w.name || pg.Video != w.video {
			t.Fatalf("page %d = %+v, want %s", 3+i, pg, w.name)
		}
		if b, _, ok := lib.ReadPage(d.Key, 3+i); !ok || string(b) != w.body {
			t.Fatalf("page %d saved %q, want %q", 3+i, b, w.body)
		}
	}

	// without the site's pages, the archive's come first
	out, c, err = lib.addAttachments(context.Background(), p, "123", d.Key, d, model.DownloadChoice{Attachments: []int{0}})
	if err != nil {
		t.Fatal(err)
	}
	if c.SitePages != 0 || len(out.Pages) != 3 || out.Pages[0].Name != "clip.mp4" {
		t.Fatalf("site pages %d, pages %+v", c.SitePages, out.Pages)
	}
	if b, _, _ := lib.ReadPage(d.Key, 1); string(b) != "two" {
		t.Fatalf("page 1 = %q", b)
	}
}

func TestAddAttachmentsReplacesPageSavedWhileViewing(t *testing.T) {
	lib, _, d := setup(t)
	body := zipOf(t, map[string]string{"a.png": "archive"})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write(body) }))
	defer srv.Close()
	d.Attachments = []model.Attachment{{Index: 0, Name: "extra.zip"}}
	// the site's page 0 was saved while viewing, in another format
	if err := lib.SavePage(d.Key, 0, "webp", []byte("site")); err != nil {
		t.Fatal(err)
	}
	if _, _, err := lib.addAttachments(context.Background(), &attachmentProvider{url: srv.URL}, "123", d.Key, d, model.DownloadChoice{Attachments: []int{0}}); err != nil {
		t.Fatal(err)
	}
	if b, ext, _ := lib.ReadPage(d.Key, 0); string(b) != "archive" || ext != "png" {
		t.Fatalf("page 0 = %q (%s), want the archive's", b, ext)
	}
}

func TestCanOpenArchive(t *testing.T) {
	for name, want := range map[string]bool{"a.zip": true, "b.CBZ": true, "c.pdf": false, "d.rar": true, "e.7z": true} {
		if got := CanOpenArchive(name); got != want {
			t.Errorf("%s: %v, want %v", name, got, want)
		}
	}
}

func TestRechooseKeepsWhatIsChosenWithoutFetchingIt(t *testing.T) {
	lib, _, d := setup(t)
	body := zipOf(t, map[string]string{"a.png": "A", "b.png": "B"})
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Write(body)
	}))
	defer srv.Close()
	p := &attachmentProvider{url: srv.URL}
	d.Attachments = []model.Attachment{{Index: 0, Name: "extra.zip"}}
	for i := range d.Pages {
		if err := lib.SavePage(d.Key, i, "jpg", []byte{'s', byte('0' + i)}); err != nil {
			t.Fatal(err)
		}
	}
	// saved with the site's pages and the archive's
	out, old, err := lib.addAttachments(context.Background(), p, "123", d.Key, d, model.DownloadChoice{Pages: true, Attachments: []int{0}})
	if err != nil {
		t.Fatal(err)
	}
	if err := lib.SaveInfo(d.Key, out); err != nil {
		t.Fatal(err)
	}
	if _, err := lib.Pack(d.Key, out); err != nil {
		t.Fatal(err)
	}

	// chosen again: only the archive
	next := &model.DownloadChoice{Attachments: []int{0}}
	if err := lib.Rechoose(d.Key, old, next); err != nil {
		t.Fatal(err)
	}
	if lib.ArchivePath(d.Key) != "" {
		t.Fatal("the cbz should be gone until it is built again")
	}
	out, planned, err := lib.addAttachments(context.Background(), p, "123", d.Key, d, *next)
	if err != nil {
		t.Fatal(err)
	}
	if hits != 1 {
		t.Fatalf("the kept archive was fetched again (%d fetches)", hits)
	}
	if planned.SitePages != 0 || len(out.Pages) != 2 || out.Pages[0].Name != "a.png" || out.Pages[1].Name != "b.png" {
		t.Fatalf("site pages %d, pages %+v", planned.SitePages, out.Pages)
	}
	if _, err := lib.Pack(d.Key, out); err != nil {
		t.Fatal(err)
	}
	for i, want := range []string{"A", "B"} {
		if b, _, _ := lib.ReadPage(d.Key, i); string(b) != want {
			t.Fatalf("page %d = %q, want %q", i, b, want)
		}
	}
}
