package update

import "testing"

func TestCompare(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want int // sign
	}{
		{"0.4.0", "0.3.0", 1},
		{"0.3.0", "0.3.0", 0},
		{"0.10.0", "0.9.9", 1},
		{"1.0", "0.99.99", 1},
		{"0.3.1", "0.3", 1},
		{"0.2.9", "0.3.0", -1},
	} {
		got := Compare(c.a, c.b)
		if (got > 0) != (c.want > 0) || (got < 0) != (c.want < 0) {
			t.Errorf("Compare(%q, %q) = %d", c.a, c.b, got)
		}
	}
}
