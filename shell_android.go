//go:build android

package main

import (
	"context"
	"errors"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/loginwin"
	"poruneko/internal/webapi"
)

// androidShell is the WebView of the Android app: events go to the frontend over the event stream, and what only
// the Android app can do (choosing a folder, opening the browser...) is asked of it as a native call
type androidShell struct {
	ctx context.Context
	api *webapi.Server
}

func (s *androidShell) emit(event string, data any) { s.api.Emit(event, data) }

// native asks the Android app; a call waiting for the user (a folder chooser, a login page) can take long
func (s *androidShell) native(method string, params, out any, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(s.ctx, timeout)
	defer cancel()
	err := s.api.Native(ctx, method, params, out)
	if errors.Is(err, webapi.ErrUnsupported) {
		return apperr.New("platform.unsupported", "not supported on this platform")
	}
	return err
}

func (s *androidShell) chooseDir(title, defaultDir string) (string, error) {
	var dir string
	err := s.native("chooseDir", map[string]string{"title": title, "defaultDir": defaultDir}, &dir, time.Hour)
	return dir, err
}

func (s *androidShell) openURL(u string) error {
	return s.native("openURL", map[string]string{"url": u}, nil, 10*time.Second)
}

func (s *androidShell) reveal(path string, isFile bool) error {
	return s.native("reveal", map[string]any{"path": path, "isFile": isFile}, nil, 10*time.Second)
}

func (s *androidShell) clipboardText() (string, error) {
	var text string
	err := s.native("clipboardText", nil, &text, 10*time.Second)
	return text, err
}

func (s *androidShell) setFullscreen(on bool) {
	_ = s.native("setFullscreen", map[string]bool{"on": on}, nil, 10*time.Second)
}

func (s *androidShell) toggleFullscreen() bool {
	var on bool
	_ = s.native("toggleFullscreen", nil, &on, 10*time.Second)
	return on
}

// the app has no window of its own to minimise or maximise
func (s *androidShell) minimise()       {}
func (s *androidShell) toggleMaximise() {}

func (s *androidShell) quit() { _ = s.native("quit", nil, nil, 10*time.Second) }

// login opens the site's sign-in page in a WebView of the Android app, which waits for the cookies
func (s *androidShell) login(o loginwin.Options) (map[string]string, error) {
	type cookie struct {
		Name  string `json:"name"`
		Match string `json:"match,omitempty"`
	}
	params := struct {
		Title     string   `json:"title"`
		URL       string   `json:"url"`
		CookieURL string   `json:"cookieUrl"`
		Cookies   []cookie `json:"cookies"`
		Fresh     bool     `json:"fresh"`
	}{Title: o.Title, URL: o.URL, CookieURL: o.CookieURL, Fresh: o.Fresh}
	if params.CookieURL == "" {
		params.CookieURL = o.URL
	}
	for _, c := range o.Cookies {
		k := cookie{Name: c.Name}
		if c.Match != nil {
			k.Match = c.Match.String()
		}
		params.Cookies = append(params.Cookies, k)
	}
	var got map[string]string // null when the user closed the page first
	if err := s.native("login", params, &got, time.Hour); err != nil {
		return nil, err
	}
	if got == nil {
		return nil, loginwin.ErrClosed
	}
	return got, nil
}
