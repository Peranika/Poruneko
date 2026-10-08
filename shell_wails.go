package main

import (
	"os"
	"os/exec"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"poruneko/internal/loginwin"
	"poruneko/internal/update"
)

// wailsShell is the window around the app (Wails): the App reaches the screen and the OS through it
type wailsShell struct{ a *App }

// emit sends an event to the window and to the browsers of remote access
func (s wailsShell) emit(event string, data any) {
	runtime.EventsEmit(s.a.ctx, event, data)
	s.a.remoteAPI.Emit(event, data)
}

// chooseDir asks the user for a folder ("" if cancelled)
func (s wailsShell) chooseDir(title, defaultDir string) (string, error) {
	return runtime.OpenDirectoryDialog(s.a.ctx, runtime.OpenDialogOptions{
		Title:                title,
		DefaultDirectory:     defaultDir,
		CanCreateDirectories: true,
	})
}

// openURL opens the URL with url.dll without going through the shell: Wails' BrowserOpenURL rejects URLs
// containing ( ) ! * and so on (such as Google site: searches)
func (s wailsShell) openURL(u string) error {
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", u).Start()
}

// reveal shows a file (or a folder) in the file manager
func (s wailsShell) reveal(path string, isFile bool) error { return revealInExplorer(path, isFile) }

func (s wailsShell) clipboardText() (string, error) { return runtime.ClipboardGetText(s.a.ctx) }

func (s wailsShell) setFullscreen(on bool) {
	if on {
		runtime.WindowFullscreen(s.a.ctx)
	} else {
		runtime.WindowUnfullscreen(s.a.ctx)
	}
}

func (s wailsShell) toggleFullscreen() bool {
	on := !runtime.WindowIsFullscreen(s.a.ctx)
	s.setFullscreen(on)
	return on
}

func (s wailsShell) minimise()       { runtime.WindowMinimise(s.a.ctx) }
func (s wailsShell) toggleMaximise() { runtime.WindowToggleMaximise(s.a.ctx) }

// quit quits the app (closing the window may only hide it in the task tray: closeWindow)
func (s wailsShell) quit() {
	s.a.quitting.Store(true)
	runtime.Quit(s.a.ctx)
}

// closeWindow closes the window: it goes into the task tray while the app's icon is there, otherwise the app quits
// (beforeClose)
func (s wailsShell) closeWindow() { runtime.Quit(s.a.ctx) }

// show brings the window back (from the task tray, or minimised) to the front
func (s wailsShell) show() {
	runtime.WindowShow(s.a.ctx)
	runtime.WindowUnminimise(s.a.ctx)
	bringToFront()
}

// chooseFile asks the user for a file with the extension (such as "wasm"); "" if cancelled
func (s wailsShell) chooseFile(title, ext string) (string, error) {
	pattern := "*." + ext
	return runtime.OpenFileDialog(s.a.ctx, runtime.OpenDialogOptions{
		Title:   title,
		Filters: []runtime.FileFilter{{DisplayName: pattern, Pattern: pattern}},
	})
}

// restart starts a new instance and quits this one (the plugins are loaded only at startup)
func (s wailsShell) restart() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	// a build that finds this exe running moves it aside (Poruneko.exe~) and puts the new one in its place: start that
	if built := strings.TrimSuffix(exe, "~"); built != exe {
		if _, err := os.Stat(built); err == nil {
			exe = built
		}
	}
	if err := update.Relaunch(exe); err != nil {
		return err
	}
	s.quit()
	return nil
}

// login opens a site's sign-in page and returns its login cookies once they are there
func (s wailsShell) login(o loginwin.Options) (map[string]string, error) {
	return loginwin.Run(s.a.ctx, o)
}
