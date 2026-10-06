package model

import (
	"strings"
	"testing"
)

func TestFilterPages(t *testing.T) {
	mk := func(pages ...int) *ListResult {
		r := &ListResult{}
		for _, p := range pages {
			r.Items = append(r.Items, GallerySummary{PageCount: p})
		}
		return r
	}
	cases := []struct {
		min, max   int
		want, hide int
	}{
		{0, 0, 5, 0},
		{20, 0, 3, 2},
		{0, 30, 3, 2},
		{20, 30, 1, 4},
		{100, 0, 0, 5},
	}
	for _, c := range cases {
		r := mk(5, 19, 20, 31, 40)
		r.FilterPages(c.min, c.max)
		if len(r.Items) != c.want || r.Hidden != c.hide {
			t.Errorf("%d〜%d: items=%d hidden=%d, want %d %d", c.min, c.max, len(r.Items), r.Hidden, c.want, c.hide)
		}
	}
}

func TestFilterStats(t *testing.T) {
	spec := &BrowseSpec{Filters: []FilterSpec{{ID: "minLikes", Stat: "likes"}, {ID: "sort"}}}
	r := &ListResult{Items: []GallerySummary{
		{ID: "a", Stats: map[string]int{"likes": 5}},
		{ID: "b", Stats: map[string]int{"likes": 100}},
		{ID: "c"}, // no stat: kept
	}}
	r.FilterStats(spec, map[string]string{"minLikes": "50", "sort": "new"}, nil)
	if len(r.Items) != 2 || r.Items[0].ID != "b" || r.Items[1].ID != "c" || r.Hidden != 1 {
		t.Errorf("items=%v hidden=%d", r.Items, r.Hidden)
	}
	r.FilterStats(spec, map[string]string{"minLikes": "0"}, nil)
	if len(r.Items) != 2 {
		t.Errorf("0 should not filter: %v", r.Items)
	}
}

// an owner's own value overrides the common one for their works only
func TestFilterStatsOwners(t *testing.T) {
	spec := &BrowseSpec{Filters: []FilterSpec{{ID: "minLikes", Stat: "likes"}}}
	r := &ListResult{Items: []GallerySummary{
		{ID: "a", Owner: "big", Stats: map[string]int{"likes": 500}},
		{ID: "b", Owner: "big", Stats: map[string]int{"likes": 5000}},
		{ID: "c", Owner: "small", Stats: map[string]int{"likes": 20}},
		{ID: "d", Stats: map[string]int{"likes": 200}},
	}}
	owners := map[string]map[string]string{"big": {"minLikes": "1000"}, "small": {"minLikes": "0"}}
	r.FilterStats(spec, map[string]string{"minLikes": "100"}, owners)
	var ids []string
	for _, it := range r.Items {
		ids = append(ids, it.ID)
	}
	if strings.Join(ids, ",") != "b,c,d" || r.Hidden != 1 {
		t.Errorf("kept %v hidden %d", ids, r.Hidden)
	}
}

func TestAttachmentKind(t *testing.T) {
	for name, want := range map[string]string{
		"set.ZIP": "archive", "a.b.7z": "archive", "page.psd": "document", "x.pdf": "document",
		"voice.mp3": "audio", "readme": "other", "data.bin": "other",
	} {
		if got := AttachmentKind(name); got != want {
			t.Errorf("%s: %s, want %s", name, got, want)
		}
	}
}
