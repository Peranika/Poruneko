package update

import (
	"os"
	"os/exec"
	"strconv"
	"time"
)

// Starting the app again. One instance runs at a time (for the same data folder), so the new one waits for this
// one to quit before it starts

// afterEnv tells a new instance the process to wait for
const afterEnv = "PORUNEKO_AFTER"

// Relaunch starts exe, which waits until this process has quit (WaitForPrevious); the caller quits right after
func Relaunch(exe string) error {
	cmd := exec.Command(exe, os.Args[1:]...)
	cmd.Env = append(os.Environ(), afterEnv+"="+strconv.Itoa(os.Getpid()))
	return cmd.Start()
}

// WaitForPrevious waits (up to 30 seconds) for the instance that started this one to quit (at startup)
func WaitForPrevious() {
	s := os.Getenv(afterEnv)
	if s == "" {
		return
	}
	_ = os.Unsetenv(afterEnv)
	if pid, err := strconv.Atoi(s); err == nil {
		waitForExit(pid, 30*time.Second)
	}
}
