package store

import (
	"path/filepath"

	_ "modernc.org/sqlite"
)

// SQLite is modernc's (pure Go)

const sqliteDriver = "sqlite"

func sqliteDSN(path string) string {
	return "file:" + filepath.ToSlash(path) + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)"
}
