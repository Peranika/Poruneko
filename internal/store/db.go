package store

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
)

// bookmarkDB is the SQLite file of bookmarks and series.
// Writes are batched every 300ms, so it is opened and closed each time (the file is not held open)
type bookmarkDB struct {
	path string
}

// every table has 3 columns: key, time for sorting, and JSON
const schema = `
CREATE TABLE IF NOT EXISTS bookmarks (
	key      TEXT PRIMARY KEY,
	added_at INTEGER NOT NULL,
	data     TEXT NOT NULL -- JSON of model.Bookmark
);
CREATE INDEX IF NOT EXISTS bookmarks_added_at ON bookmarks(added_at);
CREATE TABLE IF NOT EXISTS series (
	id         TEXT PRIMARY KEY,
	created_at INTEGER NOT NULL,
	data       TEXT NOT NULL -- JSON of model.Series
);
CREATE TABLE IF NOT EXISTS owner_settings (
	key        TEXT PRIMARY KEY, -- site, U+001F, owner
	updated_at INTEGER NOT NULL,
	data       TEXT NOT NULL -- JSON of model.OwnerSettings
);
`

// table is a table name and its column names
type table struct{ name, key, ts string }

var (
	bookmarksTable = table{"bookmarks", "key", "added_at"}
	seriesTable    = table{"series", "id", "created_at"}
	ownersTable    = table{"owner_settings", "key", "updated_at"}
)

// row is one row to write (v is the value made into JSON)
type row struct {
	ts int64
	v  any
}

// changes are the writes to one table
type changes struct {
	put map[string]row
	del []string
}

func (d *bookmarkDB) open() (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(d.path), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open(sqliteDriver, sqliteDSN(d.path))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// loadTable reads every row of a table (empty if there is no DB file)
func loadTable[T any](d *bookmarkDB, t table) (map[string]*T, error) {
	out := map[string]*T{}
	if _, err := os.Stat(d.path); err != nil {
		return out, nil
	}
	db, err := d.open()
	if err != nil {
		return out, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT ` + t.key + `, data FROM ` + t.name)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var key, data string
		if err := rows.Scan(&key, &data); err != nil {
			return out, err
		}
		var v T
		if err := json.Unmarshal([]byte(data), &v); err != nil {
			continue // skip unreadable rows (they stay in the DB)
		}
		out[key] = &v
	}
	return out, rows.Err()
}

// write writes to several tables in one transaction
func (d *bookmarkDB) write(all map[table]changes) error {
	db, err := d.open()
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for t, c := range all {
		for k, r := range c.put {
			data, err := json.Marshal(r.v)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO `+t.name+`(`+t.key+`, `+t.ts+`, data) VALUES(?, ?, ?)
				ON CONFLICT(`+t.key+`) DO UPDATE SET `+t.ts+` = excluded.`+t.ts+`, data = excluded.data`, k, r.ts, string(data)); err != nil {
				return err
			}
		}
		for _, k := range c.del {
			if _, err := tx.Exec(`DELETE FROM `+t.name+` WHERE `+t.key+` = ?`, k); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}
