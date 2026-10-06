package main

import (
	_ "embed"
	"encoding/json"
	"log"
	"runtime"

	"poruneko/internal/apperr"
	"poruneko/internal/update"
)

// API for app updates (finding a newer version in the GitHub releases and swapping it in)

//go:embed wails.json
var wailsJSON []byte

// appVersion is productVersion in wails.json (the same value as the exe file info)
var appVersion = func() string {
	var c struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	if json.Unmarshal(wailsJSON, &c) != nil || c.Info.ProductVersion == "" {
		return "0.0.0"
	}
	return c.Info.ProductVersion
}()

func (a *App) AppVersion() string { return appVersion }

// CheckUpdate checks whether a newer version exists (nil if not)
func (a *App) CheckUpdate() (*update.Release, error) {
	if runtime.GOOS == "android" {
		return nil, nil // the releases hold the Windows exe; the Android app is updated by installing its APK
	}
	rel, err := update.Latest(a.ctx, appVersion)
	if err != nil {
		log.Printf("[update] check: %v", err)
		return nil, err
	}
	a.updateMu.Lock()
	a.pendingUpdate = rel
	a.updateMu.Unlock()
	if rel != nil {
		log.Printf("[update] %s is available (current %s)", rel.Version, appVersion)
	}
	return rel, nil
}

// InstallUpdate downloads the newer version found by CheckUpdate, swaps it in and restarts.
// Progress is reported with "update:progress" ({done, total})
func (a *App) InstallUpdate() error {
	a.updateMu.Lock()
	rel := a.pendingUpdate
	a.updateMu.Unlock()
	if rel == nil {
		return apperr.New("update.noUpdate", "no update to install")
	}
	err := update.Install(a.ctx, rel, func(done, total int64) {
		a.sh.emit("update:progress", map[string]int64{"done": done, "total": total})
	})
	if err != nil {
		log.Printf("[update] install %s: %v", rel.Version, err)
		return err
	}
	log.Printf("[update] installed %s, restarting", rel.Version)
	a.sh.quit()
	return nil
}
