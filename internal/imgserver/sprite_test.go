package imgserver

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"

	"poruneko/internal/site"
)

// a sprite of four 10x20 tiles in a row, each a color of its own, is fetched once and cut into its tiles
func TestSpriteTiles(t *testing.T) {
	colors := []color.RGBA{{255, 0, 0, 255}, {0, 255, 0, 255}, {0, 0, 255, 255}, {255, 255, 0, 255}}
	img := image.NewRGBA(image.Rect(0, 0, 40, 20))
	for x := 0; x < 40; x++ {
		for y := 0; y < 20; y++ {
			img.Set(x, y, colors[x/10])
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		_, _ = w.Write(buf.Bytes())
	}))
	defer srv.Close()

	s := newSprites()
	var wg sync.WaitGroup
	for i := range colors {
		wg.Add(1)
		go func() {
			defer wg.Done()
			b, err := s.tile(context.Background(), &site.ImageSource{URL: srv.URL, Crop: &site.Crop{X: i * 10, Y: 0, W: 10, H: 20}})
			if err != nil {
				t.Errorf("tile %d: %v", i, err)
				return
			}
			out, err := jpeg.Decode(bytes.NewReader(b))
			if err != nil {
				t.Errorf("tile %d: %v", i, err)
				return
			}
			if out.Bounds().Dx() != 10 || out.Bounds().Dy() != 20 {
				t.Errorf("tile %d is %v", i, out.Bounds())
			}
			r, g, bl, _ := out.At(5, 10).RGBA()
			want := colors[i]
			if abs(int(r>>8)-int(want.R)) > 40 || abs(int(g>>8)-int(want.G)) > 40 || abs(int(bl>>8)-int(want.B)) > 40 {
				t.Errorf("tile %d has color %d,%d,%d, want %v", i, r>>8, g>>8, bl>>8, want)
			}
		}()
	}
	wg.Wait()
	if n := hits.Load(); n != 1 {
		t.Errorf("the sprite was fetched %d times, want 1", n)
	}
	if _, err := s.tile(context.Background(), &site.ImageSource{URL: srv.URL, Crop: &site.Crop{X: 100, Y: 0, W: 10, H: 10}}); err == nil {
		t.Error("a tile outside the picture should fail")
	}
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
