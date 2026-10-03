//go:build windows

package main

import "golang.org/x/sys/windows"

var procGetUserDefaultUILanguage = windows.NewLazySystemDLL("kernel32.dll").NewProc("GetUserDefaultUILanguage")

// osLanguage is the Windows display language ("ja" for Japanese, "en" otherwise)
func osLanguage() string {
	id, _, _ := procGetUserDefaultUILanguage.Call()
	if id&0x3ff == 0x11 { // LANG_JAPANESE
		return "ja"
	}
	return "en"
}
