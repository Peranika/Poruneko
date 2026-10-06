package imgserver

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/draw"
	"image/jpeg"
	_ "image/png"
	"sync"
	"time"

	_ "golang.org/x/image/webp"

	"poruneko/internal/netx"
	"poruneko/internal/site"
)

// Sprites: a site whose page thumbnails are tiles of one picture gives the picture and each tile's rectangle
// (ImageSource.Crop). The picture is fetched once (several thumbnails asking for it at the same time wait for the
// same fetch), kept decoded for a while, and each tile is cut out as a JPEG

// spriteCacheTime / spriteCacheMax limit the decoded pictures kept
const (
	spriteCacheTime = 10 * time.Minute
	spriteCacheMax  = 40
)

type sprites struct {
	cache   *netx.Cache[image.Image]
	mu      sync.Mutex
	loading map[string]*spriteLoad
}

type spriteLoad struct {
	done chan struct{}
	img  image.Image
	err  error
}

func newSprites() *sprites {
	return &sprites{cache: netx.NewCache[image.Image](spriteCacheTime, spriteCacheMax), loading: map[string]*spriteLoad{}}
}

// picture is the decoded picture at a URL, fetched once for everyone asking for it
func (s *sprites) picture(ctx context.Context, src *site.ImageSource) (image.Image, error) {
	if img, ok := s.cache.Get(src.URL); ok {
		return img, nil
	}
	s.mu.Lock()
	l := s.loading[src.URL]
	if l == nil {
		l = &spriteLoad{done: make(chan struct{})}
		s.loading[src.URL] = l
		go func() {
			// not tied to the first asker: the others may still want it when it gives up
			fctx, cancel := context.WithTimeout(context.Background(), time.Minute)
			defer cancel()
			res, err := netx.Get(fctx, src.URL, &netx.Opts{Headers: src.Headers})
			if err == nil {
				l.img, _, err = image.Decode(bytes.NewReader(res.Body))
			}
			l.err = err
			if err == nil {
				s.cache.Set(src.URL, l.img)
			}
			s.mu.Lock()
			delete(s.loading, src.URL)
			s.mu.Unlock()
			close(l.done)
		}()
	}
	s.mu.Unlock()
	select {
	case <-l.done:
		return l.img, l.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// tile is a tile of the picture at src as a JPEG
func (s *sprites) tile(ctx context.Context, src *site.ImageSource) ([]byte, error) {
	img, err := s.picture(ctx, src)
	if err != nil {
		return nil, err
	}
	c := src.Crop
	b := img.Bounds()
	r := image.Rect(b.Min.X+c.X, b.Min.Y+c.Y, b.Min.X+c.X+c.W, b.Min.Y+c.Y+c.H).Intersect(b)
	if r.Empty() {
		return nil, fmt.Errorf("the tile %+v is outside the picture (%dx%d)", *c, b.Dx(), b.Dy())
	}
	out := image.NewRGBA(image.Rect(0, 0, r.Dx(), r.Dy()))
	draw.Draw(out, out.Bounds(), img, r.Min, draw.Src)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, out, &jpeg.Options{Quality: 90}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
