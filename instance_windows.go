//go:build windows

package main

import (
	"encoding/json"
	"os"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/options"
	"golang.org/x/sys/windows"
)

// One instance of the app runs for a data folder (options.SingleInstanceLock): starting it again brings the running
// one's window to the front, even from the task tray

var (
	procFindWindowW              = user32.NewProc("FindWindowW")
	procSendMessageW             = user32.NewProc("SendMessageW")
	procSetForegroundWindow      = user32.NewProc("SetForegroundWindow")
	procAllowSetForegroundWindow = user32.NewProc("AllowSetForegroundWindow")
)

// handOffToRunning hands over to the instance already running (and quits) before this one opens the data. Wails'
// lock does the same, but only in wails.Run, after the data is opened; this follows how it does it
func handOffToRunning(uniqueID string) {
	id := "wails-app-" + uniqueID
	m, err := windows.OpenMutex(windows.SYNCHRONIZE, false, windows.StringToUTF16Ptr(id+"sim"))
	if err != nil {
		return // none running
	}
	_ = windows.CloseHandle(m)
	cls, name := windows.StringToUTF16Ptr(id+"-sic"), windows.StringToUTF16Ptr(id+"-siw")
	h, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return
	}
	data := options.SecondInstanceData{Args: os.Args[1:]}
	data.WorkingDirectory, _ = os.Getwd()
	b, err := json.Marshal(data)
	if err != nil {
		return
	}
	text, _ := windows.UTF16FromString(string(b))
	cd := struct {
		dwData uintptr
		cbData uint32
		lpData uintptr
	}{1542, uint32(len(text) * 2), uintptr(unsafe.Pointer(&text[0]))} // WMCOPYDATA_SINGLE_INSTANCE_DATA
	const wmCopyData, asfwAny = 0x004A, ^uintptr(0)
	procAllowSetForegroundWindow.Call(asfwAny) // let the running one come to the front
	procSendMessageW.Call(h, wmCopyData, 0, uintptr(unsafe.Pointer(&cd)))
	os.Exit(0)
}

// bringToFront puts the window in front of the others
func bringToFront() {
	if h := mainWindow(); h != 0 {
		procSetForegroundWindow.Call(uintptr(h))
	}
}
