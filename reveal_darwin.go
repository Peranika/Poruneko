//go:build darwin

package main

import "os/exec"

// revealInExplorer shows the file selected in Finder (or opens the folder itself)
func revealInExplorer(path string, isFile bool) error {
	if isFile {
		return exec.Command("open", "-R", path).Start()
	}
	return exec.Command("open", path).Start()
}
