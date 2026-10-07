package main

import (
	"embed"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"poruneko/internal/imgserver"
	"poruneko/internal/library"
	"poruneko/internal/model"
	"poruneko/internal/store"
	"poruneko/internal/webapi"
)

// Starting the app (main.go)

//go:embed all:frontend/dist
var assets embed.FS

// newApp opens the data and loads the plugins. The caller sets the window around it (App.sh)
func newApp() *App {
	st := store.Open()
	model.SetUILanguage(resolveUILanguage(st.Settings().UILanguage))
	loadPlugins(st)
	lib := library.New(st)
	dl := library.NewDownloader(lib, st)
	img := imgserver.New(lib, st)
	return NewApp(st, lib, dl, img)
}

// webHandler serves the screen, the API and the images over HTTP (remote access)
func (a *App) webHandler(api *webapi.Server) http.Handler {
	dist, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", api)
	mux.Handle("/", a.img.Middleware(http.FileServerFS(dist)))
	return mux
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
