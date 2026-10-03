// Package site provides the abstraction of supported sites.
// To add a site, implement Provider and Register it.
package site

import (
	"context"
	"fmt"
	"sync"

	"poruneko/internal/model"
)

// ImageSource is where an image is fetched from
type ImageSource struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
	Ext     string            `json:"ext"`
}

type Provider interface {
	ID() model.SiteID
	Name() string
	List(ctx context.Context, q model.ListQuery) (*model.ListResult, error)
	Gallery(ctx context.Context, id string) (*model.GalleryDetail, error)
	// Image returns where a page image is fetched from
	Image(ctx context.Context, id string, index int, format string) (*ImageSource, error)
	// Thumb returns where a thumbnail is fetched from
	Thumb(ctx context.Context, id string, index int, big bool) (*ImageSource, error)
	Suggest(ctx context.Context, term string) ([]model.Suggestion, error)
	// Invalidate is called when a source URL seems to have expired
	Invalidate()
}

var (
	mu        sync.RWMutex
	providers = map[model.SiteID]Provider{}
	order     []model.SiteID
)

func Register(p Provider) {
	mu.Lock()
	if _, ok := providers[p.ID()]; !ok {
		order = append(order, p.ID())
	}
	providers[p.ID()] = p
	mu.Unlock()
}

// All returns the registered sites in the order they were registered
func All() []Provider {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]Provider, 0, len(order))
	for _, id := range order {
		out = append(out, providers[id])
	}
	return out
}

// Default returns the site the browse screens use (the first registered; nil when no site is available)
func Default() Provider {
	mu.RLock()
	defer mu.RUnlock()
	if len(order) == 0 {
		return nil
	}
	return providers[order[0]]
}

// WebURLer is a site that has a web page for each work
type WebURLer interface {
	WebURL(id string) string
}

// WebURL returns the web page of the work with this key ("" when its site is not available or has none)
func WebURL(key string) string {
	s, id, err := model.ParseKey(key)
	if err != nil {
		return ""
	}
	p, err := Get(s)
	if err != nil {
		return ""
	}
	if w, ok := p.(WebURLer); ok {
		return w.WebURL(id)
	}
	return ""
}

func Get(id model.SiteID) (Provider, error) {
	mu.RLock()
	defer mu.RUnlock()
	p, ok := providers[id]
	if !ok {
		return nil, fmt.Errorf("unsupported site: %s", id)
	}
	return p, nil
}

// AnyQuery is the query for listing "works with any of the tags"
type AnyQuery struct {
	Tags    []string          `json:"tags"`    // "artist:xxx" / "group:yyy" (any of them)
	Filters map[string]string `json:"filters"` // the values of the plugin's filters for Favorites
	Page    int               `json:"page"`    // 1-based
	Exclude map[string]bool   `json:"exclude"` // keys of works to exclude (bookmarked ones etc.)
}

// TagNamer is a site that has Japanese names for its tags
type TagNamer interface {
	TagNamesJa() map[string]string
}

// AnyLister is a site that can list "works with any of the tags" newest first (used by Favorites)
type AnyLister interface {
	ListAny(ctx context.Context, q AnyQuery) (*model.ListResult, error)
}
