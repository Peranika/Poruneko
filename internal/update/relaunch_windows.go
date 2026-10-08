//go:build windows

package update

import (
	"time"

	"golang.org/x/sys/windows"
)

func waitForExit(pid int, limit time.Duration) {
	h, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		return // already gone
	}
	defer windows.CloseHandle(h)
	_, _ = windows.WaitForSingleObject(h, uint32(limit.Milliseconds()))
}
