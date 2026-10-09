package plugin

import (
	"context"
	"fmt"
	"log"
	"sync"

	"poruneko/internal/model"
	"poruneko/internal/site"
)

// The methods of a site plugin (ABI 2). Required: list, work (a work with its pages), source (where a page, a
// thumbnail or an attachment is fetched from). Optional (its info's features): suggest, favorites (works by several
// creators), favoriteNames (what its own Favorites is narrowed by), webURL, fromURL (the work at a URL), tagNamesJa
// (Japanese names of its tags), status (lines of its state for its tab), viewHeader / viewAction (the header of a
// view of its own and its buttons).

// Site makes a site plugin a site of the app
type Site struct {
	p *Plugin

	tagsOnce sync.Once
	tagsJa   map[string]string
}

// NewSite wraps a loaded site plugin
func NewSite(p *Plugin) *Site { return &Site{p: p} }

var (
	_ site.Provider         = (*Site)(nil)
	_ site.AnyLister        = (*anySite)(nil)
	_ site.WebURLer         = (*Site)(nil)
	_ site.AttachmentSource = (*Site)(nil)
	_ site.URLReader        = (*Site)(nil)
	_ site.StatusTeller     = (*Site)(nil)
	_ site.ViewSource       = (*Site)(nil)
	_ site.FavoriteNamer    = (*Site)(nil)
)

func (s *Site) ID() model.SiteID { return s.p.Info.ID }
func (s *Site) Name() string     { return s.p.Info.Name }

func (s *Site) List(ctx context.Context, q model.ListQuery) (*model.ListResult, error) {
	var r model.ListResult
	if err := s.p.Call(ctx, "list", q, &r); err != nil {
		return nil, err
	}
	s.fixList(&r)
	return &r, nil
}

func (s *Site) Gallery(ctx context.Context, id string) (*model.GalleryDetail, error) {
	var d model.GalleryDetail
	if err := s.p.Call(ctx, "work", map[string]string{"id": id}, &d); err != nil {
		return nil, err
	}
	s.fix(&d.GallerySummary)
	if d.Pages == nil {
		d.Pages = []model.PageInfo{}
	}
	for i := range d.Attachments {
		if d.Attachments[i].Kind == "" {
			d.Attachments[i].Kind = model.AttachmentKind(d.Attachments[i].Name)
		}
	}
	return &d, nil
}

// source asks where a file of a work is fetched from (kind: page | thumb | attachment)
func (s *Site) source(ctx context.Context, id, kind string, index int, big, retry bool) (*site.ImageSource, error) {
	var src site.ImageSource
	q := map[string]any{"id": id, "kind": kind, "index": index, "big": big, "retry": retry}
	if err := s.p.Call(ctx, "source", q, &src); err != nil {
		return nil, err
	}
	return &src, nil
}

func (s *Site) Image(ctx context.Context, id string, index int, retry bool) (*site.ImageSource, error) {
	return s.source(ctx, id, "page", index, false, retry)
}

func (s *Site) Thumb(ctx context.Context, id string, index int, big, retry bool) (*site.ImageSource, error) {
	return s.source(ctx, id, "thumb", index, big, retry)
}

// Attachment is where an attachment of a work is fetched from
func (s *Site) Attachment(ctx context.Context, id string, index int, retry bool) (*site.ImageSource, error) {
	return s.source(ctx, id, "attachment", index, false, retry)
}

// Suggest completes the search box (nothing when the plugin does not)
func (s *Site) Suggest(ctx context.Context, term string) ([]model.Suggestion, error) {
	out := []model.Suggestion{}
	if !s.p.Info.Has("suggest") {
		return out, nil
	}
	err := s.p.Call(ctx, "suggest", map[string]string{"term": term}, &out)
	return out, err
}

// WebURL is the work's page on the site ("" if the plugin does not tell)
func (s *Site) WebURL(id string) string {
	if !s.p.Info.Has("webURL") {
		return ""
	}
	var u string
	if err := s.p.Call(context.Background(), "webURL", map[string]string{"id": id}, &u); err != nil {
		return ""
	}
	return u
}

// FileNameFormat is the file name format the plugin suggests for its works ("" for none)
func (s *Site) FileNameFormat() string { return s.p.Info.FileNameFormat }

// FromURL returns the id of the work at rawURL ("" if it is not one of the site's works or the plugin cannot tell)
func (s *Site) FromURL(ctx context.Context, rawURL string) (string, error) {
	if !s.p.Info.Has("fromURL") {
		return "", nil
	}
	var id string
	err := s.p.Call(ctx, "fromURL", map[string]string{"url": rawURL}, &id)
	return id, err
}

// Status is the site's state as the plugin tells it (none if it does not)
func (s *Site) Status(ctx context.Context) []model.StatusLine {
	out := []model.StatusLine{}
	if !s.p.Info.Has("status") {
		return out
	}
	if err := s.p.Call(ctx, "status", nil, &out); err != nil {
		log.Printf("[plugin %s] status: %v", s.p.Info.ID, err)
	}
	return out
}

// ViewHeader is the header of the plugin's own screen for an input (nil if the plugin has none)
func (s *Site) ViewHeader(ctx context.Context, view, query string) (*model.ViewHeader, error) {
	if !s.p.Info.Has("viewHeader") {
		return nil, nil
	}
	var h *model.ViewHeader
	err := s.p.Call(ctx, "viewHeader", map[string]string{"view": view, "query": query}, &h)
	return h, err
}

// ViewAction does a button of the header of the plugin's own screen; the message is shown after it ("" for none)
func (s *Site) ViewAction(ctx context.Context, view, query, action string) (model.Text, error) {
	if !s.p.Info.Has("viewAction") {
		return nil, fmt.Errorf("plugin %s has no actions", s.p.Info.ID)
	}
	var r struct {
		Message model.Text `json:"message"`
	}
	err := s.p.Call(ctx, "viewAction", map[string]string{"view": view, "query": query, "action": action}, &r)
	return r.Message, err
}

// uiLang is the UI language, for the texts a plugin makes ("ja" | "en")
func uiLang() string {
	if model.English() {
		return "en"
	}
	return "ja"
}

// TagNamesJa returns the Japanese names of the site's tags (English name -> Japanese), asked once
func (s *Site) TagNamesJa() map[string]string {
	s.tagsOnce.Do(func() {
		s.tagsJa = map[string]string{}
		if s.p.Info.Has("tagNamesJa") {
			if err := s.p.Call(context.Background(), "tagNamesJa", nil, &s.tagsJa); err != nil {
				log.Printf("[plugin %s] tagNamesJa: %v", s.p.Info.ID, err)
			}
		}
	})
	return s.tagsJa
}

// fixList fills in what a plugin may leave out of a list (keys, empty lists), so the screens can rely on them
func (s *Site) fixList(r *model.ListResult) {
	if r.Items == nil {
		r.Items = []model.GallerySummary{}
	}
	if r.Failed == nil {
		r.Failed = []string{}
	}
	for i := range r.Items {
		s.fix(&r.Items[i])
	}
}

// fix sets the work's key from its id and makes its lists empty instead of null
func (s *Site) fix(g *model.GallerySummary) {
	g.Site = s.p.Info.ID
	g.Key = model.MakeKey(g.Site, g.ID)
	for _, l := range []*[]string{&g.Artists, &g.Groups, &g.Parodies, &g.Characters} {
		if *l == nil {
			*l = []string{}
		}
	}
	if g.Tags == nil {
		g.Tags = []model.TagInfo{}
	}
}

// anySite is a site plugin that also lists works by several creators (Favorites)
type anySite struct{ *Site }

// FavoriteNames are what the plugin's own Favorites can be narrowed by (none if it gives none)
func (s *Site) FavoriteNames(ctx context.Context) ([]model.FavoriteName, error) {
	out := []model.FavoriteName{}
	if !s.p.Info.Has("favoriteNames") {
		return out, nil
	}
	err := s.p.Call(ctx, "favoriteNames", nil, &out)
	return out, err
}

func (s *anySite) ListAny(ctx context.Context, q site.AnyQuery) (*model.ListResult, error) {
	var r model.ListResult
	if err := s.p.Call(ctx, "favorites", q, &r); err != nil {
		return nil, err
	}
	s.fixList(&r)
	return &r, nil
}

// Provider is what to register for a site plugin (with Favorites when it answers favorites)
func Provider(p *Plugin) site.Provider {
	s := NewSite(p)
	if p.Info.Has("favorites") {
		return &anySite{s}
	}
	return s
}
