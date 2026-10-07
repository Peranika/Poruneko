// Package devsync syncs the bookmarks, series and tags between the user's devices on the same network: devices
// pair once with a code one shows and the other enters, then find each other on the network and exchange their
// shared data (model.SyncState), encrypted with the secret the pairing gave them. Each side merges what it gets with
// its own (Merge) and keeps the result, so after a sync both have the same.
package devsync

import (
	"cmp"
	"slices"
	"time"

	"poruneko/internal/model"
)

// deletionsKept is how long a deletion is remembered: a device that has not synced for longer brings the work back
const deletionsKept = 365 * 24 * time.Hour

// Merge combines two devices' shared data: each part of a bookmark from the one that changed it last, each series
// from the one that changed it last, and what either deleted after it last changed stays deleted
func Merge(a, b model.SyncState, now time.Time) model.SyncState {
	out := model.SyncState{Bookmarks: []model.Bookmark{}, Series: []model.Series{}, Deleted: map[string]int64{}}
	oldest := now.Add(-deletionsKept).UnixMilli()
	for _, d := range []map[string]int64{a.Deleted, b.Deleted} {
		for k, at := range d {
			if at >= oldest && at > out.Deleted[k] {
				out.Deleted[k] = at
			}
		}
	}

	bms := map[string]model.Bookmark{}
	for _, x := range a.Bookmarks {
		bms[x.Key] = x
	}
	for _, y := range b.Bookmarks {
		if x, ok := bms[y.Key]; ok {
			bms[y.Key] = mergeBookmark(x, y)
		} else {
			bms[y.Key] = y
		}
	}
	for k, x := range bms {
		if at, ok := out.Deleted["b:"+k]; ok && at >= lastChange(&x) {
			continue
		}
		out.Bookmarks = append(out.Bookmarks, x)
	}
	slices.SortFunc(out.Bookmarks, func(x, y model.Bookmark) int { return cmp.Compare(x.Key, y.Key) })

	series := map[string]model.Series{}
	for _, x := range append(slices.Clone(a.Series), b.Series...) {
		if cur, ok := series[x.ID]; !ok || seriesTime(&x) > seriesTime(&cur) {
			series[x.ID] = x
		}
	}
	for id, x := range series {
		if at, ok := out.Deleted["s:"+id]; ok && at >= seriesTime(&x) {
			continue
		}
		out.Series = append(out.Series, x)
	}
	slices.SortFunc(out.Series, func(x, y model.Series) int { return cmp.Compare(x.ID, y.ID) })
	return out
}

// mergeBookmark takes each shared part from the bookmark that changed it last (a on a tie)
func mergeBookmark(a, b model.Bookmark) model.Bookmark {
	out := a
	if partTime(b.Edited.Summary, &b) > partTime(a.Edited.Summary, &a) {
		out.Summary, out.Edited.Summary = b.Summary, b.Edited.Summary
	}
	if partTime(b.Edited.Creator, &b) > partTime(a.Edited.Creator, &a) {
		out.Creator, out.Edited.Creator = b.Creator, b.Edited.Creator
	}
	if partTime(b.Edited.Tags, &b) > partTime(a.Edited.Tags, &a) {
		out.Tags, out.Edited.Tags = b.Tags, b.Edited.Tags
	}
	if partTime(b.Edited.Title, &b) > partTime(a.Edited.Title, &a) {
		out.CustomTitle, out.Edited.Title = b.CustomTitle, b.Edited.Title
	}
	// the work was bookmarked when it was first bookmarked anywhere
	out.AddedAt = min(a.AddedAt, b.AddedAt)
	return out
}

// partTime is when a part changed: when it was edited, or else when the work was bookmarked
func partTime(edited int64, b *model.Bookmark) int64 {
	if edited > 0 {
		return edited
	}
	return b.AddedAt
}

// lastChange is when anything of a bookmark changed
func lastChange(b *model.Bookmark) int64 {
	return max(b.AddedAt, b.Edited.Summary, b.Edited.Creator, b.Edited.Tags, b.Edited.Title)
}

func seriesTime(x *model.Series) int64 { return max(x.UpdatedAt, x.CreatedAt) }
