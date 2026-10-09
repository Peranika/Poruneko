package main

import "poruneko/internal/model"

// How far works were read: the viewer keeps the page each work is at (opened there again, on any device) and makes
// a work read once its last page is shown; lists mark them. Changes are told with "read:changed" (a ReadState)

// ReadStates is how far every work opened was read (key -> state)
func (a *App) ReadStates() map[string]model.ReadState { return a.st.ReadStates() }

// SetReadPage keeps the page a work is at in the viewer, of pages; atEnd (its last page is shown) makes it read
func (a *App) SetReadPage(key string, page, pages int, atEnd bool) {
	a.sh.emit("read:changed", a.st.SetReadPage(key, page, pages, atEnd))
}

// SetRead marks works read or unread
func (a *App) SetRead(keys []string, read bool) {
	for _, k := range keys {
		a.sh.emit("read:changed", a.st.SetRead(k, read))
	}
}
