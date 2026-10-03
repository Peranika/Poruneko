package main

import (
	"os"
	"path/filepath"

	"poruneko/internal/plugin"
	"poruneko/internal/site"
	"poruneko/internal/store"
)

// pluginDirs are where plugins (.wasm) are looked for: "plugins" next to the exe, then in the data folder
func pluginDirs() []string {
	var dirs []string
	if exe, err := os.Executable(); err == nil {
		dirs = append(dirs, filepath.Join(filepath.Dir(exe), "plugins"))
	}
	return append(dirs, filepath.Join(store.DataDir(), "plugins"))
}

// loaded are the plugins found at startup
var loaded []*plugin.Plugin

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
	}
}

// PluginInfo is a loaded plugin, for the settings screen
type PluginInfo struct {
	plugin.Info
	File string `json:"file"`
}

// Plugins returns the plugins loaded at startup
func (a *App) Plugins() []PluginInfo {
	out := []PluginInfo{}
	for _, p := range loaded {
		out = append(out, PluginInfo{Info: p.Info, File: p.Path})
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
