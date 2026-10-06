// Package netx provides common HTTP fetching and caching.
package netx

import (
	"bytes"
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
	// Body is the start of the error response and Header its headers (for plugins that read the site's error
	// message or its rate limits)
	Body   []byte
	Header http.Header
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
	// Timeout is how long a request may go without progress (default 30 seconds): until the response starts, then
	// between parts of its body. A large body from a slow server keeps going while data comes (up to maxTransfer)
	Timeout time.Duration
	// MaxBackoff caps the wait between retries (default 15 seconds)
	MaxBackoff time.Duration
	// Method is the HTTP method (GET if empty); Body is sent with it
	Method string
	Body   []byte
}

// Response is the body and some headers
type Response struct {
	Body   []byte
	Header http.Header
}

// Get is a GET (or o.Method) with retries and a timeout (4xx fails immediately)
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
		res, err := do(ctx, o.Method, url, o.Headers, o.Body, timeout)
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

// maxTransfer is the longest a request may take in all, however steadily its body comes
const maxTransfer = 10 * time.Minute

func do(ctx context.Context, method, url string, headers map[string]string, body []byte, timeout time.Duration) (*Response, error) {
	ctx, cancel := context.WithTimeout(ctx, maxTransfer)
	defer cancel()
	// cancelled when nothing comes for timeout: the timer starts again whenever part of the body arrives
	stall := time.AfterFunc(timeout, cancel)
	defer stall.Stop()
	if method == "" {
		method = http.MethodGet
	}
	var rd io.Reader
	if body != nil {
		rd = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, rd)
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
		head, _ := io.ReadAll(io.LimitReader(res.Body, 4<<10))
		io.Copy(io.Discard, res.Body)
		he := &HTTPError{Status: res.StatusCode, URL: url, Body: head, Header: res.Header}
		if sec, err := strconv.Atoi(res.Header.Get("Retry-After")); err == nil {
			he.RetryAfter = time.Duration(sec) * time.Second
		}
		return nil, he
	}
	data, err := io.ReadAll(&progressReader{r: res.Body, onRead: func() { stall.Reset(timeout) }})
	if err != nil {
		return nil, err
	}
	return &Response{Body: data, Header: res.Header}, nil
}

// progressReader tells when part of a body has arrived
type progressReader struct {
	r      io.Reader
	onRead func()
}

func (p *progressReader) Read(b []byte) (int, error) {
	n, err := p.r.Read(b)
	if n > 0 {
		p.onRead()
	}
	return n, err
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
