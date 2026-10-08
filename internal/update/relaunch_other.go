//go:build !windows

package update

import (
	"syscall"
	"time"
)

func waitForExit(pid int, limit time.Duration) {
	for end := time.Now().Add(limit); time.Now().Before(end); time.Sleep(100 * time.Millisecond) {
		if syscall.Kill(pid, 0) != nil {
			return
		}
	}
}
