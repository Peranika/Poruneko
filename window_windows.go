//go:build windows

package main

import (
	"os"
	"unsafe"

	"golang.org/x/sys/windows"

	"poruneko/internal/model"
)

// Saving and restoring the window position.
// Wails gets and sets the window position relative to the current monitor, so to restore it correctly
// with multiple monitors this uses Win32 GetWindowPlacement / SetWindowPlacement directly (which also keep the position before maximizing).

// windowClass is the window class name, set to make the window easy to find
const windowClass = "PorunekoWindow"

var (
	user32                 = windows.NewLazySystemDLL("user32.dll")
	procFindWindowExW      = user32.NewProc("FindWindowExW")
	procGetWindowPlacement = user32.NewProc("GetWindowPlacement")
	procSetWindowPlacement = user32.NewProc("SetWindowPlacement")
	procMonitorFromRect    = user32.NewProc("MonitorFromRect")
)

type winRect struct{ Left, Top, Right, Bottom int32 }
type winPoint struct{ X, Y int32 }

type windowPlacement struct {
	Length         uint32
	Flags          uint32
	ShowCmd        uint32
	MinPosition    winPoint
	MaxPosition    winPoint
	NormalPosition winRect
}

const (
	swHide                = 0
	swShowMaximized       = 3
	wpfRestoreToMaximized = 2
	monitorDefaultToNull  = 0
)

// mainWindow is this process's main window
func mainWindow() windows.HWND {
	cls, _ := windows.UTF16PtrFromString(windowClass)
	pid := uint32(os.Getpid())
	var h uintptr
	for {
		h, _, _ = procFindWindowExW.Call(0, h, uintptr(unsafe.Pointer(cls)), 0)
		if h == 0 {
			return 0
		}
		var p uint32
		if _, err := windows.GetWindowThreadProcessId(windows.HWND(h), &p); err == nil && p == pid {
			return windows.HWND(h)
		}
	}
}

// getWindowState returns the current window position and size (while maximized or minimized, the restored ones)
func getWindowState() (model.WindowState, bool) {
	h := mainWindow()
	if h == 0 {
		return model.WindowState{}, false
	}
	wp := windowPlacement{Length: uint32(unsafe.Sizeof(windowPlacement{}))}
	if r, _, _ := procGetWindowPlacement.Call(uintptr(h), uintptr(unsafe.Pointer(&wp))); r == 0 {
		return model.WindowState{}, false
	}
	n := wp.NormalPosition
	return model.WindowState{
		X:         int(n.Left),
		Y:         int(n.Top),
		Width:     int(n.Right - n.Left),
		Height:    int(n.Bottom - n.Top),
		Maximized: wp.ShowCmd == swShowMaximized || wp.Flags&wpfRestoreToMaximized != 0,
	}, true
}

// placeWindow moves a window that is not shown yet to the saved position and size.
// If that position is not on any monitor (e.g. one was unplugged) it does nothing and returns false
func placeWindow(s model.WindowState) bool {
	h := mainWindow()
	if h == 0 {
		return false
	}
	rc := winRect{int32(s.X), int32(s.Y), int32(s.X + s.Width), int32(s.Y + s.Height)}
	if m, _, _ := procMonitorFromRect.Call(uintptr(unsafe.Pointer(&rc)), monitorDefaultToNull); m == 0 {
		return false
	}
	// leave showing it to Wails (whether it opens maximized is already set in the startup options)
	wp := windowPlacement{Length: uint32(unsafe.Sizeof(windowPlacement{})), ShowCmd: swHide, NormalPosition: rc}
	r, _, _ := procSetWindowPlacement.Call(uintptr(h), uintptr(unsafe.Pointer(&wp)))
	return r != 0
}
