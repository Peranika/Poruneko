package main

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"poruneko/internal/apperr"
	"poruneko/internal/library"
	"poruneko/internal/model"
	"poruneko/internal/store"
	"slices"
	"strings"
)

// The local folders: each is a tab of its own, with a name and an icon the user chooses

// AddLocalDir opens a dialog to choose a folder for a tab of its own, adds it and scans
// ("" if cancelled). A folder overlapping the save location or another local folder is refused
func (a *App) AddLocalDir(title string) (string, error) {
	cur := a.st.Settings()
	dir, err := a.sh.chooseDir(title, "")
	if err != nil || dir == "" {
		return "", err
	}
	dir = filepath.Clean(dir)
	// the save locations hold the site plugins' downloads, which are not local works
	saves := []string{cur.LibraryDir}
	for _, d := range cur.SiteDirs {
		saves = append(saves, d)
	}
	for _, d := range saves {
		if overlaps(dir, d) {
			return "", apperr.New("library.dirOverlapsSave", "the folder overlaps a save location", "path", d)
		}
	}
	id := 1
	for _, d := range cur.LocalDirs {
		if overlaps(dir, d.Path) {
			return "", apperr.New("library.dirOverlaps", "the folder overlaps a folder already listed", "path", d.Path)
		}
		id = max(id, d.ID+1)
	}
	cur.LocalDirs = append(slices.Clone(cur.LocalDirs), model.LocalDir{ID: id, Path: dir, Name: filepath.Base(dir), Icon: "folder"})
	a.st.SetSettings(cur)
	go a.ScanLibrary()
	return dir, nil
}

// SetLocalDir changes the name and icon of a local folder's tab
func (a *App) SetLocalDir(id int, name, icon string) error {
	cur := a.st.Settings()
	dirs := slices.Clone(cur.LocalDirs)
	i := slices.IndexFunc(dirs, func(d model.LocalDir) bool { return d.ID == id })
	if i < 0 {
		return apperr.New("library.noDir", "the folder is not in the list")
	}
	if name = strings.TrimSpace(name); name == "" {
		name = filepath.Base(dirs[i].Path)
	}
	dirs[i].Name, dirs[i].Icon = name, icon
	cur.LocalDirs = dirs
	a.st.SetSettings(cur)
	return nil
}

// MoveLocalDir moves a local folder's tab up (-1) or down (1)
func (a *App) MoveLocalDir(id, dir int) {
	cur := a.st.Settings()
	dirs := slices.Clone(cur.LocalDirs)
	i := slices.IndexFunc(dirs, func(d model.LocalDir) bool { return d.ID == id })
	if j := i + dir; i >= 0 && j >= 0 && j < len(dirs) {
		dirs[i], dirs[j] = dirs[j], dirs[i]
		cur.LocalDirs = dirs
		a.st.SetSettings(cur)
	}
}

// IconFile is an image in the icons folder, for the tabs of the local folders
type IconFile struct {
	Name string `json:"name"`
	URL  string `json:"url"` // data URL
}

// iconsDir is where the user puts images for the tab icons
func iconsDir() string { return filepath.Join(store.DataDir(), "icons") }

var iconTypes = map[string]string{
	".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
	".gif": "image/gif", ".ico": "image/x-icon", ".bmp": "image/bmp",
}

// LocalIcons returns the images in the icons folder (up to 1 MB each)
func (a *App) LocalIcons() []IconFile {
	out := []IconFile{}
	entries, _ := os.ReadDir(iconsDir())
	for _, e := range entries {
		mime := iconTypes[strings.ToLower(filepath.Ext(e.Name()))]
		if e.IsDir() || mime == "" {
			continue
		}
		if fi, err := e.Info(); err != nil || fi.Size() > 1<<20 {
			continue
		}
		b, err := os.ReadFile(filepath.Join(iconsDir(), e.Name()))
		if err != nil {
			continue
		}
		out = append(out, IconFile{Name: e.Name(), URL: "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b)})
	}
	return out
}

// OpenIconsFolder opens the icons folder (made if missing) in the file manager
func (a *App) OpenIconsFolder() error {
	if err := os.MkdirAll(iconsDir(), 0o755); err != nil {
		return err
	}
	return a.sh.reveal(iconsDir(), false)
}

// RemoveLocalDir removes a folder's tab with its works (their tags and series too; the files stay)
func (a *App) RemoveLocalDir(id int) {
	cur := a.st.Settings()
	cur.LocalDirs = slices.DeleteFunc(slices.Clone(cur.LocalDirs), func(d model.LocalDir) bool { return d.ID == id })
	// the removed archives of the folder are forgotten too (its works would not come back with the same id)
	inDir := func(rel string) bool {
		d, ok := library.LocalDirOf(rel)
		return ok && d == id
	}
	cur.LibraryIgnored = slices.DeleteFunc(slices.Clone(cur.LibraryIgnored), inDir)
	cur.FolderSeriesOff = slices.DeleteFunc(slices.Clone(cur.FolderSeriesOff), inDir)
	a.st.SetSettings(cur)
	for _, s := range a.st.SeriesList() {
		if s.Folder != "" && inDir(s.Folder+"/") {
			a.st.DeleteSeries(s.ID)
		}
	}
	a.seriesChanged(nil)
	var keys []string
	for _, b := range a.st.Bookmarks() {
		if model.IsFileKey(b.Key) && inDir(b.ArchiveFile) {
			keys = append(keys, b.Key)
		}
	}
	if len(keys) > 0 {
		a.dropFileWorks(keys, false)
		a.notifyBookmarks()
	}
}

// overlaps reports whether one folder is the other or inside it
func overlaps(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	a, b = strings.ToLower(filepath.Clean(a)), strings.ToLower(filepath.Clean(b))
	sep := string(filepath.Separator)
	return a == b || strings.HasPrefix(a, strings.TrimSuffix(b, sep)+sep) || strings.HasPrefix(b, strings.TrimSuffix(a, sep)+sep)
}
