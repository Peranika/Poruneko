package main

import "poruneko/internal/loginwin"

// shell is the window around the app (Wails: shell_wails.go). The App reaches the screen and the OS only through it
type shell interface {
	// emit sends an event to the frontend
	emit(event string, data any)
	// chooseDir asks the user for a folder ("" if cancelled)
	chooseDir(title, defaultDir string) (string, error)
	// openURL opens an http(s) URL in the browser
	openURL(u string) error
	// reveal shows a file (or a folder) in the file manager
	reveal(path string, isFile bool) error
	clipboardText() (string, error)
	setFullscreen(on bool)
	toggleFullscreen() bool
	minimise()
	toggleMaximise()
	quit()
	// login opens a site's sign-in page and returns its login cookies once they are there
	login(o loginwin.Options) (map[string]string, error)
	// chooseFile asks the user for a file with one of the extensions (such as "wasm"); "" if cancelled. The path
	// may be a copy that the caller can keep or delete
	chooseFile(title string, exts []string) (string, error)
	// restart starts the app again (the plugins are loaded only at startup)
	restart() error
}
