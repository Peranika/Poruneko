package library

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"

	"poruneko/internal/apperr"
	"poruneko/internal/model"
	"poruneko/internal/site"
)

// Managing cbz locations. The location is recorded in the bookmark's ArchiveFile, and a cbz without a record
// is identified by reading its poruneko.json. The save name is decided by the file name format (naming.go).

// scanIndex scans the cbz files in a save location and reads the work keys from poruneko.json (call with l.mu held)
func (l *Library) scanIndex(root string) map[string]string {
	if idx, ok := l.scanned[root]; ok {
		return idx
	}
	idx := map[string]string{}
	_ = filepath.WalkDir(root, func(p string, e fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if e.IsDir() {
			if e.Name() == partsDir {
				return filepath.SkipDir
			}
			return nil
		}
		// only the app's own cbz / zip files hold its work info
		if !isArchive(p) || formatFor(p) != nil {
			return nil
		}
		if b, err := l.zips.readEntryNoWait(p, metaEntry); err == nil {
			var d model.GallerySummary
			if json.Unmarshal(b, &d) == nil && d.Key != "" {
				idx[d.Key] = p
			}
		}
		l.zips.close(p)
		return nil
	})
	if l.scanned == nil {
		l.scanned = map[string]map[string]string{}
	}
	l.scanned[root] = idx
	return idx
}

// ArchivePath returns the absolute path of a work's cbz ("" if none)
func (l *Library) ArchivePath(key string) string {
	if b, ok := l.st.Bookmark(key); ok && b.ArchiveFile != "" {
		// the user's own archives are in a local folder; the app's own files are in their site's save location
		p := filepath.Join(l.rootFor(key), toOS(b.ArchiveFile))
		if model.IsFileKey(key) {
			p = l.absPath(b.ArchiveFile)
		}
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	if model.IsFileKey(key) {
		return ""
	}
	root := l.rootFor(key)
	l.mu.Lock()
	p := l.scanIndex(root)[key]
	if p != "" {
		if _, err := os.Stat(p); err != nil {
			delete(l.scanned[root], key)
			p = ""
		}
	}
	l.mu.Unlock()
	if p == "" {
		return ""
	}
	// record a cbz found without a record in its bookmark
	if rel, err := filepath.Rel(root, p); err == nil {
		l.st.Update(key, func(b *model.Bookmark) { b.ArchiveFile = filepath.ToSlash(rel) })
	}
	return p
}

// setArchive records the cbz location ("" to delete)
func (l *Library) setArchive(key, abs string) {
	root := l.rootFor(key)
	l.mu.Lock()
	if idx := l.scanned[root]; idx != nil {
		if abs == "" {
			delete(idx, key)
		} else {
			idx[key] = abs
		}
	}
	l.mu.Unlock()
	rel := ""
	if abs != "" {
		if r, err := filepath.Rel(root, abs); err == nil {
			rel = filepath.ToSlash(r)
		}
	}
	l.st.Update(key, func(b *model.Bookmark) { b.ArchiveFile = rel })
}

// TargetName returns the cbz's relative path for the current format, creator info and series
func (l *Library) TargetName(d *model.GalleryDetail) string {
	var creator model.CreatorInfo
	title := d.DisplayTitle()
	if b, ok := l.st.Bookmark(d.Key); ok {
		creator = b.Creator
		if b.CustomTitle != "" {
			title = b.CustomTitle
		}
	}
	var sr SeriesRef
	if x, i, ok := l.st.SeriesOf(d.Key); ok {
		sr = SeriesRef{Name: x.Name, No: i + 1}
	}
	return FormatNameTitled(l.FormatFor(l.siteOf(d.Key)), d, creator, sr, title)
}

// FormatFor is the file name format of a site's works: the one chosen for the site, the one its plugin suggests,
// or the common one
func (l *Library) FormatFor(siteID model.SiteID) string {
	s := l.st.Settings()
	if f := s.SiteFileNameFormats[siteID]; f != "" {
		return f
	}
	if f := site.FileNameFormat(siteID); f != "" {
		return f
	}
	return s.FileNameFormat
}

// siteOf is the site a work's files belong to (a page range work: its source's site)
func (l *Library) siteOf(key string) model.SiteID {
	s, _, _ := model.ParseKey(key)
	if s == model.SiteLocal {
		if b, ok := l.st.Bookmark(key); ok && b.Summary.Origin != nil {
			s, _, _ = model.ParseKey(b.Summary.Origin.Key)
		}
	}
	return s
}

// targetPath returns the absolute save path from the format (adding the ID if it clashes with another work)
func (l *Library) targetPath(d *model.GalleryDetail, current string) string {
	rel := l.TargetName(d)
	root := l.rootFor(d.Key)
	for n := 0; n < 9; n++ {
		cand := rel
		if n > 0 {
			cand = withID(rel, d.ID, n)
		}
		p := filepath.Join(root, toOS(cand))
		if strings.EqualFold(p, current) {
			return p
		}
		if _, err := os.Stat(p); os.IsNotExist(err) {
			return p
		}
	}
	return filepath.Join(root, toOS(withID(rel, d.ID, 9)))
}

// removeEmptyDirs removes folders emptied by a move or delete, walking up to the save location they are in
func (l *Library) removeEmptyDirs(dir string) {
	dir = filepath.Clean(dir)
	root := ""
	for _, r := range l.roots() {
		if strings.HasPrefix(strings.ToLower(dir), strings.ToLower(r)+string(filepath.Separator)) {
			root = r
		}
	}
	if root == "" {
		return
	}
	for ; dir != root && strings.HasPrefix(dir, root); dir = filepath.Dir(dir) {
		if os.Remove(dir) != nil {
			return
		}
	}
}

// Relocate moves a cbz to the name given by the current format and creator info
func (l *Library) Relocate(key string) (string, error) {
	cur := l.ArchivePath(key)
	if !Owned(key) {
		return cur, nil // the user's own archives stay where they are
	}
	if cur == "" {
		return "", nil
	}
	d := l.LocalInfo(key)
	if d == nil {
		return cur, apperr.New("library.noInfo", "gallery info is missing")
	}
	dst := l.targetPath(d, cur)
	if dst == cur {
		return cur, nil
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return cur, err
	}
	release := l.zips.exclusive(cur, dst)
	defer release()
	if err := renameRetry(cur, dst); err != nil {
		return cur, err
	}
	l.setArchive(key, dst)
	l.removeEmptyDirs(filepath.Dir(cur))
	return dst, nil
}

// FindMissing returns the keys whose cbz cannot be found (e.g. deleted outside the app).
// Ones not at their recorded place are searched for by rescanning, and if only moved or renamed the new place is recorded.
// When the save folder itself is missing (e.g. an external drive is unplugged), it decides nothing and returns nil.
func (l *Library) FindMissing(keys []string) []string {
	var unsure []string
	for _, k := range keys {
		root := l.rootFor(k)
		if fi, err := os.Stat(root); err != nil || !fi.IsDir() {
			continue // the save folder itself is missing: nothing is known
		}
		if b, ok := l.st.Bookmark(k); ok && b.ArchiveFile != "" {
			if _, err := os.Stat(filepath.Join(root, toOS(b.ArchiveFile))); err == nil {
				continue
			}
		}
		unsure = append(unsure, k)
	}
	if len(unsure) == 0 {
		return nil
	}
	// the scan result is reused, so rebuild it to pick up outside changes
	l.mu.Lock()
	l.scanned = nil
	l.mu.Unlock()
	var missing []string
	for _, k := range unsure {
		if l.ArchivePath(k) == "" {
			missing = append(missing, k)
		}
	}
	return missing
}

// isArchive reports whether a file is a work file: cbz / zip, or a format from a plugin
func isArchive(p string) bool {
	ext := filepath.Ext(p)
	return strings.EqualFold(ext, ArchiveExt) || strings.EqualFold(ext, ".zip") || formatFor(p) != nil
}

// RenameLegacyExt renames .zip files saved by older versions to .cbz (keeping the rest of the name)
func (l *Library) RenameLegacyExt() (renamed int) {
	for _, b := range l.st.Bookmarks() {
		if !Owned(b.Key) {
			continue
		}
		cur := l.ArchivePath(b.Key)
		if !strings.EqualFold(filepath.Ext(cur), ".zip") {
			continue
		}
		dst := strings.TrimSuffix(cur, filepath.Ext(cur)) + ArchiveExt
		if _, err := os.Stat(dst); err == nil {
			continue // a file with the same name exists (it gets an ID-suffixed name when renamed by the format)
		}
		release := l.zips.exclusive(cur, dst)
		err := renameRetry(cur, dst)
		release()
		if err != nil {
			log.Printf("[library] %s: failed to rename to .cbz: %v", b.Key, err)
			continue
		}
		l.setArchive(b.Key, dst)
		renamed++
	}
	return renamed
}

// RelocateAll renames every bookmarked cbz with the current format
func (l *Library) RelocateAll() (moved int, errs []error) {
	for _, b := range l.st.Bookmarks() {
		before := l.ArchivePath(b.Key)
		if before == "" {
			continue
		}
		after, err := l.Relocate(b.Key)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", b.Key, err))
		} else if after != before {
			moved++
		}
	}
	return moved, errs
}
