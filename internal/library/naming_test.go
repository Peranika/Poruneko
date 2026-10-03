package library

import (
	"os"
	"path/filepath"
	"testing"

	"poruneko/internal/model"
)

func TestFormatName(t *testing.T) {
	d := &model.GalleryDetail{GallerySummary: model.GallerySummary{
		Key: "example:1", Site: "example", ID: "1", Title: "Title EN", JapaneseTitle: "タイトル/副題",
		Date: "2024-05-06 10:00:00-05", Parodies: []string{"original"},
	}}
	full := model.CreatorInfo{Circle: "サークル", Artists: []string{"作者A", "作者B"}}
	none := model.CreatorInfo{}
	cases := []struct {
		format string
		c      model.CreatorInfo
		want   string
	}{
		{"[{group} ({artist})] {title}", full, "[サークル (作者A, 作者B)] タイトル／副題.cbz"},
		{"[{group} ({artist})] {title}", model.CreatorInfo{Circle: "サークル"}, "[サークル] タイトル／副題.cbz"},
		{"[{group} ({artist})] {title}", model.CreatorInfo{Artists: []string{"作者A"}}, "[(作者A)] タイトル／副題.cbz"},
		{"[{group} ({artist})] {title}", none, "タイトル／副題.cbz"},
		{"{group}/{artist}/{title} [{id}]", full, "サークル/作者A, 作者B/タイトル／副題 [1].cbz"},
		{"{group}/{title}", none, "不明/タイトル／副題.cbz"},
		{"{year}/{date} {title_alt} {unknown}", none, "2024/2024-05-06 Title EN {unknown}.cbz"},
		{`{circle}\{title}`, full, "サークル/タイトル／副題.cbz"},
		{"{creator}/{title}", full, "サークル/タイトル／副題.cbz"},
		{"{creator}/{title}", model.CreatorInfo{Artists: []string{"作者A", "作者B"}}, "作者A, 作者B/タイトル／副題.cbz"},
		{"[{creator}] {title}", none, "タイトル／副題.cbz"},
	}
	for _, c := range cases {
		if got := FormatName(c.format, d, c.c, SeriesRef{}); got != c.want {
			t.Errorf("FormatName(%q) = %q, want %q", c.format, got, c.want)
		}
	}
}

func TestFormatNameSeries(t *testing.T) {
	d := &model.GalleryDetail{GallerySummary: model.GallerySummary{Key: "example:1", Site: "example", ID: "1", Title: "Title", JapaneseTitle: "タイトル"}}
	c := model.CreatorInfo{Circle: "サークル"}
	in := SeriesRef{Name: "連作", No: 3}
	cases := []struct {
		format string
		sr     SeriesRef
		want   string
	}{
		{"{creator}/{series}/{series_no} {title}", in, "サークル/連作/03 タイトル.cbz"},
		// works not in a series do not get a series folder
		{"{creator}/{series}/{series_no} {title}", SeriesRef{}, "サークル/タイトル.cbz"},
		{"[{series} {series_no}] {title}", SeriesRef{}, "タイトル.cbz"},
		{"[{series} {series_no}] {title}", in, "[連作 03] タイトル.cbz"},
		// the file name part is kept even if empty
		{"{creator}/{series}", SeriesRef{}, "サークル/不明.cbz"},
	}
	for _, x := range cases {
		if got := FormatName(x.format, d, c, x.sr); got != x.want {
			t.Errorf("FormatName(%q, %+v) = %q, want %q", x.format, x.sr, got, x.want)
		}
	}
}

func TestCollisionAndRelocateAll(t *testing.T) {
	lib, st, d := setup(t)
	st.SetSettings(func() model.Settings { s := st.Settings(); s.FileNameFormat = "{group}/{title}"; return s }())

	pack := func(d *model.GalleryDetail) string {
		for i := range d.Pages {
			_ = lib.SavePage(d.Key, i, "webp", []byte("x"))
		}
		_ = lib.SaveInfo(d.Key, d)
		p, err := lib.Pack(d.Key, d)
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	p1 := pack(d)

	// another work with the same name is saved with its ID
	d2 := *d
	d2.Key, d2.ID = "example:456", "456"
	st.Put(model.Bookmark{Key: d2.Key, Summary: d2.GallerySummary, Creator: model.CreatorInfo{Circle: "見本サークル"}})
	p2 := pack(&d2)
	if filepath.Dir(p1) != filepath.Dir(p2) || filepath.Base(p2) != "あさのひかり： 前編？ (456).cbz" {
		t.Errorf("collision: %s / %s", p1, p2)
	}

	// format change -> bulk rename
	st.SetSettings(func() model.Settings { s := st.Settings(); s.FileNameFormat = "{title} [{id}]"; return s }())
	moved, errs := lib.RelocateAll()
	if moved != 2 || len(errs) != 0 {
		t.Fatalf("moved=%d errs=%v", moved, errs)
	}
	if got := filepath.Base(lib.ArchivePath(d.Key)); got != "あさのひかり： 前編？ [123].cbz" {
		t.Errorf("relocated = %q", got)
	}
	if _, err := os.Stat(filepath.Dir(p1)); !os.IsNotExist(err) {
		t.Error("empty circle folder should be removed")
	}

	// the user's title replaces {title} and the file is renamed by RefreshMeta
	st.Update(d.Key, func(b *model.Bookmark) { b.CustomTitle = "自分で付けた題" })
	if err := lib.RefreshMeta(d.Key); err != nil {
		t.Fatal(err)
	}
	if got := filepath.Base(lib.ArchivePath(d.Key)); got != "自分で付けた題 [123].cbz" {
		t.Errorf("custom title = %q", got)
	}

	// found from the info in the zip even after the record is lost
	st.Update(d.Key, func(b *model.Bookmark) { b.ArchiveFile = "" })
	if New(st).ArchivePath(d.Key) == "" {
		t.Error("scan fallback failed")
	}
}

func TestFormatNameEnglish(t *testing.T) {
	model.SetUILanguage("en")
	defer model.SetUILanguage("ja")
	d := &model.GalleryDetail{GallerySummary: model.GallerySummary{Key: "example:1", Site: "example", ID: "1", Title: "Title: Part 1?", JapaneseTitle: "タイトル"}}
	// the site's title is used and characters not allowed in file names become "_"
	if got := FormatName("[{group}] {title}", d, model.CreatorInfo{Circle: "circle"}, SeriesRef{}); got != "[circle] Title_ Part 1_.cbz" {
		t.Errorf("got %q", got)
	}
	if got := FormatName("{group}/{title}", d, model.CreatorInfo{}, SeriesRef{}); got != "Unknown/Title_ Part 1_.cbz" {
		t.Errorf("got %q", got)
	}
}
