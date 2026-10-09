package plugin

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"poruneko/internal/model"
)

// Loads the plugins built for the app (PORUNEKO_PLUGIN_DIR: a folder of .wasm files) and checks what they tell:
// for checking plugins after the interface changes (skipped otherwise)
func TestInstalledPlugins(t *testing.T) {
	dir := os.Getenv("PORUNEKO_PLUGIN_DIR")
	if dir == "" {
		t.Skip("PORUNEKO_PLUGIN_DIR is not set")
	}
	files, _ := filepath.Glob(filepath.Join(dir, "*.wasm"))
	if len(files) == 0 {
		t.Fatalf("no plugins in %s", dir)
	}
	for _, f := range files {
		p, err := Load(f, t.TempDir())
		if err != nil {
			t.Errorf("%s: %v", filepath.Base(f), err)
			continue
		}
		i := p.Info
		if i.Browse == nil || len(i.Hosts) == 0 {
			t.Errorf("%s: info %+v", i.ID, i)
		}
		t.Logf("%s %s: features %v, favorites %+v, creators from site %v", i.ID, i.Version, i.Features, i.Favorites, i.Creators.FromSite)
	}
}

// With PORUNEKO_PLUGIN_LIVE set too, each plugin named there (comma-separated ids) reads its site: the first list
// page, its first work, and where that work's first page and thumbnail are
func TestInstalledPluginsLive(t *testing.T) {
	dir, live := os.Getenv("PORUNEKO_PLUGIN_DIR"), os.Getenv("PORUNEKO_PLUGIN_LIVE")
	if dir == "" || live == "" {
		t.Skip("PORUNEKO_PLUGIN_DIR / PORUNEKO_PLUGIN_LIVE are not set")
	}
	ctx := context.Background()
	for _, id := range strings.Split(live, ",") {
		p, err := Load(filepath.Join(dir, id+".wasm"), t.TempDir())
		if err != nil {
			t.Errorf("%s: %v", id, err)
			continue
		}
		s := Provider(p)
		r, err := s.List(ctx, model.ListQuery{Page: 1, Filters: map[string]string{}})
		if err != nil || len(r.Items) == 0 {
			t.Errorf("%s: list %v (%d works)", id, err, len(r.Items))
			continue
		}
		first := r.Items[0]
		d, err := s.Gallery(ctx, first.ID)
		if err != nil || len(d.Pages) == 0 {
			t.Errorf("%s: work %s: %v", id, first.Key, err)
			continue
		}
		img, err := s.Image(ctx, first.ID, 0, false)
		if err != nil || img.URL == "" {
			t.Errorf("%s: page: %v", id, err)
		}
		thumb, err := s.Thumb(ctx, first.ID, 0, true, false)
		if err != nil || thumb.URL == "" {
			t.Errorf("%s: thumb: %v", id, err)
		}
		t.Logf("%s: %d works; %s %q: %d pages, page %s, thumb %s", id, len(r.Items), first.Key, d.Title, len(d.Pages), img.URL, thumb.URL)
	}
}
