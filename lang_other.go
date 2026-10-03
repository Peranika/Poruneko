//go:build !windows && !darwin

package main

import (
	"os"
	"strings"
)

// osLanguage is the OS language ("ja" for Japanese, "en" otherwise)
func osLanguage() string {
	for _, k := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		if v := os.Getenv(k); v != "" {
			if strings.HasPrefix(v, "ja") {
				return "ja"
			}
			return "en"
		}
	}
	return "en"
}
