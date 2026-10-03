// Package netx provides common HTTP fetching and caching.
package netx

import (
	"context"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"strconv"
	"sync"
	"time"
)

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

var client = &http.Client{
	Transport: &http.Transport{
		Proxy:               http.ProxyFromEnvironment,
		MaxIdleConnsPerHost: 16,
		IdleConnTimeout:     90 * time.Second,
	},
}

type HTTPError struct {
	Status     int
	URL        string
	RetryAfter time.Duration // Retry-After of a 429/503
}

func (e *HTTPError) Error() string { return fmt.Sprintf("HTTP %d: %s", e.Status, e.URL) }

// IsStatus reports whether err is an HTTPError with the given status
func IsStatus(err error, codes ...int) bool {
	he, ok := err.(*HTTPError)
	if !ok {
		return false
	}
	for _, c := range codes {
		if he.Status == c {
			return true
		}
	}
	return false
}

type Opts struct {
	Headers map[string]string
	Retries int // default 2
	Timeout time.Duration
	// MaxBackoff caps the wait between retries (default 15 seconds)
	MaxBackoff time.Duration
}

// Response is the body and some headers
type Response struct {
	Body   []byte
	Header http.Header
}

// Get is a GET with retries and a timeout (4xx fails immediately)
func Get(ctx context.Context, url string, o *Opts) (*Response, error) {
	if o == nil {
		o = &Opts{}
	}
	retries := o.Retries
	if retries == 0 {
		retries = 2
	} else if retries < 0 {
		retries = 0
	}
	timeout := o.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	var lastErr error
	for attempt := 0; attempt <= retries; attempt++ {
		res, err := doGet(ctx, url, o.Headers, timeout)
		if err == nil {
			return res, nil
		}
		lastErr = err
		he, isHTTP := err.(*HTTPError)
		if isHTTP && he.Status < 500 && he.Status != http.StatusTooManyRequests {
			return nil, err
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if attempt < retries {
			// exponential backoff + jitter (so retries are not simultaneous under congestion)
			wait := time.Duration(500<<attempt)*time.Millisecond + time.Duration(rand.Int64N(int64(500*time.Millisecond)))
			if isHTTP && he.RetryAfter > 0 {
				wait = he.RetryAfter
			}
			maxWait := o.MaxBackoff
			if maxWait == 0 {
				maxWait = 15 * time.Second
			}
			wait = min(wait, maxWait)
			select {
			case <-time.After(wait):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
	}
	return nil, lastErr
}

func doGet(ctx context.Context, url string, headers map[string]string, timeout time.Duration) (*Response, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", UA)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		io.Copy(io.Discard, res.Body)
		he := &HTTPError{Status: res.StatusCode, URL: url}
		if sec, err := strconv.Atoi(res.Header.Get("Retry-After")); err == nil {
			he.RetryAfter = time.Duration(sec) * time.Second
		}
		return nil, he
	}
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	return &Response{Body: body, Header: res.Header}, nil
}

// ---------------------------------------------------------------- TTL cache

type entry[V any] struct {
	v   V
	exp time.Time
}

// Cache is a simple TTL cache (drops an arbitrary entry when over the limit)
type Cache[V any] struct {
	mu  sync.Mutex
	m   map[string]entry[V]
	ttl time.Duration
	max int
}

func NewCache[V any](ttl time.Duration, max int) *Cache[V] {
	return &Cache[V]{m: map[string]entry[V]{}, ttl: ttl, max: max}
}

func (c *Cache[V]) Get(k string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[k]
	if !ok || time.Now().After(e.exp) {
		delete(c.m, k)
		var zero V
		return zero, false
	}
	return e.v, true
}

func (c *Cache[V]) Set(k string, v V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.m) >= c.max {
		for kk := range c.m {
			delete(c.m, kk)
			break
		}
	}
	c.m[k] = entry[V]{v: v, exp: time.Now().Add(c.ttl)}
}

func (c *Cache[V]) Delete(k string) {
	c.mu.Lock()
	delete(c.m, k)
	c.mu.Unlock()
}

// ---------------------------------------------------------------- Concurrency

// Group merges concurrent calls with the same key (like singleflight)
type Group[V any] struct {
	mu sync.Mutex
	m  map[string]*call[V]
}

type call[V any] struct {
	wg  sync.WaitGroup
	v   V
	err error
}

func (g *Group[V]) Do(key string, fn func() (V, error)) (V, error) {
	g.mu.Lock()
	if g.m == nil {
		g.m = map[string]*call[V]{}
	}
	if c, ok := g.m[key]; ok {
		g.mu.Unlock()
		c.wg.Wait()
		return c.v, c.err
	}
	c := &call[V]{}
	c.wg.Add(1)
	g.m[key] = c
	g.mu.Unlock()
	c.v, c.err = fn()
	c.wg.Done()
	g.mu.Lock()
	delete(g.m, key)
	g.mu.Unlock()
	return c.v, c.err
}

// ParallelEach runs fn with limited concurrency
func ParallelEach[T any](items []T, limit int, fn func(i int, t T)) {
	if limit < 1 {
		limit = 1
	}
	sem := make(chan struct{}, limit)
	var wg sync.WaitGroup
	for i, t := range items {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, t T) {
			defer func() { <-sem; wg.Done() }()
			fn(i, t)
		}(i, t)
	}
	wg.Wait()
}

// NewRequest makes a GET request with the User-Agent set (used with Client to read the body incrementally)
func NewRequest(ctx context.Context, url string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", UA)
	return req, nil
}

// Client is the shared HTTP client
func Client() *http.Client { return client }
