//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// revealInExplorer opens Explorer with the file selected (or opens the folder itself).
// Go passes an argument with spaces quoted as a whole, like "/select,C:\a b\x.cbz", but Explorer
// cannot parse that and opens the default folder (Documents) instead. To get the /select,"path" form
// the command line is built by hand (Windows paths cannot contain ", so simply quoting them is safe).
func revealInExplorer(path string, isFile bool) error {
	cmd := exec.Command("explorer")
	arg := `"` + path + `"`
	if isFile {
		arg = `/select,` + arg
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `explorer ` + arg}
	return cmd.Start()
}
