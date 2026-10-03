//go:build !windows && !darwin

package main

import (
	"os/exec"
	"path/filepath"
)

// revealInExplorer opens the folder containing the file (or the folder itself)
func revealInExplorer(path string, isFile bool) error {
	if isFile {
		path = filepath.Dir(path)
	}
	return exec.Command("xdg-open", path).Start()
}
