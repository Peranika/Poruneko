// Package library manages local storage of downloaded works and the download queue.
//
// Storage layout:
//
//	{libraryDir}/{name from the format}.cbz   one cbz per work (uncompressed zip: page images + ComicInfo.xml + poruneko.json)
//	{libraryDir}/.parts/{site}/{id}/      work dir for in-progress downloads
//	{dataDir}/thumbs/{site}/{id}.webp     thumbnails
//
// The cbz location is recorded in the bookmark's ArchiveFile. A cbz without a record is identified
// by reading its poruneko.json (scanned on first access).
package library

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"

	"poruneko/internal/model"
	"poruneko/internal/site"
	"poruneko/internal/store"
)

const (
	infoFile  = "info.json"     // work details in the work dir
	metaEntry = "poruneko.json" // work details in the cbz
	partsDir  = ".parts"
)

// imageExts are the page image formats (the WebView shows them all; AVIF pages are not decoded by the app)
var imageExts = []string{"webp", "avif", "jpg", "jpeg", "png", "gif", "bmp"}

// badChars replaces characters not allowed in file names with full-width lookalikes (Japanese UI)
var badChars = strings.NewReplacer(
	`\`, "＼", "/", "／", ":", "：", "*", "＊", "?", "？", `"`, "”", "<", "＜", ">", "＞", "|", "｜",
)

// badCharsEn replaces them with "_" like gallery-dl and Mihon do (English UI)
var badCharsEn = strings.NewReplacer(
	`\`, "_", "/", "_", ":", "_", "*", "_", "?", "_", `"`, "_", "<", "_", ">", "_", "|", "_",
)

type Library struct {
	st *store.Store

	mu sync.Mutex
	// scanned indexes the cbz files without ArchiveFile in each save location: root -> key -> absolute path
	scanned map[string]map[string]string
	zips    *zipCache
	// fileDetails caches the details of the user's archives (key -> details), as reading page sizes takes a while
	fileDetails map[string]*model.GalleryDetail

	gate    gate // limits concurrent connections to the site
	pmu     sync.Mutex
	pending map[string]*pendingFetch // pages being fetched (merges concurrent fetches of the same page)
}

func New(st *store.Store) *Library {
	return &Library{st: st, zips: newZipCache(8), pending: map[string]*pendingFetch{}}
}

// rootFor is where a work's files are saved: its site's save location (a page range work: its source's site)
func (l *Library) rootFor(key string) string {
	site, _, _ := model.ParseKey(key)
	if site == model.SiteLocal {
		if b, ok := l.st.Bookmark(key); ok && b.Summary.Origin != nil {
			site, _, _ = model.ParseKey(b.Summary.Origin.Key)
		}
	}
	return l.st.SiteDir(site)
}

// roots are the save locations: the folders chosen for sites and the default ones in LibraryDir
func (l *Library) roots() []string {
	s := l.st.Settings()
	var out []string
	for _, d := range s.SiteDirs {
		out = append(out, filepath.Clean(d))
	}
	entries, _ := os.ReadDir(s.LibraryDir)
	for _, e := range entries {
		if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
			out = append(out, filepath.Join(s.LibraryDir, e.Name()))
		}
	}
	slices.Sort(out)
	return slices.Compact(out)
}

// WorkDir is the work dir holding pages of an in-progress download
func (l *Library) WorkDir(key string) string {
	s, id, _ := model.ParseKey(key)
	return filepath.Join(l.rootFor(key), partsDir, s, id)
}

func (l *Library) thumbPath(key string) string {
	s, id, _ := model.ParseKey(key)
	return filepath.Join(store.DataDir(), "thumbs", s, id+".webp")
}

// customThumbPath is where the thumbnail chosen by the user is stored
func (l *Library) customThumbPath(key string) string {
	s, id, _ := model.ParseKey(key)
	return filepath.Join(store.DataDir(), "thumbs", "custom", s, id+".webp")
}

// CustomThumb is the path of the thumbnail chosen by the user ("" if none)
func (l *Library) CustomThumb(key string) string {
	p := l.customThumbPath(key)
	if _, err := os.Stat(p); err == nil {
		return p
	}
	return ""
}

// SaveCustomThumb saves the thumbnail chosen by the user
func (l *Library) SaveCustomThumb(key string, data []byte) error {
	return writeAtomic(l.customThumbPath(key), data)
}

// DeleteCustomThumb deletes the thumbnail chosen by the user
func (l *Library) DeleteCustomThumb(key string) {
	_ = os.Remove(l.customThumbPath(key))
}

func pageBase(index int) string { return fmt.Sprintf("%04d", index+1) }

// ---------------------------------------------------------------- Reading

// workPage returns the path of a page image in the work dir ("" if none)
func (l *Library) workPage(key string, index int) string {
	dir := l.WorkDir(key)
	for _, ext := range imageExts {
		p := filepath.Join(dir, pageBase(index)+"."+ext)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// HasPage reports whether a page is stored locally (cbz or work dir)
func (l *Library) HasPage(key string, index int) bool {
	if p := l.ArchivePath(key); p != "" {
		if f := formatFor(p); f != nil {
			a, err := openPlugin(p, f)
			return err == nil && index >= 0 && index < len(a.pages)
		}
		if z, err := l.zips.open(p); err == nil {
			_, ok := z.pages[index]
			return ok
		}
	}
	return l.workPage(key, index) != ""
}

// countPages is the number of pages in pages that are stored locally
func (l *Library) countPages(key string, pages []model.PageInfo) int {
	n := 0
	for _, pg := range pages {
		if l.HasPage(key, pg.Index) {
			n++
		}
	}
	return n
}

// ReadPage reads a local page image (the cbz first, then the work dir)
func (l *Library) ReadPage(key string, index int) (data []byte, ext string, ok bool) {
	if p := l.ArchivePath(key); p != "" {
		if f := formatFor(p); f != nil {
			if data, ext, err := readPluginPage(p, f, index); err == nil {
				return data, ext, true
			}
		} else if data, ext, err := l.zips.readPage(p, index); err == nil {
			return data, ext, true
		}
	}
	if p := l.workPage(key, index); p != "" {
		if b, err := os.ReadFile(p); err == nil {
			return b, strings.TrimPrefix(filepath.Ext(p), "."), true
		}
	}
	return nil, "", false
}

func (l *Library) LocalThumb(key string) string {
	p := l.thumbPath(key)
	if _, err := os.Stat(p); err == nil {
		return p
	}
	return ""
}

// LocalInfo reads the locally stored work details
func (l *Library) LocalInfo(key string) *model.GalleryDetail {
	var b []byte
	if p := l.ArchivePath(key); p != "" && formatFor(p) == nil {
		b, _ = l.zips.readEntry(p, metaEntry)
	}
	if b == nil {
		b, _ = os.ReadFile(filepath.Join(l.WorkDir(key), infoFile))
	}
	if b == nil {
		return nil
	}
	var d model.GalleryDetail
	if json.Unmarshal(b, &d) != nil {
		return nil
	}
	return &d
}

// ---------------------------------------------------------------- Writing

func writeAtomic(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".part"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// SavePage saves a page image to the work dir (does nothing if the cbz is already built)
func (l *Library) SavePage(key string, index int, ext string, data []byte) error {
	if l.ArchivePath(key) != "" {
		return nil
	}
	return writeAtomic(filepath.Join(l.WorkDir(key), pageBase(index)+"."+ext), data)
}

func (l *Library) SaveThumb(key string, data []byte) error {
	return writeAtomic(l.thumbPath(key), data)
}

func (l *Library) SaveInfo(key string, d *model.GalleryDetail) error {
	b, err := json.MarshalIndent(d, "", " ")
	if err != nil {
		return err
	}
	return writeAtomic(filepath.Join(l.WorkDir(key), infoFile), b)
}

// Delete deletes downloaded files (the cbz and the work dir). The user's own archives are never deleted
func (l *Library) Delete(key string) error {
	if !Owned(key) {
		return os.RemoveAll(l.WorkDir(key))
	}
	if p := l.ArchivePath(key); p != "" {
		release := l.zips.exclusive(p)
		err := removeRetry(p)
		release()
		if err != nil {
			return err
		}
		l.removeEmptyDirs(filepath.Dir(p))
	}
	l.setArchive(key, "")
	work := l.WorkDir(key)
	err := os.RemoveAll(work)
	l.removeEmptyDirs(filepath.Dir(work))
	return err
}

// DeleteWork deletes only the work dir (the work's folder in .parts)
func (l *Library) DeleteWork(key string) {
	work := l.WorkDir(key)
	if err := os.RemoveAll(work); err != nil {
		log.Printf("[library] %s: failed to delete work dir: %v", key, err)
	}
	l.removeEmptyDirs(filepath.Dir(work))
}

// WorkKeys returns the keys of works that have a work dir
func (l *Library) WorkKeys() []string {
	var keys []string
	for _, root := range l.roots() {
		base := filepath.Join(root, partsDir)
		sites, _ := os.ReadDir(base)
		for _, s := range sites {
			if !s.IsDir() {
				continue
			}
			ids, _ := os.ReadDir(filepath.Join(base, s.Name()))
			for _, id := range ids {
				if id.IsDir() {
					keys = append(keys, model.MakeKey(s.Name(), id.Name()))
				}
			}
		}
	}
	slices.Sort(keys)
	return slices.Compact(keys)
}

// CountLocalPages is the number of pages 0 to n-1 stored locally
func (l *Library) CountLocalPages(key string, n int) int {
	c := 0
	for i := 0; i < n; i++ {
		if l.HasPage(key, i) {
			c++
		}
	}
	return c
}

// DeleteAll deletes everything including thumbnails (when a bookmark is removed)
func (l *Library) DeleteAll(key string) error {
	_ = os.Remove(l.thumbPath(key))
	l.DeleteCustomThumb(key)
	return l.Delete(key)
}

// RevealPath returns what to show in Explorer (the cbz or a folder)
func (l *Library) RevealPath(key string) (path string, isFile bool) {
	if p := l.ArchivePath(key); p != "" {
		return p, true
	}
	if _, err := os.Stat(l.WorkDir(key)); err == nil {
		return l.WorkDir(key), false
	}
	return "", false
}

// Detail returns the local info if bookmarked and stored locally, otherwise fetches it from the site
func (l *Library) Detail(ctx context.Context, key string) (*model.GalleryDetail, error) {
	s, id, err := model.ParseKey(key)
	if err != nil {
		return nil, err
	}
	if s == model.SiteFile {
		return l.fileDetail(key)
	}
	if l.st.Has(key) {
		if d := l.LocalInfo(key); d != nil {
			return d, nil
		}
		if s == model.SiteLocal {
			return l.linkedDetail(ctx, key)
		}
	}
	p, err := site.Get(s)
	if err != nil {
		return nil, err
	}
	return p.Gallery(ctx, id)
}
