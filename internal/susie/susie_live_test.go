//go:build windows

package susie

import (
	"os"
	"strings"
	"testing"
)

// TestRealPlugin runs a real Susie archive plug-in on real archives. It runs only when
// PORUNEKO_SUSIE_PLUGIN (a .sph) and PORUNEKO_SUSIE_ARCHIVES (archives separated by "|") are set.
func TestRealPlugin(t *testing.T) {
	plugin, archives := os.Getenv("PORUNEKO_SUSIE_PLUGIN"), os.Getenv("PORUNEKO_SUSIE_ARCHIVES")
	if plugin == "" || archives == "" {
		t.Skip("PORUNEKO_SUSIE_PLUGIN / PORUNEKO_SUSIE_ARCHIVES not set")
	}
	p, err := Load(plugin)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("plug-in %q, unicode %v, extensions %v", p.Description, p.unicode, p.Extensions)
	for _, a := range strings.Split(archives, "|") {
		if !p.Supports(a) {
			t.Errorf("%s: not supported", a)
			continue
		}
		list, err := p.Entries(a)
		if err != nil {
			t.Errorf("%s: %v", a, err)
			continue
		}
		t.Logf("%s: %d entries, first %+v", a, len(list), list[:min(3, len(list))])
		for _, e := range list {
			if e.Size > 0 {
				b, err := p.Read(a, e)
				if err != nil || int64(len(b)) != e.Size {
					t.Errorf("%s: read %s: %d bytes, %v", a, e.Name, len(b), err)
				} else {
					t.Logf("read %s: %d bytes, starts %x", e.Name, len(b), b[:min(12, len(b))])
				}
				break
			}
		}
	}
}
