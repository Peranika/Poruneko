package main

import (
	"fmt"
	"log"
	"maps"
	"net/url"
	"os/exec"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"poruneko/internal/apperr"
	"poruneko/internal/library"
	"poruneko/internal/model"
)

// API for settings, the file name format and the window

// ---------------------------------------------------------------- File name format

// FileNamePlaceholders returns the placeholders for the file name format (their descriptions are in the frontend string tables)
func (a *App) FileNamePlaceholders() []string { return library.Placeholders }

// PreviewFileName returns an example of the format (using a bookmark with creator info if there is one).
// sampleSeries is the series name used in the example when no work is in a series (in the UI language)
func (a *App) PreviewFileName(format, sampleSeries string) string {
	d := &model.GalleryDetail{GallerySummary: model.GallerySummary{
		Key: "example:123456", Site: "example", ID: "123456", Title: "Asa no Hikari", JapaneseTitle: "あさのひかり",
		Type: "doujinshi", Language: "japanese", Date: "2017-07-09 00:00:00-05", Parodies: []string{"original"},
	}}
	c := model.CreatorInfo{Circle: "見本サークル", Artists: []string{"見本太郎"}}
	if model.English() {
		c = model.CreatorInfo{Circle: "mihon circle", Artists: []string{"mihon tarou"}}
	}
	sr := library.SeriesRef{Name: sampleSeries, No: 1}
	// prefer a work in a series for the example (so {series} shows a real name)
	var fallback *model.Bookmark
	for _, b := range a.st.Bookmarks() {
		if b.Creator.Circle == "" || len(b.Creator.Artists) == 0 {
			continue
		}
		if x, i, ok := a.st.SeriesOf(b.Key); ok {
			d, c, sr = &model.GalleryDetail{GallerySummary: b.Summary}, b.Creator, library.SeriesRef{Name: x.Name, No: i + 1}
			fallback = nil
			break
		}
		if fallback == nil {
			fallback = &b
		}
	}
	if fallback != nil {
		d, c = &model.GalleryDetail{GallerySummary: fallback.Summary}, fallback.Creator
	}
	return library.FormatName(format, d, c, sr)
}

// ApplyFileNameFormat renames every downloaded cbz with the current format
func (a *App) ApplyFileNameFormat() (int, error) {
	moved, errs := a.lib.RelocateAll()
	a.notifyBookmarks()
	if len(errs) > 0 {
		for _, e := range errs {
			log.Printf("[library] rename: %v", e)
		}
		return moved, apperr.New("settings.renameFailed", fmt.Sprintf("failed to rename %d files", len(errs)), "count", len(errs))
	}
	return moved, nil
}

// ---------------------------------------------------------------- Settings and window

func (a *App) GetSettings() model.Settings { return a.st.Settings() }

func (a *App) SetSettings(s model.Settings) model.Settings {
	// the archives removed from the library are kept by the backend (the screen's copy of the settings may be older)
	cur := a.st.Settings()
	s.LibraryIgnored = cur.LibraryIgnored
	s.LocalDirs = cur.LocalDirs // changed only by AddLocalDir / RemoveLocalDir
	s.FolderSeriesOff = cur.FolderSeriesOff
	v := a.st.SetSettings(s)
	model.SetUILanguage(resolveUILanguage(v.UILanguage))
	return v
}

// UILanguage is the UI language in use ("ja" or "en"): the setting, or the OS display language if unset
func (a *App) UILanguage() string { return resolveUILanguage(a.st.Settings().UILanguage) }

func resolveUILanguage(setting string) string {
	if setting == "ja" || setting == "en" {
		return setting
	}
	return osLanguage()
}

// ChooseSiteDir opens a dialog to choose where a site's works are saved (title is the dialog title in the UI
// language). A folder overlapping a local folder is refused (its works would be listed there too)
func (a *App) ChooseSiteDir(site, title string) (string, error) {
	cur := a.st.Settings()
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                title,
		DefaultDirectory:     a.st.SiteDir(site),
		CanCreateDirectories: true,
	})
	if err != nil || dir == "" {
		return "", err
	}
	dir = filepath.Clean(dir)
	for _, d := range cur.LocalDirs {
		if overlaps(dir, d.Path) {
			return "", apperr.New("library.dirOverlapsLocal", "the folder overlaps a local folder", "path", d.Path)
		}
	}
	dirs := maps.Clone(cur.SiteDirs)
	if dirs == nil {
		dirs = map[string]string{}
	}
	dirs[site] = dir
	cur.SiteDirs = dirs
	a.st.SetSettings(cur)
	return dir, nil
}

// OpenExternal opens an http(s) URL in the default browser.
// Wails' BrowserOpenURL rejects URLs containing ( ) ! * and so on (such as Google site: searches),
// so it is opened with url.dll without going through the shell.
func (a *App) OpenExternal(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return apperr.New("url.notHTTP", "not an http(s) URL")
	}
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", u.String()).Start()
}

func (a *App) ToggleFullscreen() bool {
	if runtime.WindowIsFullscreen(a.ctx) {
		runtime.WindowUnfullscreen(a.ctx)
		return false
	}
	runtime.WindowFullscreen(a.ctx)
	return true
}

func (a *App) SetFullscreen(on bool) {
	a.winMu.Lock()
	if on && a.beforeFullscreen == nil {
		if w, ok := getWindowState(); ok {
			a.beforeFullscreen = &w
		}
	} else if !on {
		a.beforeFullscreen = nil
	}
	a.winMu.Unlock()
	if on {
		runtime.WindowFullscreen(a.ctx)
	} else {
		runtime.WindowUnfullscreen(a.ctx)
	}
}

func (a *App) WindowMinimise()       { runtime.WindowMinimise(a.ctx) }
func (a *App) WindowToggleMaximise() { runtime.WindowToggleMaximise(a.ctx) }
func (a *App) WindowClose()          { runtime.Quit(a.ctx) }
