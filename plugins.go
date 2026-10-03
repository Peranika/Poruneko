package main

import (
	"log"
	"os"
	"path/filepath"
	"strings"

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

// loadPlugins loads the plugins and registers the site plugins as sites (the first id found wins)
func loadPlugins() {
	cache := filepath.Join(store.DataDir(), "plugincache")
	seen := map[string]bool{}
	for _, dir := range pluginDirs() {
		for _, p := range plugin.LoadDir(dir, cache) {
			if seen[p.Info.ID] {
				continue
			}
			seen[p.Info.ID] = true
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
