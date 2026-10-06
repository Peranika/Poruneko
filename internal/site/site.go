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
	// Entry is the page's file in the zip at URL, for a site whose pages are files of one archive (a pixiv
	// ugoira's frames): the app fetches the zip once and reads each page from it
	Entry string `json:"entry,omitempty"`
	// Crop is the part of the image that is the thumbnail, for a site whose page thumbnails are tiles of one
	// picture (a sprite): the app fetches the picture once and cuts each out
	Crop *Crop `json:"crop,omitempty"`
}

// Crop is a rectangle of a picture, in its pixels
type Crop struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
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

// FileNamer is a site that suggests a file name format for its works
type FileNamer interface {
	FileNameFormat() string
}

// FileNameFormat is the file name format a site suggests ("" for none)
func FileNameFormat(id model.SiteID) string {
	p, err := Get(id)
	if err != nil {
		return ""
	}
	if f, ok := p.(FileNamer); ok {
		return f.FileNameFormat()
	}
	return ""
}

// AttachmentSource is a site whose works have attachments (files that are not pages)
type AttachmentSource interface {
	// Attachment is where an attachment of a work is fetched from (index: GalleryDetail.Attachments[].Index)
	Attachment(ctx context.Context, id string, index int) (*ImageSource, error)
}

// StatusTeller is a site that tells its state (such as the API calls left), shown on its tab
type StatusTeller interface {
	Status(ctx context.Context) []model.StatusLine
}

// ViewSource is a site with screens of its own (BrowseSpec.Views): a header for what was entered, with buttons
type ViewSource interface {
	ViewHeader(ctx context.Context, view, query string) (*model.ViewHeader, error)
	ViewAction(ctx context.Context, view, query, action string) (model.Text, error)
}

// FavoriteNamer is a site whose own Favorites can be narrowed by names it gives (its lists and users...)
type FavoriteNamer interface {
	FavoriteNames(ctx context.Context) ([]model.FavoriteName, error)
}

// URLReader is a site that can tell which of its works a URL is
type URLReader interface {
	// FromURL returns the id of the work at rawURL ("" if the URL is not one of its works)
	FromURL(ctx context.Context, rawURL string) (string, error)
}
