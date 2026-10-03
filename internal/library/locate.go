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
)

// Managing cbz locations. The location is recorded in the bookmark's ArchiveFile, and a cbz without a record
// is identified by reading its poruneko.json. The save name is decided by the file name format (naming.go).

// scanIndex scans the cbz files in libraryDir and reads the work keys from poruneko.json
func (l *Library) scanIndex() map[string]string {
	root := l.root()
	if l.scanned != nil && l.scanRoot == root {
		return l.scanned
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
		if !isArchive(p) {
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
	l.scanned, l.scanRoot = idx, root
	return idx
}

// ArchivePath returns the absolute path of a work's cbz ("" if none)
func (l *Library) ArchivePath(key string) string {
	if b, ok := l.st.Bookmark(key); ok && b.ArchiveFile != "" {
		p := filepath.Join(l.root(), toOS(b.ArchiveFile))
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	l.mu.Lock()
	p := l.scanIndex()[key]
	if p != "" {
		if _, err := os.Stat(p); err != nil {
			delete(l.scanned, key)
			p = ""
		}
	}
	l.mu.Unlock()
	if p == "" {
		return ""
	}
	// record a cbz found without a record in its bookmark
	if rel, err := filepath.Rel(l.root(), p); err == nil {
		l.st.Update(key, func(b *model.Bookmark) { b.ArchiveFile = filepath.ToSlash(rel) })
	}
	return p
}

// setArchive records the cbz location ("" to delete)
func (l *Library) setArchive(key, abs string) {
	l.mu.Lock()
	if l.scanned != nil {
		if abs == "" {
			delete(l.scanned, key)
		} else {
			l.scanned[key] = abs
		}
	}
	l.mu.Unlock()
	rel := ""
	if abs != "" {
		if r, err := filepath.Rel(l.root(), abs); err == nil {
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
	return FormatNameTitled(l.st.Settings().FileNameFormat, d, creator, sr, title)
}

// targetPath returns the absolute save path from the format (adding the ID if it clashes with another work)
func (l *Library) targetPath(d *model.GalleryDetail, current string) string {
	rel := l.TargetName(d)
	for n := 0; n < 9; n++ {
		cand := rel
		if n > 0 {
			cand = withID(rel, d.ID, n)
		}
		p := filepath.Join(l.root(), toOS(cand))
		if strings.EqualFold(p, current) {
			return p
		}
		if _, err := os.Stat(p); os.IsNotExist(err) {
			return p
		}
	}
	return filepath.Join(l.root(), toOS(withID(rel, d.ID, 9)))
}

// removeEmptyDirs removes folders emptied by a move or delete, walking up to libraryDir
func (l *Library) removeEmptyDirs(dir string) {
	root := filepath.Clean(l.root())
	for dir = filepath.Clean(dir); dir != root && strings.HasPrefix(dir, root); dir = filepath.Dir(dir) {
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
	if fi, err := os.Stat(l.root()); err != nil || !fi.IsDir() {
		return nil
	}
	var unsure []string
	for _, k := range keys {
		if b, ok := l.st.Bookmark(k); ok && b.ArchiveFile != "" {
			if _, err := os.Stat(filepath.Join(l.root(), toOS(b.ArchiveFile))); err == nil {
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

// isArchive reports whether a file is a work file (including .zip from older versions)
func isArchive(p string) bool {
	ext := filepath.Ext(p)
	return strings.EqualFold(ext, ArchiveExt) || strings.EqualFold(ext, ".zip")
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
