//go:build !windows

// Package susie loads Susie archive plug-ins, which exist only on Windows; elsewhere nothing is loaded.
package susie

import "errors"

// Entry is a file in an archive
type Entry struct {
	Name string
	Pos  int64
	Size int64
}

// Plugin is a loaded Susie archive plug-in (never on this platform)
type Plugin struct {
	Path        string
	Description string
	Extensions  []string
}

// Load always fails: Susie plug-ins are Windows DLLs
func Load(string) (*Plugin, error) { return nil, errors.New("Susie plug-ins work only on Windows") }

func (p *Plugin) Supports(string) bool               { return false }
func (p *Plugin) Entries(string) ([]Entry, error)    { return nil, errors.ErrUnsupported }
func (p *Plugin) Read(string, Entry) ([]byte, error) { return nil, errors.ErrUnsupported }
