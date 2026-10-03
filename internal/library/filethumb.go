package library

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"image"
	"image/jpeg"
	"os"
	"path/filepath"

	"golang.org/x/image/draw"

	"poruneko/internal/model"
	"poruneko/internal/store"
)

// Thumbnails of the user's archives: a page decoded once, shrunk and saved as a small JPEG, so lists with many
// works do not decode full-size pages. The cached file is named after the archive's modification time, so a
// changed archive gets new thumbnails.

// thumbWidth is the width of a big (list cover) / small (page list) thumbnail
func thumbWidth(big bool) int {
	if big {
		return 480
	}
	return 240
}

// FileThumb returns a thumbnail of a page of a user's archive: the cached JPEG, made now if needed. ok is false
// when the page cannot be decoded (e.g. AVIF); the caller then serves the page itself
func (l *Library) FileThumb(key string, index int, big bool) (data []byte, ok bool) {
	_, rel, err := model.ParseKey(key)
	if err != nil {
		return nil, false
	}
	sum := sha1.Sum(fmt.Appendf(nil, "%s|%d|%d|%t", key, l.ArchiveModTime(rel), index, big))
	path := filepath.Join(store.DataDir(), "thumbs", "files", hex.EncodeToString(sum[:])+".jpg")
	if b, err := os.ReadFile(path); err == nil {
		return b, true
	}
	page, _, ok := l.ReadPage(key, index)
	if !ok {
		return nil, false
	}
	src, _, err := image.Decode(bytes.NewReader(page))
	if err != nil {
		return nil, false
	}
	b := src.Bounds()
	w := thumbWidth(big)
	if b.Dx() <= w {
		// already small: the page itself is the thumbnail
		return page, true
	}
	h := max(1, b.Dy()*w/b.Dx())
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Src, nil)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 85}); err != nil {
		return nil, false
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err == nil {
		_ = writeAtomic(path, buf.Bytes())
	}
	return buf.Bytes(), true
}
