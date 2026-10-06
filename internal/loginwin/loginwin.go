// Package loginwin opens a small browser window where the user signs in to a site, and reads the site's login
// cookies from it once they are there (they are HttpOnly, so only the browser's cookie store has them).
package loginwin

import (
	"errors"
	"regexp"
)

// Cookie is a cookie to read, and the form its value has once the user is signed in
type Cookie struct {
	Name string
	// Match is a regular expression the value must match ("" for any value), for a cookie the site also sets for
	// visitors who are not signed in (pixiv's PHPSESSID)
	Match *regexp.Regexp
}

// Options are what a login window opens and waits for
type Options struct {
	Title string // the window's title
	URL   string // the page opened first (the site's sign-in page)
	// CookieURL is the URL whose cookies are read (URL if empty)
	CookieURL string
	Cookies   []Cookie
	// Fresh deletes these cookies before the page opens, to sign in to another account
	Fresh bool
	// DataPath is the browser's profile folder, kept so a later login finds the user still signed in
	DataPath string
}

var (
	// ErrClosed is returned when the user closes the window before signing in
	ErrClosed = errors.New("the login window was closed")
	// ErrBusy is returned while another login window is open
	ErrBusy = errors.New("a login window is already open")
	// ErrUnsupported is returned where there is no login window (other than Windows)
	ErrUnsupported = errors.New("login windows are not supported on this platform")
)

// complete reports whether the cookies read are all there in their signed-in form
func complete(want []Cookie, got map[string]string) bool {
	for _, c := range want {
		v := got[c.Name]
		if v == "" || (c.Match != nil && !c.Match.MatchString(v)) {
			return false
		}
	}
	return true
}
