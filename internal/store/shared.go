package store

import (
	"encoding/json"
	"log"
	"reflect"
	"slices"

	"poruneko/internal/model"
)

// What devices share when they sync (internal/devsync): the shared parts of the bookmarks, the series not made from
// folders, and what was deleted. Each part of a bookmark is stamped with the time it changed (model.EditedAt), each
// series with its UpdatedAt, and deletions are kept, so that merging takes what changed last.

// deletion is when a shared bookmark or series was deleted
type deletion struct {
	At int64 `json:"at"`
}

func (s *Store) loadDeleted() {
	m, err := loadTable[deletion](s.db, deletedTable)
	if err != nil {
		log.Printf("[store] deleted: %v", err)
		return
	}
	s.deleted = m
}

// markDeleted records a deletion (call with the lock held). A later one of the same thing wins
func (s *Store) markDeleted(key string, at int64) {
	if d, ok := s.deleted[key]; ok && d.At >= at {
		return
	}
	s.deleted[key] = &deletion{At: at}
	s.changedD[key] = true
	s.scheduleFlush()
}

// sharedParts is the part of a bookmark devices share, for comparing
type sharedParts struct {
	Summary model.GallerySummary
	Creator model.CreatorInfo
	Tags    []string
	Title   string
}

func partsOf(b *model.Bookmark) sharedParts {
	return sharedParts{b.Summary, b.Creator, b.Tags, b.CustomTitle}
}

// cloneShared is a deep copy of a bookmark's shared parts (fn may change their slices in place)
func cloneShared(b *model.Bookmark) model.Bookmark {
	var c model.Bookmark
	if data, err := json.Marshal(partsOf(b)); err == nil {
		var p sharedParts
		if json.Unmarshal(data, &p) == nil {
			c.Summary, c.Creator, c.Tags, c.CustomTitle = p.Summary, p.Creator, p.Tags, p.Title
		}
	}
	return c
}

// stamp sets the time of each shared part of b that differs from before
func stamp(b, before *model.Bookmark, now int64) {
	if !reflect.DeepEqual(b.Summary, before.Summary) {
		b.Edited.Summary = now
	}
	if !reflect.DeepEqual(b.Creator, before.Creator) {
		b.Edited.Creator = now
	}
	if !slices.Equal(b.Tags, before.Tags) {
		b.Edited.Tags = now
	}
	if b.CustomTitle != before.CustomTitle {
		b.Edited.Title = now
	}
}

// SyncState is what this device shares: its shared bookmarks without what is its own (their downloads, files and
// chosen thumbnails), the series not made from folders, and the deletions
func (s *Store) SyncState() model.SyncState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	st := model.SyncState{Bookmarks: []model.Bookmark{}, Series: []model.Series{}, Deleted: map[string]int64{}}
	for _, b := range s.bookmarks {
		if !b.Shared() {
			continue
		}
		c := *b
		c.Download, c.ArchiveFile, c.CustomThumb = model.DownloadState{}, "", nil
		st.Bookmarks = append(st.Bookmarks, c)
	}
	for _, x := range s.series {
		if x.Folder == "" {
			st.Series = append(st.Series, cloneSeries(x))
		}
	}
	for k, d := range s.deleted {
		st.Deleted[k] = d.At
	}
	return st
}

// SyncChanges are what applying a sync changed here
type SyncChanges struct {
	// Added are the bookmarks that came from another device
	Added []string
	// Edited are the bookmarks whose work info or creator changed (their files may need renaming)
	Edited []string
	// Removed are the bookmarks another device deleted: the caller removes them (with their downloads)
	Removed []string
	// Bookmarks and Series report whether anything of them changed
	Bookmarks, Series bool
	// SeriesKeys are the works of the series that changed (their file names may hold the series)
	SeriesKeys []string
}

// ApplySync makes this device's shared data what a merge (devsync.Merge) gave. Bookmarks keep what is their own
// here (downloads, files, chosen thumbnails); the ones the merge deleted are only reported, for the caller to
// remove. Series take their works in the merge's order, without works not bookmarked here or in a newer series
func (s *Store) ApplySync(m model.SyncState) SyncChanges {
	s.mu.Lock()
	defer s.mu.Unlock()
	var c SyncChanges

	for k, at := range m.Deleted {
		s.markDeleted(k, at)
	}

	keep := map[string]bool{}
	for _, in := range m.Bookmarks {
		if !in.Shared() {
			continue
		}
		keep[in.Key] = true
		cur, ok := s.bookmarks[in.Key]
		if !ok {
			b := in
			b.Download = model.DownloadState{Status: model.DownloadNone, Total: in.Summary.PageCount}
			b.ArchiveFile, b.CustomThumb = "", nil
			s.bookmarks[b.Key] = &b
			s.touch(b.Key)
			c.Added = append(c.Added, b.Key)
			c.Bookmarks = true
			continue
		}
		if reflect.DeepEqual(partsOf(cur), partsOf(&in)) && cur.Edited == in.Edited && cur.AddedAt == in.AddedAt {
			continue
		}
		if !reflect.DeepEqual(cur.Summary, in.Summary) || !reflect.DeepEqual(cur.Creator, in.Creator) || cur.CustomTitle != in.CustomTitle {
			c.Edited = append(c.Edited, in.Key)
		}
		cur.Summary, cur.Creator, cur.Tags, cur.CustomTitle = in.Summary, in.Creator, in.Tags, in.CustomTitle
		cur.Edited, cur.AddedAt = in.Edited, in.AddedAt
		s.touch(in.Key)
		c.Bookmarks = true
	}
	for k, b := range s.bookmarks {
		if b.Shared() && !keep[k] {
			if _, deleted := m.Deleted["b:"+k]; deleted {
				c.Removed = append(c.Removed, k)
			}
		}
	}

	// series: the merge's, newest first, so a work in two of them stays in the newer one
	in := slices.Clone(m.Series)
	slices.SortFunc(in, func(a, b model.Series) int { return int(seriesTime(&b) - seriesTime(&a)) })
	taken := map[string]bool{}
	for _, x := range s.series {
		if x.Folder != "" {
			for _, k := range x.Keys {
				taken[k] = true
			}
		}
	}
	ids := map[string]bool{}
	for _, x := range in {
		if x.Folder != "" {
			continue
		}
		ids[x.ID] = true
		keys := []string{}
		for _, k := range x.Keys {
			if _, ok := s.bookmarks[k]; ok && !taken[k] && !slices.Contains(c.Removed, k) {
				keys = append(keys, k)
				taken[k] = true
			}
		}
		n := x
		n.Keys = keys
		cur, had := s.series[x.ID]
		if had && reflect.DeepEqual(cloneSeries(cur), cloneSeries(&n)) {
			continue
		}
		if had {
			c.SeriesKeys = append(c.SeriesKeys, cur.Keys...)
		}
		c.SeriesKeys = append(c.SeriesKeys, keys...)
		s.series[x.ID] = &n
		s.changedS[x.ID] = true // not touchSeries: it keeps the time it changed on the other device
		c.Series = true
	}
	for id, x := range s.series {
		if x.Folder == "" && !ids[id] {
			if _, deleted := m.Deleted["s:"+id]; deleted {
				c.SeriesKeys = append(c.SeriesKeys, x.Keys...)
				delete(s.series, id)
				s.changedS[id] = true
				c.Series = true
			}
		}
	}
	s.scheduleFlush()
	return c
}

// seriesTime is when a series last changed
func seriesTime(x *model.Series) int64 { return max(x.UpdatedAt, x.CreatedAt) }
