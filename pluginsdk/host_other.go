//go:build !wasip1

package pluginsdk

import "errors"

// Without WebAssembly (go test of a plugin's code) there is no app: fetching fails and nothing is kept

var errNoHost = errors.New("pluginsdk: no app to fetch through (not running as a plugin)")

// Run serves a site plugin (only as a plugin; here it does nothing)
func Run(s Site) {}

// Serve sets a handler of the calls (only as a plugin; here it does nothing)
func Serve(h Handler) {}

func Fetch(req Request) (*Response, error)         { return nil, errNoHost }
func FetchMany(reqs []Request) ([]Response, error) { return nil, errNoHost }
func Log(msg string)                               {}
func StoreSet(key string, value []byte)            {}
func StoreGet(key string) ([]byte, bool)           { return nil, false }
