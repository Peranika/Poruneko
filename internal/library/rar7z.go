package library

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"github.com/bodgit/sevenzip"
	"github.com/nwaples/rardecode/v2"
)

// RAR and 7z archives, read by the app itself (pure Go, no plug-in needed): registered as archive formats like
// the Susie plug-ins, before them, so a format the app reads itself is not handed to one. An archive being read is
// kept open (a solid archive is decompressed from its start: reading its pages in order goes on from where the
// last one ended) and closed once idle, so the file can be moved or deleted

func init() {
	RegisterFormat(builtinFormat{name: "RAR", exts: []string{".rar", ".cbr"}, magic: [][]byte{[]byte("Rar!\x1a\x07")}, open: openRar})
	RegisterFormat(builtinFormat{name: "7z", exts: []string{".7z", ".cb7"}, magic: [][]byte{[]byte("7z\xbc\xaf\x27\x1c")}, open: open7z})
}

// heldIdle is how long an archive stays open after it was last read
const heldIdle = 30 * time.Second

// openArchive is an archive opened by a built-in format
type openArchive interface {
	entries() []ArchiveEntry
	read(e ArchiveEntry) ([]byte, error)
	close()
}

type builtinFormat struct {
	name  string
	exts  []string
	magic [][]byte
	open  func(path string) (openArchive, error)
}

func (f builtinFormat) Name() string         { return f.name }
func (f builtinFormat) Extensions() []string { return f.exts }

// Supports checks the file's signature (an archive named .rar may be something else)
func (f builtinFormat) Supports(path string) bool {
	fh, err := os.Open(path)
	if err != nil {
		return false
	}
	defer fh.Close()
	head := make([]byte, 8)
	n, _ := io.ReadFull(fh, head)
	for _, m := range f.magic {
		if bytes.HasPrefix(head[:n], m) {
			return true
		}
	}
	return false
}

func (f builtinFormat) Entries(path string) ([]ArchiveEntry, error) {
	var out []ArchiveEntry
	err := withHeld(path, f.open, func(a openArchive) error {
		out = a.entries()
		return nil
	})
	return out, err
}

func (f builtinFormat) Read(path string, e ArchiveEntry) ([]byte, error) {
	var b []byte
	err := withHeld(path, f.open, func(a openArchive) (err error) {
		b, err = a.read(e)
		return err
	})
	return b, err
}

// ---------------------------------------------------------------- Archives kept open

type heldArchive struct {
	mu      sync.Mutex // one read at a time (a solid archive is read in order)
	a       openArchive
	modTime time.Time
	used    time.Time
}

var (
	heldMu   sync.Mutex
	held     = map[string]*heldArchive{}
	heldOnce sync.Once
)

// withHeld runs fn with the archive at path open (opened again when the file changed)
func withHeld(path string, open func(string) (openArchive, error), fn func(openArchive) error) error {
	fi, err := os.Stat(path)
	if err != nil {
		return err
	}
	heldOnce.Do(func() { go closeIdleHeld() })
	heldMu.Lock()
	h := held[path]
	if h == nil {
		h = &heldArchive{}
		held[path] = h
	}
	heldMu.Unlock()

	h.mu.Lock()
	defer h.mu.Unlock()
	if h.a != nil && !h.modTime.Equal(fi.ModTime()) {
		h.a.close()
		h.a = nil
	}
	if h.a == nil {
		if h.a, err = open(path); err != nil {
			return err
		}
		h.modTime = fi.ModTime()
	}
	h.used = time.Now()
	return fn(h.a)
}

// closeHeld closes an archive kept open (before the file is moved or deleted)
func closeHeld(path string) {
	heldMu.Lock()
	h := held[path]
	delete(held, path)
	heldMu.Unlock()
	if h != nil {
		h.mu.Lock()
		if h.a != nil {
			h.a.close()
			h.a = nil
		}
		h.mu.Unlock()
	}
}

func closeIdleHeld() {
	for range time.Tick(heldIdle / 3) {
		heldMu.Lock()
		var idle []string
		for p, h := range held {
			if h.mu.TryLock() {
				if time.Since(h.used) > heldIdle {
					idle = append(idle, p)
				}
				h.mu.Unlock()
			}
		}
		heldMu.Unlock()
		for _, p := range idle {
			closeHeld(p)
		}
	}
}

// ---------------------------------------------------------------- RAR

type rarArchive struct {
	path  string
	files []*rardecode.File
	// seq reads a solid archive in order, from where the last file read ended
	seq *rardecode.ReadCloser
}

func openRar(path string) (openArchive, error) {
	files, err := rardecode.List(path)
	if err != nil {
		return nil, err
	}
	return &rarArchive{path: path, files: files}, nil
}

func (r *rarArchive) entries() []ArchiveEntry {
	var out []ArchiveEntry
	for i, f := range r.files {
		if !f.IsDir {
			out = append(out, ArchiveEntry{Name: f.Name, Size: f.UnPackedSize, Pos: int64(i)})
		}
	}
	return out
}

func (r *rarArchive) read(e ArchiveEntry) ([]byte, error) {
	i := int(e.Pos)
	if i < 0 || i >= len(r.files) {
		return nil, os.ErrNotExist
	}
	f := r.files[i]
	if f.Encrypted {
		return nil, errors.New("the archive is encrypted")
	}
	if !f.Solid {
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		defer rc.Close()
		return io.ReadAll(rc)
	}
	// a solid file is decompressed after the ones before it: go on from the last one read (reading in order), else
	// start over from the beginning
	for attempt := range 2 {
		if r.seq == nil || attempt > 0 {
			r.closeSeq()
			seq, err := rardecode.OpenReader(r.path)
			if err != nil {
				return nil, err
			}
			r.seq = seq
		}
		for {
			h, err := r.seq.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				r.closeSeq()
				return nil, err
			}
			if h.Name == f.Name {
				return io.ReadAll(r.seq)
			}
		}
	}
	r.closeSeq()
	return nil, fmt.Errorf("%s is not in the archive", f.Name)
}

func (r *rarArchive) closeSeq() {
	if r.seq != nil {
		r.seq.Close()
		r.seq = nil
	}
}

func (r *rarArchive) close() { r.closeSeq() }

// ---------------------------------------------------------------- 7z

// sevenArchive keeps the archive open: reading its files in order reuses the decompression of a solid block
type sevenArchive struct{ rc *sevenzip.ReadCloser }

func open7z(path string) (openArchive, error) {
	rc, err := sevenzip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	return &sevenArchive{rc: rc}, nil
}

func (s *sevenArchive) entries() []ArchiveEntry {
	var out []ArchiveEntry
	for i, f := range s.rc.File {
		if !f.FileInfo().IsDir() {
			out = append(out, ArchiveEntry{Name: f.Name, Size: int64(f.UncompressedSize), Pos: int64(i)})
		}
	}
	return out
}

func (s *sevenArchive) read(e ArchiveEntry) ([]byte, error) {
	i := int(e.Pos)
	if i < 0 || i >= len(s.rc.File) {
		return nil, os.ErrNotExist
	}
	rc, err := s.rc.File[i].Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

func (s *sevenArchive) close() { s.rc.Close() }
