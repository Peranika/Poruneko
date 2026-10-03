//go:build darwin

package main

import (
	"os/exec"
	"strings"
)

// osLanguage is the macOS preferred language ("ja" for Japanese, "en" otherwise).
// GUI apps do not get LANG, so read AppleLanguages (the first entry is the one in use).
func osLanguage() string {
	out, err := exec.Command("defaults", "read", "-g", "AppleLanguages").Output()
	if err != nil {
		return "en"
	}
	for _, l := range strings.Split(string(out), "\n") {
		l = strings.Trim(strings.TrimSpace(l), `",`)
		if l == "(" || l == "" {
			continue
		}
		if strings.HasPrefix(l, "ja") {
			return "ja"
		}
		return "en"
	}
	return "en"
}
