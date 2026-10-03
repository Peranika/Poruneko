package imgserver

import (
	"container/list"
	"sync"
)

// byteLRU is an LRU cache limited by total size (holds prefetched page images)
type byteLRU struct {
	mu    sync.Mutex
	max   int
	size  int
	ll    *list.List
	items map[string]*list.Element
}

type lruEntry struct {
	key  string
	body []byte
	ext  string
}

func newByteLRU(maxBytes int) *byteLRU {
	return &byteLRU{max: maxBytes, ll: list.New(), items: map[string]*list.Element{}}
}

func (c *byteLRU) Get(key string) ([]byte, string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.items[key]; ok {
		c.ll.MoveToFront(e)
		en := e.Value.(*lruEntry)
		return en.body, en.ext, true
	}
	return nil, "", false
}

func (c *byteLRU) Put(key string, body []byte, ext string) {
	if len(body) > c.max/4 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.items[key]; ok {
		c.size -= len(e.Value.(*lruEntry).body)
		c.ll.Remove(e)
		delete(c.items, key)
	}
	c.items[key] = c.ll.PushFront(&lruEntry{key, body, ext})
	c.size += len(body)
	for c.size > c.max {
		last := c.ll.Back()
		en := last.Value.(*lruEntry)
		c.size -= len(en.body)
		c.ll.Remove(last)
		delete(c.items, en.key)
	}
}
