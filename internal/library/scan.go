package library

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/webp"

	"poruneko/internal/model"
)

// The user's own archives in the local folders. An archive found there becomes a work with the key
// "file:@<folder id>/<path relative to the folder>".
// These files belong to the user: the app reads them but never rewrites, renames or deletes them (see Owned).

// Owned reports whether the app made this work's files and may change them (not for the user's own archives)
func Owned(key string) bool { return !model.IsFileKey(key) }

// FileKey is the work key of an archive at this relative path (see LocalDirRel)
func FileKey(rel string) string { return model.MakeKey(model.SiteFile, filepath.ToSlash(rel)) }

// The local folder (Settings.LocalDirs) is marked in the relative paths: "@<id>/<path>"

// LocalDirRel is the relative path of a file in a local folder
func LocalDirRel(id int, rel string) string { return fmt.Sprintf("@%d/%s", id, filepath.ToSlash(rel)) }

// LocalDirOf is the id of the local folder a relative path is in (false for the save location)
func LocalDirOf(rel string) (int, bool) {
	head, _, ok := strings.Cut(rel, "/")
	if !ok || !strings.HasPrefix(head, "@") {
		return 0, false
	}
	id, err := strconv.Atoi(head[1:])
	return id, err == nil
}

// absPath is the file at a relative path: in the save location, or in a local folder ("" if that folder is not set)
func (l *Library) absPath(rel string) string {
	if id, ok := LocalDirOf(rel); ok {
		for _, d := range l.st.Settings().LocalDirs {
			if d.ID == id {
				_, rest, _ := strings.Cut(rel, "/")
				return filepath.Join(d.Path, toOS(rest))
			}
		}
	}
	return "" // not a local folder (any more)
}

// RootAvailable reports whether the local folder a relative path is in can be read. When it cannot (a drive that is
// not connected, say), its files are not known to be gone. A folder no longer in the list counts as readable
func (l *Library) RootAvailable(rel string) bool {
	root := ""
	if id, ok := LocalDirOf(rel); ok {
		for _, d := range l.st.Settings().LocalDirs {
			if d.ID == id {
				root = d.Path
			}
		}
	}
	if root == "" {
		return true
	}
	fi, err := os.Stat(root)
	return err == nil && fi.IsDir()
}

// FindArchives returns the paths of every archive under the local folders, relative to them (slash-separated; see
// LocalDirRel). The save location holds the site plugins' downloads and is not read
func (l *Library) FindArchives() []string {
	var out []string
	for _, d := range l.st.Settings().LocalDirs {
		out = append(out, findArchives(d.Path, func(rel string) string { return LocalDirRel(d.ID, rel) })...)
	}
	return out
}

func findArchives(root string, relOf func(rel string) string) []string {
	if root == "" {
		return nil
	}
	var out []string
	_ = filepath.WalkDir(root, func(p string, e fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if e.IsDir() {
			if p != root && (e.Name() == partsDir || strings.HasPrefix(e.Name(), ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		if isArchive(p) {
			if rel, err := filepath.Rel(root, p); err == nil {
				out = append(out, relOf(filepath.ToSlash(rel)))
			}
		}
		return nil
	})
	return out
}

// ArchiveDetail reads the work details of an archive in a local folder (rel as in LocalDirRel): the app's own
// work info when the archive was made by it, otherwise ComicInfo.xml if any, or the file name. Page sizes come from
// the image headers (0 when the format cannot be read)
func (l *Library) ArchiveDetail(rel string) (*model.GalleryDetail, error) {
	abs := l.absPath(rel)
	if f := formatFor(abs); f != nil {
		return l.pluginArchiveDetail(rel, abs, f)
	}
	z, err := l.zips.open(abs)
	if err != nil {
		return nil, err
	}
	d := &model.GalleryDetail{}
	if f := z.files[metaEntry]; f != nil {
		if b, err := readFile(f); err == nil {
			_ = json.Unmarshal(b, d)
		}
	}
	// the frames of an animation keep their times from the app's work info (the pages are listed again below, under
	// the names they have in the archive: the same pages in the same order)
	meta := d.Pages
	if d.Title == "" && d.JapaneseTitle == "" {
		if f := z.files[comicInfoEntry]; f != nil {
			if b, err := readFile(f); err == nil {
				fillFromComicInfoBytes(d, b)
			}
		}
	}
	l.finishDetail(d, rel, abs)
	d.Pages = make([]model.PageInfo, len(z.order))
	for i, f := range z.order {
		w, h := imageSize(f)
		d.Pages[i] = model.PageInfo{Index: i, Name: filepath.Base(f.Name), Width: w, Height: h, Video: isVideoName(f.Name)}
		if len(meta) == len(z.order) {
			d.Pages[i].Delay = meta[i].Delay
		}
	}
	d.PageCount = len(d.Pages)
	return d, nil
}

// finishDetail fills in what the archive did not say: the title and creators from the file name, the work key,
// and empty lists
func (l *Library) finishDetail(d *model.GalleryDetail, rel, abs string) {
	if d.Title == "" && d.JapaneseTitle == "" {
		name := strings.TrimSuffix(filepath.Base(abs), filepath.Ext(abs))
		title, circle, artists := parseFileName(name)
		d.JapaneseTitle = title
		if len(d.Artists) == 0 && len(d.Groups) == 0 {
			d.Artists = artists
			if circle != "" {
				d.Groups = []string{circle}
			}
		}
	}
	d.Key, d.Site, d.ID = FileKey(rel), model.SiteFile, filepath.ToSlash(rel)
	d.Origin = nil
	fillLists(&d.GallerySummary)
}

// fillFromComicInfoBytes takes the title, creators, tags and language from ComicInfo.xml
func fillFromComicInfoBytes(d *model.GalleryDetail, b []byte) {
	var ci comicInfoXML
	if xml.Unmarshal(b, &ci) != nil {
		return
	}
	d.JapaneseTitle = strings.TrimSpace(ci.Title)
	d.Artists = splitList(ci.Writer)
	if len(d.Artists) == 0 {
		d.Artists = splitList(ci.Penciller)
	}
	d.Groups = splitList(ci.Teams)
	if len(d.Groups) == 0 {
		d.Groups = splitList(ci.Publisher)
	}
	d.Parodies = splitList(ci.Series)
	d.Characters = splitList(ci.Characters)
	d.Type = strings.ToLower(strings.TrimSpace(ci.Genre))
	for _, t := range splitList(ci.Tags) {
		ns, name := "tag", t
		if i := strings.IndexByte(t, ':'); i > 0 {
			ns, name = t[:i], t[i+1:]
		}
		d.Tags = append(d.Tags, model.TagInfo{NS: ns, Name: name})
	}
	for lang, iso := range langISO {
		if strings.EqualFold(ci.LanguageISO, iso) {
			d.Language = lang
		}
	}
}

func splitList(s string) []string {
	out := []string{}
	for _, x := range strings.Split(s, ",") {
		if x = strings.TrimSpace(x); x != "" {
			out = append(out, x)
		}
	}
	return out
}

// imageSize reads an image's size from its header (0, 0 if the format is not supported)
func imageSize(f *zip.File) (int, int) {
	rc, err := f.Open()
	if err != nil {
		return 0, 0
	}
	defer rc.Close()
	// the header is near the start; read a little so a broken or huge entry cannot cost much
	head, _ := io.ReadAll(io.LimitReader(rc, 256<<10))
	cfg, _, err := image.DecodeConfig(bytes.NewReader(head))
	if err != nil {
		return 0, 0
	}
	return cfg.Width, cfg.Height
}

// ArchiveModTime is the archive's modification time in Unix milliseconds (0 if unknown)
func (l *Library) ArchiveModTime(rel string) int64 {
	if fi, err := os.Stat(l.absPath(rel)); err == nil {
		return fi.ModTime().UnixMilli()
	}
	return 0
}

// fileDetail returns the details of a user's archive, read once per session. The bookmark's own summary
// (the user may have edited the creators etc. on the work) replaces what the archive says
func (l *Library) fileDetail(key string) (*model.GalleryDetail, error) {
	l.mu.Lock()
	d, ok := l.fileDetails[key]
	l.mu.Unlock()
	if !ok {
		_, rel, _ := model.ParseKey(key)
		var err error
		if d, err = l.ArchiveDetail(rel); err != nil {
			return nil, err
		}
		l.mu.Lock()
		if l.fileDetails == nil {
			l.fileDetails = map[string]*model.GalleryDetail{}
		}
		l.fileDetails[key] = d
		l.mu.Unlock()
	}
	out := *d
	if b, ok := l.st.Bookmark(key); ok {
		out.GallerySummary = b.Summary
		out.PageCount = len(out.Pages)
		fillLists(&out.GallerySummary)
	}
	return &out, nil
}

// ForgetFileDetail drops the cached details of a user's archive (it changed or is gone)
func (l *Library) ForgetFileDetail(key string) {
	l.mu.Lock()
	delete(l.fileDetails, key)
	l.mu.Unlock()
}

// fillLists makes the lists of a summary empty instead of nil (the frontend expects arrays)
func fillLists(s *model.GallerySummary) {
	s.Artists, s.Groups, s.Parodies, s.Characters = nonNil(s.Artists), nonNil(s.Groups), nonNil(s.Parodies), nonNil(s.Characters)
	if s.Tags == nil {
		s.Tags = []model.TagInfo{}
	}
}

// parseFileName reads the common naming "[Circle (Artist)] Title" or "[Artist] Title" (full-width brackets too).
// Without a leading bracket the whole name is the title
func parseFileName(name string) (title, circle string, artists []string) {
	name = strings.TrimSpace(name)
	open, close := "", ""
	switch {
	case strings.HasPrefix(name, "["):
		open, close = "[", "]"
	case strings.HasPrefix(name, "［"):
		open, close = "［", "］"
	default:
		return name, "", nil
	}
	end := strings.Index(name, close)
	if end < 0 {
		return name, "", nil
	}
	inner := strings.TrimSpace(name[len(open):end])
	title = strings.TrimSpace(name[end+len(close):])
	if title == "" || inner == "" {
		return name, "", nil
	}
	// "Circle (Artist)": the parenthesized part is the artist (several are separated by commas)
	for _, p := range [][2]string{{"(", ")"}, {"（", "）"}} {
		if i := strings.Index(inner, p[0]); i > 0 && strings.HasSuffix(inner, p[1]) {
			circle = strings.TrimSpace(inner[:i])
			list := inner[i+len(p[0]) : len(inner)-len(p[1])]
			for _, a := range strings.FieldsFunc(list, func(r rune) bool { return r == ',' || r == '、' }) {
				if a = strings.TrimSpace(a); a != "" {
					artists = append(artists, a)
				}
			}
			return title, circle, artists
		}
	}
	return title, "", []string{inner}
}

// pluginArchiveDetail reads the details of an archive in a plugin format: ComicInfo.xml if any, or the file name.
// Page sizes stay 0 (reading them would decompress every page)
func (l *Library) pluginArchiveDetail(rel, abs string, f ArchiveFormat) (*model.GalleryDetail, error) {
	a, err := openPlugin(abs, f)
	if err != nil {
		return nil, err
	}
	// a plug-in may list files it cannot extract (unsupported names and the like): the first page must be readable
	if len(a.pages) > 0 {
		if _, err := f.Read(abs, a.pages[0]); err != nil {
			return nil, fmt.Errorf("%s cannot read the pages: %w", f.Name(), err)
		}
	}
	d := &model.GalleryDetail{}
	if e, ok := a.files[comicInfoEntry]; ok {
		if b, err := f.Read(abs, e); err == nil {
			fillFromComicInfoBytes(d, b)
		}
	}
	l.finishDetail(d, rel, abs)
	d.Pages = make([]model.PageInfo, len(a.pages))
	for i, e := range a.pages {
		d.Pages[i] = model.PageInfo{Index: i, Name: filepath.Base(e.Name), Video: isVideoName(e.Name)}
	}
	d.PageCount = len(d.Pages)
	return d, nil
}
