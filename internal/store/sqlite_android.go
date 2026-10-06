//go:build android

package store

import _ "github.com/mattn/go-sqlite3"

// SQLite on Android is the C library's, built with the NDK (see sqlite.go)

const sqliteDriver = "sqlite3"

func sqliteDSN(path string) string {
	// the data folder is the app's own (no "?" or "#" in it)
	return "file:" + path + "?_busy_timeout=5000&_journal_mode=WAL&_synchronous=NORMAL"
}
