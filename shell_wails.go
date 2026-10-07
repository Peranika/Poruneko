package main

import (
	"os"
	"os/exec"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"poruneko/internal/loginwin"
)

// wailsShell is the desktop window (Wails)
type wailsShell struct{ a *App }

// emit sends the event to the window and to the browsers of remote access
func (s wailsShell) emit(event string, data any) {
	runtime.EventsEmit(s.a.ctx, event, data)
	if s.a.remoteAPI != nil {
		s.a.remoteAPI.Emit(event, data)
	}
}

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
func (s wailsShell) quit()           { runtime.Quit(s.a.ctx) }

func (s wailsShell) chooseFile(title string, exts []string) (string, error) {
	pattern := "*." + strings.Join(exts, ";*.")
	return runtime.OpenFileDialog(s.a.ctx, runtime.OpenDialogOptions{
		Title:   title,
		Filters: []runtime.FileFilter{{DisplayName: pattern, Pattern: pattern}},
	})
}

// restart starts a new instance and quits this one
func (s wailsShell) restart() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if err := exec.Command(exe, os.Args[1:]...).Start(); err != nil {
		return err
	}
	runtime.Quit(s.a.ctx)
	return nil
}

func (s wailsShell) login(o loginwin.Options) (map[string]string, error) {
	return loginwin.Run(s.a.ctx, o)
}
