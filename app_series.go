package main

import (
	"log"
	"slices"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"poruneko/internal/apperr"
	"poruneko/internal/model"
)

// API for series (groups of works such as sequels).
// A work belongs to at most one series, and works in a series are ordered by Keys.

func (a *App) SeriesList() []model.Series { return a.st.SeriesList() }

// CreateSeries creates a series with the works in keys (works in other series leave them)
func (a *App) CreateSeries(name string, keys []string) (model.Series, error) {
	if strings.TrimSpace(name) == "" {
		return model.Series{}, apperr.New("series.noName", "series name is required")
	}
	x := a.st.CreateSeries(name)
	return a.updateSeries(x.ID, func(s *model.Series) { s.Keys = keys })
}

func (a *App) RenameSeries(id, name string) (model.Series, error) {
	if strings.TrimSpace(name) == "" {
		return model.Series{}, apperr.New("series.noName", "series name is required")
	}
	return a.updateSeries(id, func(s *model.Series) { s.Name = name })
}

// DeleteSeries deletes a series (the bookmarks of its works remain)
func (a *App) DeleteSeries(id string) error {
	x, ok := a.st.DeleteSeries(id)
	if !ok {
		return apperr.New("series.notFound", "series not found")
	}
	// a series made from a subfolder is not made again
	if x.Folder != "" {
		s := a.st.Settings()
		if !slices.Contains(s.FolderSeriesOff, x.Folder) {
			s.FolderSeriesOff = append(slices.Clone(s.FolderSeriesOff), x.Folder)
			a.st.SetSettings(s)
		}
	}
	a.seriesChanged(x.Keys)
	return nil
}

// AddToSeries appends works to the end of a series (works already in it keep their place)
func (a *App) AddToSeries(id string, keys []string) (model.Series, error) {
	return a.updateSeries(id, func(s *model.Series) { s.Keys = append(s.Keys, keys...) })
}

// RemoveFromSeries removes works from their series
func (a *App) RemoveFromSeries(key string) error {
	x, _, ok := a.st.SeriesOf(key)
	if !ok {
		return nil
	}
	_, err := a.updateSeries(x.ID, func(s *model.Series) {
		s.Keys = slices.DeleteFunc(s.Keys, func(k string) bool { return k == key })
	})
	return err
}

// ReorderSeries orders a series by keys (works not in keys stay at the end)
func (a *App) ReorderSeries(id string, keys []string) (model.Series, error) {
	return a.updateSeries(id, func(s *model.Series) {
		members := s.Keys
		s.Keys = slices.DeleteFunc(slices.Clone(keys), func(k string) bool { return !slices.Contains(members, k) })
		for _, k := range members {
			if !slices.Contains(s.Keys, k) {
				s.Keys = append(s.Keys, k)
			}
		}
	})
}

// updateSeries changes the series and reports the change
func (a *App) updateSeries(id string, fn func(s *model.Series)) (model.Series, error) {
	before, _ := a.st.GetSeries(id)
	touched, ok := a.st.UpdateSeries(id, fn)
	if !ok {
		return model.Series{}, apperr.New("series.notFound", "series not found")
	}
	// works whose numbers may change: works in the series before the change and works in the changed series
	affected := slices.Clone(before.Keys)
	for _, x := range touched {
		affected = append(affected, x.Keys...)
	}
	a.seriesChanged(affected)
	return touched[0], nil
}

// seriesChanged reports a series change to the frontend and, if the file name format uses the
// series name or number, renames the cbz files of the affected works
func (a *App) seriesChanged(affected []string) {
	runtime.EventsEmit(a.ctx, "series:changed")
	if !strings.Contains(a.st.Settings().FileNameFormat, "{series") || len(affected) == 0 {
		return
	}
	slices.Sort(affected)
	affected = slices.Compact(affected)
	go func() {
		// one at a time, so that quick successive reorders do not move the same work concurrently
		a.relocMu.Lock()
		defer a.relocMu.Unlock()
		moved := false
		for _, k := range affected {
			before := a.lib.ArchivePath(k)
			if before == "" {
				continue
			}
			after, err := a.lib.Relocate(k)
			if err != nil {
				log.Printf("[series] %s: rename: %v", k, err)
			}
			moved = moved || after != before
		}
		if moved {
			a.notifyBookmarks()
		}
	}()
}
