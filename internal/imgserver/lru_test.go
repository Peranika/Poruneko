package imgserver

import "testing"

func TestByteLRU(t *testing.T) {
	c := newByteLRU(100)
	c.Put("a", make([]byte, 20), "webp")
	c.Put("b", make([]byte, 20), "webp")
	c.Put("c", make([]byte, 20), "webp")
	c.Get("a") // mark a as recently used
	c.Put("d", make([]byte, 20), "webp")
	c.Put("e", make([]byte, 20), "webp") // total 100 fits
	c.Put("f", make([]byte, 20), "webp") // exceeds it, so the oldest, b, is evicted
	if _, _, ok := c.Get("b"); ok {
		t.Error("b should be evicted")
	}
	for _, k := range []string{"a", "c", "d", "e", "f"} {
		if _, _, ok := c.Get(k); !ok {
			t.Errorf("%s should remain", k)
		}
	}
	c.Put("big", make([]byte, 60), "webp") // entries over 1/4 of the limit are not stored
	if _, _, ok := c.Get("big"); ok {
		t.Error("oversized entry should not be cached")
	}
}
