package model

import "testing"

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
