package store

import (
	"cmp"
	"log"
	"math/rand/v2"
	"slices"
	"strconv"
	"strings"
	"time"

	"poruneko/internal/model"
)

// Series: group bookmarks such as sequels and order them freely.
// A work belongs to at most one series (adding it to another series removes it from the old one).

func (s *Store) loadSeries() {
	m, err := loadTable[model.Series](s.db, seriesTable)
	if err != nil {
		log.Printf("[store] series: %v", err)
		return
	}
	s.series = m
}

func cloneSeries(x *model.Series) model.Series {
	c := *x
	c.Keys = slices.Clone(x.Keys)
	if c.Keys == nil {
		c.Keys = []string{}
	}
	return c
}

// SeriesList returns all series (in creation order)
func (s *Store) SeriesList() []model.Series {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]model.Series, 0, len(s.series))
	for _, x := range s.series {
		out = append(out, cloneSeries(x))
	}
	slices.SortFunc(out, func(a, b model.Series) int {
		return cmp.Or(cmp.Compare(a.CreatedAt, b.CreatedAt), strings.Compare(a.Name, b.Name))
	})
	return out
}

func (s *Store) GetSeries(id string) (model.Series, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	x, ok := s.series[id]
	if !ok {
		return model.Series{}, false
	}
	return cloneSeries(x), true
}

// SeriesOf returns the series containing a work and its position in it (0-based)
func (s *Store) SeriesOf(key string) (model.Series, int, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, x := range s.series {
		if i := slices.Index(x.Keys, key); i >= 0 {
			return cloneSeries(x), i, true
		}
	}
	return model.Series{}, -1, false
}

// CreateSeries creates an empty series
func (s *Store) CreateSeries(name string) model.Series {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := &model.Series{ID: s.newSeriesID(), Name: strings.TrimSpace(name), CreatedAt: time.Now().UnixMilli(), Keys: []string{}}
	s.series[x.ID] = x
	s.touchSeries(x.ID)
	return cloneSeries(x)
}

// newSeriesID makes an unused series ID (call with the lock held)
func (s *Store) newSeriesID() string {
	for {
		id := "s" + strconv.FormatUint(rand.Uint64(), 36)
		if _, used := s.series[id]; !used {
			return id
		}
	}
}

// UpdateSeries changes a series (false if it does not exist).
// Duplicates and non-bookmarked works are dropped, and added works are removed from other series.
// touched is the updated content of the changed series (this one and others works were removed from).
func (s *Store) UpdateSeries(id string, fn func(x *model.Series)) (touched []model.Series, ok bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, ok := s.series[id]
	if !ok {
		return nil, false
	}
	fn(x)
	x.Name = strings.TrimSpace(x.Name)
	keys := []string{}
	for _, k := range x.Keys {
		if _, bookmarked := s.bookmarks[k]; bookmarked && !slices.Contains(keys, k) {
			keys = append(keys, k)
		}
	}
	x.Keys = keys
	s.touchSeries(id)
	touched = append(touched, cloneSeries(x))
	for _, k := range keys {
		touched = append(touched, s.removeFromSeries(k, id)...)
	}
	return touched, true
}

// DeleteSeries deletes a series (the bookmarks of its works remain)
func (s *Store) DeleteSeries(id string) (model.Series, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, ok := s.series[id]
	if !ok {
		return model.Series{}, false
	}
	delete(s.series, id)
	s.touchSeries(id)
	return cloneSeries(x), true
}

// removeFromSeries removes a work from series other than except and returns the changed ones (call with the lock held)
func (s *Store) removeFromSeries(key, except string) []model.Series {
	var out []model.Series
	for id, x := range s.series {
		if id == except || !slices.Contains(x.Keys, key) {
			continue
		}
		x.Keys = slices.DeleteFunc(x.Keys, func(k string) bool { return k == key })
		s.touchSeries(id)
		out = append(out, cloneSeries(x))
	}
	return out
}

// touchSeries writes after 300ms in a batch (series)
func (s *Store) touchSeries(id string) {
	s.changedS[id] = true
	s.scheduleFlush()
}
