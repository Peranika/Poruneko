package store

import (
	"slices"
	"time"

	"poruneko/internal/model"
)

// History of works opened in the viewer, newest first, one entry per work (opening it again moves it to the top).
// Kept in history.json and written lazily like the settings.

// MaxHistory is the number of history entries kept
const MaxHistory = 1000

// History returns the history, newest first
func (s *Store) History() []model.HistoryEntry {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.history)
}

// AddHistory records that a work was opened. origin is where it was opened from (browse / favorites / bookmarks);
// "" keeps the origin recorded before (when reopened from the history itself, for example)
func (s *Store) AddHistory(sum model.GallerySummary, origin string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if i := slices.IndexFunc(s.history, func(e model.HistoryEntry) bool { return e.Key == sum.Key }); i >= 0 {
		if origin == "" {
			origin = s.history[i].Origin
		}
		s.history = slices.Delete(s.history, i, i+1)
	}
	e := model.HistoryEntry{Key: sum.Key, Summary: sum, OpenedAt: time.Now().UnixMilli(), Origin: origin}
	s.history = append([]model.HistoryEntry{e}, s.history...)
	if len(s.history) > MaxHistory {
		s.history = s.history[:MaxHistory]
	}
	s.saveHistory()
}

// RemoveHistory removes one work from the history
func (s *Store) RemoveHistory(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.history = slices.DeleteFunc(s.history, func(e model.HistoryEntry) bool { return e.Key == key })
	s.saveHistory()
}

// ClearHistory removes the whole history
func (s *Store) ClearHistory() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.history = nil
	s.saveHistory()
}

// saveHistory writes the history after 300ms in a batch (call with the lock held)
func (s *Store) saveHistory() {
	s.historyDirty = true
	s.scheduleFlush()
}
