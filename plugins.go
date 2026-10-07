package main

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"poruneko/internal/apperr"
	"poruneko/internal/library"
	"poruneko/internal/plugin"
	"poruneko/internal/site"
	"poruneko/internal/store"
	"poruneko/internal/susie"
)

// pluginDirs are where plugins (.wasm) are looked for: "plugins" next to the exe, then in the data folder
func pluginDirs() []string {
	var dirs []string
	if exe, err := os.Executable(); err == nil {
		dirs = append(dirs, filepath.Join(filepath.Dir(exe), "plugins"))
	}
	return append(dirs, filepath.Join(store.DataDir(), "plugins"))
}

// loaded are the plugins found at startup, and the Susie archive plug-ins
var (
	loaded      []*plugin.Plugin
	loadedSusie []*susie.Plugin
)

// loadPlugins loads the plugins and registers the site plugins as sites (the first id found wins). Each call to a
// plugin carries its settings from st
func loadPlugins(st *store.Store) {
	cache := filepath.Join(store.DataDir(), "plugincache")
	seen := map[string]bool{}
	for _, dir := range pluginDirs() {
		for _, p := range plugin.LoadDir(dir, cache) {
			if seen[p.Info.ID] {
				continue
			}
			seen[p.Info.ID] = true
			id := p.Info.ID
			p.Settings = func() map[string]string { return st.Settings().PluginSettings[id] }
			loaded = append(loaded, p)
			if p.Info.Kind == plugin.KindSite {
				site.Register(plugin.Provider(p))
			}
		}
		loadSusie(dir)
	}
}

// loadSusie loads the Susie 64-bit archive plug-ins (.sph) in dir and registers their formats
func loadSusie(dir string) {
	files, _ := filepath.Glob(filepath.Join(dir, "*.sph"))
	for _, f := range files {
		p, err := susie.Load(f)
		if err != nil {
			log.Printf("[susie] %s: %v", filepath.Base(f), err)
			continue
		}
		log.Printf("[susie] loaded %s (%s): %s", filepath.Base(f), p.Description, strings.Join(p.Extensions, " "))
		loadedSusie = append(loadedSusie, p)
		library.RegisterFormat(susieFormat{p})
	}
}

// susieFormat reads an archive format with a Susie plug-in
type susieFormat struct{ p *susie.Plugin }

func (f susieFormat) Name() string              { return filepath.Base(f.p.Path) }
func (f susieFormat) Extensions() []string      { return f.p.Extensions }
func (f susieFormat) Supports(path string) bool { return f.p.Supports(path) }

func (f susieFormat) Entries(path string) ([]library.ArchiveEntry, error) {
	list, err := f.p.Entries(path)
	if err != nil {
		return nil, err
	}
	out := make([]library.ArchiveEntry, len(list))
	for i, e := range list {
		out[i] = library.ArchiveEntry{Name: e.Name, Size: e.Size, Pos: e.Pos}
	}
	return out, nil
}

func (f susieFormat) Read(path string, e library.ArchiveEntry) ([]byte, error) {
	return f.p.Read(path, susie.Entry{Name: e.Name, Size: e.Size, Pos: e.Pos})
}

// pluginInfoOf is the info of the loaded plugin with this id: what its site declares (empty if there is none, so
// it has no capabilities and no choices of its own)
func pluginInfoOf(id string) plugin.Info {
	for _, p := range loaded {
		if p.Info.ID == id {
			return p.Info
		}
	}
	return plugin.Info{}
}

// PluginInfo is a loaded plugin, for the settings screen
type PluginInfo struct {
	plugin.Info
	File string `json:"file"`
	// Formats are the archive formats a Susie plug-in reads (".rar")
	Formats []string `json:"formats"`
}

// Plugins returns the plugins loaded at startup (kind "susie" for Susie archive plug-ins)
func (a *App) Plugins() []PluginInfo {
	out := []PluginInfo{}
	for _, p := range loaded {
		out = append(out, PluginInfo{Info: p.Info, File: p.Path, Formats: []string{}})
	}
	for _, p := range loadedSusie {
		name := p.Description
		if name == "" {
			name = filepath.Base(p.Path)
		}
		info := plugin.Info{Kind: "susie", ID: filepath.Base(p.Path), Name: name, Hosts: []string{}}
		out = append(out, PluginInfo{Info: info, File: p.Path, Formats: p.Extensions})
	}
	return out
}

// TagNamesJa returns the Japanese names of the sites' tags (English name -> Japanese)
func (a *App) TagNamesJa() map[string]string {
	out := map[string]string{}
	for _, p := range site.All() {
		if n, ok := p.(site.TagNamer); ok {
			for k, v := range n.TagNamesJa() {
				out[k] = v
			}
		}
	}
	return out
}

// AddPlugin asks for a plugin (.wasm), checks that it is one and copies it into the plugins folder: over the file of
// the loaded plugin with the same id (an update), else into the folder for the user's plugins. It is loaded at the
// next start (RestartApp). nil when the user cancelled
func (a *App) AddPlugin(title string) (*PluginInfo, error) {
	src, err := a.sh.chooseFile(title, "wasm")
	if err != nil || src == "" {
		return nil, err
	}
	if !strings.EqualFold(filepath.Ext(src), ".wasm") {
		return nil, apperr.New("plugin.notWasm", "not a plugin (.wasm) file")
	}
	p, err := plugin.Load(src, filepath.Join(store.DataDir(), "plugincache"))
	if err != nil {
		return nil, apperr.Wrap(err, "plugin.invalid", "the file is not a Poruneko plugin")
	}
	dst := filepath.Join(userPluginDir(), filepath.Base(src))
	for _, l := range loaded {
		if l.Info.ID == p.Info.ID {
			dst = l.Path
		}
	}
	if filepath.Clean(src) != filepath.Clean(dst) {
		if err := copyFile(src, dst); err != nil {
			return nil, apperr.Wrap(err, "plugin.copyFailed", "failed to copy the plugin")
		}
	}
	log.Printf("[plugin] added %s %s (%s)", p.Info.ID, p.Info.Version, dst)
	return &PluginInfo{Info: p.Info, File: dst, Formats: []string{}}, nil
}

// RestartApp starts the app again (to load the plugins added)
func (a *App) RestartApp() error { return a.sh.restart() }

// userPluginDir is where the plugins the user adds go (unless they replace a loaded one): the data folder's
func userPluginDir() string { return filepath.Join(store.DataDir(), "plugins") }

// copyFile copies src to dst through a temporary file, so a failed copy leaves dst as it was
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(dst), ".plugin-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := io.Copy(tmp, in); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), dst)
}
