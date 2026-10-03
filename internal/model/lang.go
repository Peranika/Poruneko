package model

import "sync/atomic"

// The UI language decides the title the backend uses (file names etc.) and the names it makes
// (circle names of magazines, the folder for unknown creators). It is "ja" unless set to English.
var english atomic.Bool

// SetUILanguage sets the UI language ("ja" or "en")
func SetUILanguage(lang string) { english.Store(lang == "en") }

// English reports whether the UI language is English
func English() bool { return english.Load() }
