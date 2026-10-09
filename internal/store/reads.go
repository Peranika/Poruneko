package store

import (
	"time"

	"poruneko/internal/model"
)

// How far each work was read in the viewer: the page it was left at (to open it there again, on any device) and
// whether it was read to its end. Kept for any work opened, bookmarked or not, in the DB like bookmarks

func (s *Store) loadReads() {
	rows, err := loadTable[model.ReadState](s.db, readsTable)
	if err != nil {
		return
	}
	s.reads = rows
}

// ReadStates is how far every work was read (key -> state)
func (s *Store) ReadStates() map[string]model.ReadState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]model.ReadState, len(s.reads))
	for k, r := range s.reads {
		out[k] = *r
	}
	return out
}

// ReadState is how far a work was read (false when it was never opened)
func (s *Store) ReadState(key string) (model.ReadState, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if r := s.reads[key]; r != nil {
		return *r, true
	}
	return model.ReadState{Key: key}, false
}

// SetReadPage keeps the page a work is at, of pages; atEnd (its last page is shown) makes it read. Reading it
// again from the start leaves it read
func (s *Store) SetReadPage(key string, page, pages int, atEnd bool) model.ReadState {
	return s.updateRead(key, func(r *model.ReadState) {
		r.Page, r.Pages = page, pages
		r.Read = r.Read || atEnd
	})
}

// SetRead marks a work read or not (by the user)
func (s *Store) SetRead(key string, read bool) model.ReadState {
	return s.updateRead(key, func(r *model.ReadState) { r.Read = read })
}

func (s *Store) updateRead(key string, fn func(r *model.ReadState)) model.ReadState {
	s.mu.Lock()
	defer s.mu.Unlock()
	r := s.reads[key]
	if r == nil {
		r = &model.ReadState{Key: key}
		s.reads[key] = r
	}
	fn(r)
	r.UpdatedAt = time.Now().UnixMilli()
	s.changedR[key] = true
	s.scheduleFlush()
	return *r
}
