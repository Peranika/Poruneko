package main

import (
	"embed"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/logger"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"

	"poruneko/internal/apperr"
	"poruneko/internal/imgserver"
	"poruneko/internal/library"
	"poruneko/internal/model"
	"poruneko/internal/store"
	"poruneko/internal/update"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	logPath := setupLog()
	update.Cleanup() // remove the old exe left by the previous update
	st := store.Open()
	model.SetUILanguage(resolveUILanguage(st.Settings().UILanguage))
	lib := library.New(st)
	dl := library.NewDownloader(lib, st)
	img := imgserver.New(lib, st)
	app := NewApp(st, lib, dl, img)

	// previous window state (the position is applied right after startup, before showing)
	startState := options.Normal
	if st.Settings().RememberWindow {
		if w, ok := store.WindowState(); ok && w.Maximized {
			startState = options.Maximised
		}
	}

	err := wails.Run(&options.App{
		Title:            "Poruneko",
		Width:            1400,
		Height:           900,
		MinWidth:         900,
		MinHeight:        600,
		Frameless:        true,
		WindowStartState: startState,
		// for testing: start without a window (used when operating it from the browser in dev mode)
		StartHidden: os.Getenv("PORUNEKO_START_HIDDEN") != "",
		AssetServer: &assetserver.Options{
			Assets:     assets,
			Middleware: img.Middleware,
		},
		BackgroundColour:   &options.RGBA{R: 15, G: 17, B: 21, A: 255},
		OnStartup:          app.startup,
		OnBeforeClose:      app.beforeClose,
		OnShutdown:         app.shutdown,
		Bind:               []any{app},
		Logger:             logger.NewFileLogger(logPath),
		LogLevel:           logger.INFO,
		LogLevelProduction: logger.WARNING,
		// errors shown in the UI are passed as a code and parameters; the frontend string tables make the text
		ErrorFormatter: apperr.Format,
		Windows: &windows.Options{
			Theme:           windows.Dark,
			WindowClassName: windowClass,
			// by default it is created in %APPDATA%\Poruneko.exe, so keep it in the data folder
			WebviewUserDataPath: webviewDataDir(),
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}

// webviewDataDir is where WebView2 keeps its user data (EBWebView is created directly in the data folder).
// If it is in the old default location (%APPDATA%\<exe name>), it is moved first.
func webviewDataDir() string {
	dir := store.DataDir()
	newPath := filepath.Join(dir, "EBWebView")
	if _, err := os.Stat(newPath); err == nil {
		return dir
	}
	appData := os.Getenv("APPDATA")
	exe, err := os.Executable()
	if appData == "" || err != nil {
		return dir
	}
	oldDir := filepath.Join(appData, filepath.Base(exe))
	if filepath.Clean(oldDir) == filepath.Clean(dir) {
		return dir
	}
	oldPath := filepath.Join(oldDir, "EBWebView")
	if _, err := os.Stat(oldPath); err != nil {
		return dir
	}
	_ = os.MkdirAll(dir, 0o755)
	if err := os.Rename(oldPath, newPath); err != nil {
		log.Printf("failed to move WebView2 data: %v", err)
		return dir
	}
	_ = os.Remove(oldDir) // removed if empty
	return dir
}

// setupLog also writes the log to poruneko.log in the data folder (recreated when it exceeds 5MB)
func setupLog() string {
	path := filepath.Join(store.DataDir(), "poruneko.log")
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	if fi, err := os.Stat(path); err == nil && fi.Size() > 5<<20 {
		_ = os.Remove(path)
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return path
	}
	// in GUI builds Stderr is invalid and MultiWriter stops at the first error, so write the file first
	log.SetOutput(io.MultiWriter(f, os.Stderr))
	return path
}
