//go:build !android

package store

import (
	"path/filepath"

	_ "modernc.org/sqlite"
)

// SQLite is modernc's (pure Go) here; on Android it is the C library's (sqlite_android.go), as modernc calls the
// kernel directly with system calls that Android forbids

const sqliteDriver = "sqlite"

func sqliteDSN(path string) string {
	return "file:" + filepath.ToSlash(path) + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)"
}
