package plugin

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"poruneko/internal/model"
)

// buildTestPlugin builds testdata/testsite into a .wasm (once per test run)
var buildOnce = sync.OnceValues(func() (string, error) {
	dir, err := os.MkdirTemp("", "poruneko-plugin")
	if err != nil {
		return "", err
	}
	out := filepath.Join(dir, "testsite.wasm")
	cmd := exec.Command("go", "build", "-buildmode=c-shared", "-o", out, ".")
	cmd.Dir = filepath.Join("testdata", "testsite")
	cmd.Env = append(os.Environ(), "GOOS=wasip1", "GOARCH=wasm")
	if b, err := cmd.CombinedOutput(); err != nil {
		return "", errors.New(string(b))
	}
	return out, nil
})

func loadTestPlugin(t *testing.T) *Plugin {
	t.Helper()
	path, err := buildOnce()
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	p, err := Load(path, "")
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestPluginCalls(t *testing.T) {
	p := loadTestPlugin(t)
	if p.Info.ID != "testsite" || p.Info.Kind != KindSite || !p.Info.Has("webURL") {
		t.Fatalf("info %+v", p.Info)
	}
	var echo map[string]any
	if err := p.Call(context.Background(), "echo", map[string]any{"a": "日本語", "n": 3}, &echo); err != nil || echo["a"] != "日本語" {
		t.Fatalf("echo %v %v", echo, err)
	}
	// errors keep their code; plain errors become plugin.error
	var pe *Error
	if err := p.Call(context.Background(), "nope", nil, nil); !errors.As(err, &pe) || pe.Code != "plugin.unknownMethod" {
		t.Fatalf("unknown method: %v", err)
	}
	if err := p.Call(context.Background(), "fail", nil, nil); !errors.As(err, &pe) || pe.Code != "plugin.error" {
		t.Fatalf("plain error: %v", err)
	}
}

func TestPluginFetch(t *testing.T) {
	p := loadTestPlugin(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("hello " + r.Header.Get("X-Test")))
	}))
	defer srv.Close()
	var body string
	if err := p.Call(context.Background(), "fetch", map[string]string{"url": srv.URL}, &body); err != nil || body != "hello 1" {
		t.Fatalf("fetch %q %v", body, err)
	}
	// hosts not in the plugin's info are refused
	other := strings.Replace(srv.URL, "127.0.0.1", "localhost", 1)
	err := p.Call(context.Background(), "fetch", map[string]string{"url": other}, &body)
	if err == nil || !strings.Contains(err.Error(), "not in the plugin's list") {
		t.Fatalf("other host: %v", err)
	}
}

// several calls at once use several instances
func TestPluginConcurrent(t *testing.T) {
	p := loadTestPlugin(t)
	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for i := range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			var n float64
			if err := p.Call(context.Background(), "echo", i, &n); err != nil || int(n) != i {
				errs <- errors.New("bad echo")
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	if p.count > maxInstances {
		t.Fatalf("%d instances", p.count)
	}
}

// a site plugin as a site: keys are filled in, optional methods follow the capabilities
func TestSiteAdapter(t *testing.T) {
	p := loadTestPlugin(t)
	s := Provider(p)
	if s.ID() != "testsite" || s.Name() != "Test Site" {
		t.Fatalf("%s %s", s.ID(), s.Name())
	}
	r, err := s.List(context.Background(), model.ListQuery{Page: 1})
	if err != nil || len(r.Items) != 1 || r.Items[0].Key != "testsite:42" || r.Items[0].Site != "testsite" {
		t.Fatalf("list %+v %v", r, err)
	}
	// what the plugin left out is filled in (the screens expect arrays)
	if r.Failed == nil || r.Items[0].Artists == nil || r.Items[0].Tags == nil {
		t.Fatalf("lists left null: %+v", r)
	}
	if u := s.(*Site).WebURL("42"); u != "https://127.0.0.1/w/42" {
		t.Fatalf("webURL %q", u)
	}
	// no tagNamesJa capability: an empty map, without calling
	if n := s.(*Site).TagNamesJa(); len(n) != 0 {
		t.Fatalf("tag names %v", n)
	}
}
