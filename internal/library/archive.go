package library

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/model"
)

const comicInfoEntry = "ComicInfo.xml"

// ---------------------------------------------------------------- Cache of open zips

type openZip struct {
	rc    *zip.ReadCloser
	pages map[int]*zip.File // page number (0-based) -> entry
	files map[string]*zip.File
}

// zipCache keeps open readers so zips are not reopened on every view
type zipCache struct {
	mu    sync.Mutex
	max   int
	m     map[string]*openZip
	order []string
	// busy holds zips being rewritten, moved or deleted (not opened meanwhile; on Windows an open file cannot be replaced)
	busy map[string]int
	idle *sync.Cond
}

func newZipCache(max int) *zipCache {
	c := &zipCache{max: max, m: map[string]*openZip{}, busy: map[string]int{}}
	c.idle = sync.NewCond(&c.mu)
	return c
}

// exclusive closes the zip and keeps it from being opened until release is called (used while rewriting, moving or deleting)
func (c *zipCache) exclusive(paths ...string) (release func()) {
	c.mu.Lock()
	for _, p := range paths {
		if p == "" {
			continue
		}
		c.busy[p]++
		c.closeLocked(p)
	}
	c.mu.Unlock()
	return func() {
		c.mu.Lock()
		for _, p := range paths {
			if p == "" {
				continue
			}
			if c.busy[p]--; c.busy[p] <= 0 {
				delete(c.busy, p)
			}
		}
		c.mu.Unlock()
		c.idle.Broadcast()
	}
}

func (c *zipCache) open(path string) (*openZip, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for c.busy[path] > 0 {
		c.idle.Wait() // wait until the rewrite finishes
	}
	if z, ok := c.m[path]; ok {
		return z, nil
	}
	rc, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	z := &openZip{rc: rc, pages: map[int]*zip.File{}, files: map[string]*zip.File{}}
	for _, f := range rc.File {
		z.files[f.Name] = f
		base := strings.TrimSuffix(filepath.Base(f.Name), filepath.Ext(f.Name))
		if n, err := strconv.Atoi(base); err == nil && n > 0 && isImage(f.Name) {
			z.pages[n-1] = f
		}
	}
	if len(c.order) >= c.max {
		old := c.order[0]
		c.order = c.order[1:]
		c.m[old].rc.Close()
		delete(c.m, old)
	}
	c.m[path] = z
	c.order = append(c.order, path)
	return z, nil
}

// close closes the file before a rewrite or delete (on Windows an open file cannot be replaced)
func (c *zipCache) close(path string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.closeLocked(path)
}

// closeAll closes all open files
func (c *zipCache) closeAll() {
	c.mu.Lock()
	defer c.mu.Unlock()
	for p, z := range c.m {
		z.rc.Close()
		delete(c.m, p)
	}
	c.order = nil
}

func (c *zipCache) closeLocked(path string) {
	if z, ok := c.m[path]; ok {
		z.rc.Close()
		delete(c.m, path)
		c.order = slices.DeleteFunc(c.order, func(p string) bool { return p == path })
	}
}

func readFile(f *zip.File) ([]byte, error) {
	r, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}

func (c *zipCache) readPage(path string, index int) ([]byte, string, error) {
	z, err := c.open(path)
	if err != nil {
		return nil, "", err
	}
	f, ok := z.pages[index]
	if !ok {
		return nil, "", os.ErrNotExist
	}
	b, err := readFile(f)
	return b, strings.TrimPrefix(filepath.Ext(f.Name), "."), err
}

// readEntryNoWait returns an error instead of waiting if the zip is being rewritten (used for indexing, to avoid lock waits)
func (c *zipCache) readEntryNoWait(path, name string) ([]byte, error) {
	c.mu.Lock()
	busy := c.busy[path] > 0
	c.mu.Unlock()
	if busy {
		return nil, errors.New("zip is being rewritten")
	}
	return c.readEntry(path, name)
}

func (c *zipCache) readEntry(path, name string) ([]byte, error) {
	z, err := c.open(path)
	if err != nil {
		return nil, err
	}
	f, ok := z.files[name]
	if !ok {
		return nil, os.ErrNotExist
	}
	return readFile(f)
}

func isImage(name string) bool {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
	return slices.Contains(imageExts, ext)
}

// ---------------------------------------------------------------- Packing

// Pack packs the pages in a work dir into the work's cbz and deletes the work dir
func (l *Library) Pack(key string, d *model.GalleryDetail) (string, error) {
	work := l.WorkDir(key)
	pages := make([]string, len(d.Pages))
	for i := range d.Pages {
		p := l.workPage(key, i)
		if p == "" {
			return "", apperr.New("download.pageMissing", fmt.Sprintf("page %d is missing", i+1), "page", i+1)
		}
		pages[i] = p
	}

	old := l.ArchivePath(key)
	out := l.targetPath(d, old)
	tmp := out + ".part"
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		return "", err
	}
	if err := l.writeZip(tmp, d, func(w *zip.Writer) error {
		for _, p := range pages {
			// images are already compressed, so store them uncompressed
			hw, err := w.CreateHeader(&zip.FileHeader{Name: filepath.Base(p), Method: zip.Store, Modified: time.Now()})
			if err != nil {
				return err
			}
			f, err := os.Open(p)
			if err != nil {
				return err
			}
			_, err = io.Copy(hw, f)
			f.Close()
			if err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		os.Remove(tmp)
		return "", err
	}

	// when rebuilding, replace the old file
	release := l.zips.exclusive(old, out)
	if old != "" && old != out {
		_ = removeRetry(old)
		l.removeEmptyDirs(filepath.Dir(old))
	}
	err := renameRetry(tmp, out)
	release()
	if err != nil {
		os.Remove(tmp)
		return "", err
	}
	l.setArchive(key, out)
	_ = os.RemoveAll(work)
	l.removeEmptyDirs(filepath.Dir(work))
	return out, nil
}

// writeZip writes a zip with the common non-page entries (ComicInfo.xml / poruneko.json)
func (l *Library) writeZip(path string, d *model.GalleryDetail, body func(w *zip.Writer) error) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	w := zip.NewWriter(f)
	err = body(w)
	if err == nil {
		err = l.writeMeta(w, d)
	}
	if cerr := w.Close(); err == nil {
		err = cerr
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	return err
}

func (l *Library) writeMeta(w *zip.Writer, d *model.GalleryDetail) error {
	var creator model.CreatorInfo
	customTitle := ""
	if b, ok := l.st.Bookmark(d.Key); ok {
		creator, customTitle = b.Creator, b.CustomTitle
	}
	ci, err := comicInfo(d, creator, customTitle)
	if err != nil {
		return err
	}
	if err := writeEntry(w, comicInfoEntry, ci); err != nil {
		return err
	}
	meta, err := json.MarshalIndent(d, "", " ")
	if err != nil {
		return err
	}
	return writeEntry(w, metaEntry, meta)
}

func writeEntry(w *zip.Writer, name string, data []byte) error {
	hw, err := w.Create(name)
	if err != nil {
		return err
	}
	_, err = hw.Write(data)
	return err
}

// RefreshMeta applies creator info changes to ComicInfo.xml in the cbz (pages are copied without recompressing)
func (l *Library) RefreshMeta(key string) error {
	return l.UpdateInfo(key, nil)
}

// UpdateInfo rewrites the work info in the cbz (poruneko.json) and updates ComicInfo.xml and the file name to match.
// If fn is nil the work info is kept and only creator info changes are applied.
func (l *Library) UpdateInfo(key string, fn func(d *model.GalleryDetail)) error {
	path := l.ArchivePath(key)
	if path == "" {
		return nil
	}
	d := l.LocalInfo(key)
	if d == nil {
		return apperr.New("library.noInfo", "gallery info is missing")
	}
	if fn != nil {
		fn(d)
	}
	src, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	tmp := path + ".part"
	err = l.writeZip(tmp, d, func(w *zip.Writer) error {
		for _, f := range src.File {
			if f.Name == comicInfoEntry || f.Name == metaEntry {
				continue
			}
			if err := w.Copy(f); err != nil {
				return err
			}
		}
		return nil
	})
	src.Close()
	if err != nil {
		os.Remove(tmp)
		return err
	}
	release := l.zips.exclusive(path)
	err = renameRetry(tmp, path)
	release()
	if err != nil {
		os.Remove(tmp)
		return err
	}
	// if the format includes the creator or circle, update the name too
	_, err = l.Relocate(key)
	return err
}

// Close closes all open cbz files (on exit)
func (l *Library) Close() { l.zips.closeAll() }

// retryFS performs a file operation with retries. On Windows antivirus software and the like can briefly
// hold a file and make the operation fail, so wait a little and retry a few times.
func retryFS(op func() error) error {
	var err error
	for i := 0; i < 10; i++ {
		if err = op(); err == nil {
			return nil
		}
		time.Sleep(time.Duration(100*(i+1)) * time.Millisecond)
	}
	return err
}

// renameRetry renames a file (waiting a little and retrying if it is held)
func renameRetry(from, to string) error {
	return retryFS(func() error { return os.Rename(from, to) })
}

// removeRetry deletes a file (waiting a little and retrying if it is held; a missing file counts as success)
func removeRetry(path string) error {
	return retryFS(func() error {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	})
}
