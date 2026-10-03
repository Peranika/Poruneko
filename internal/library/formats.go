package library

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

// Archive formats the app does not read itself (cbz / zip are built in) come from plugins, such as Susie archive
// plug-ins. A format lists an archive's entries and reads one entry; the library does the rest (page order,
// ComicInfo.xml, thumbnails). Page sizes are not read for these formats (that would decompress every page)

// ArchiveEntry is a file in an archive
type ArchiveEntry struct {
	Name string // path in the archive, "/"-separated
	Size int64
	Pos  int64 // where the format finds it (its own meaning)
}

// ArchiveFormat reads an archive format
type ArchiveFormat interface {
	// Name is the format's name for logs and the settings screen
	Name() string
	// Extensions are the file extensions it reads (".rar")
	Extensions() []string
	// Supports checks a file (its contents too) before Entries is used
	Supports(path string) bool
	Entries(path string) ([]ArchiveEntry, error)
	Read(path string, e ArchiveEntry) ([]byte, error)
}

var (
	formatsMu sync.RWMutex
	formats   []ArchiveFormat
)

// RegisterFormat adds an archive format (the first registered wins for an extension)
func RegisterFormat(f ArchiveFormat) {
	formatsMu.Lock()
	formats = append(formats, f)
	formatsMu.Unlock()
}

// formatFor is the plugin format reading a file by its extension (nil for zip / cbz, which are built in)
func formatFor(path string) ArchiveFormat {
	ext := strings.ToLower(filepath.Ext(path))
	if ext == ".zip" || strings.EqualFold(ext, ArchiveExt) {
		return nil
	}
	formatsMu.RLock()
	defer formatsMu.RUnlock()
	for _, f := range formats {
		for _, e := range f.Extensions() {
			if strings.EqualFold(e, ext) {
				return f
			}
		}
	}
	return nil
}

// pluginArchive is the listing of an archive read by a plugin format
type pluginArchive struct {
	format  ArchiveFormat
	modTime time.Time
	pages   []ArchiveEntry // images in reading order
	files   map[string]ArchiveEntry
}

var (
	pluginArchivesMu sync.Mutex
	pluginArchives   = map[string]*pluginArchive{}
)

// openPlugin lists an archive with its plugin format (cached until the file changes)
func openPlugin(path string, f ArchiveFormat) (*pluginArchive, error) {
	fi, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	pluginArchivesMu.Lock()
	a, ok := pluginArchives[path]
	pluginArchivesMu.Unlock()
	if ok && a.modTime.Equal(fi.ModTime()) {
		return a, nil
	}
	if !f.Supports(path) {
		return nil, os.ErrInvalid
	}
	entries, err := f.Entries(path)
	if err != nil {
		return nil, err
	}
	a = &pluginArchive{format: f, modTime: fi.ModTime(), files: map[string]ArchiveEntry{}}
	for _, e := range entries {
		a.files[e.Name] = e
		if isPageEntry(e.Name) {
			a.pages = append(a.pages, e)
		}
	}
	slices.SortStableFunc(a.pages, func(x, y ArchiveEntry) int { return naturalCompare(x.Name, y.Name) })
	pluginArchivesMu.Lock()
	pluginArchives[path] = a
	pluginArchivesMu.Unlock()
	return a, nil
}

// readPluginPage reads page index of an archive in a plugin format
func readPluginPage(path string, f ArchiveFormat, index int) ([]byte, string, error) {
	a, err := openPlugin(path, f)
	if err != nil {
		return nil, "", err
	}
	if index < 0 || index >= len(a.pages) {
		return nil, "", os.ErrNotExist
	}
	e := a.pages[index]
	b, err := f.Read(path, e)
	if err != nil {
		return nil, "", err
	}
	return b, strings.TrimPrefix(strings.ToLower(filepath.Ext(e.Name)), "."), nil
}
