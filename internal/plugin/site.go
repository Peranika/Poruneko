package plugin

import (
	"context"
	"fmt"
	"log"
	"sync"

	"poruneko/internal/model"
	"poruneko/internal/site"
)

// The methods of a site plugin. Required: list, gallery, image, thumb, suggest. Optional (listed in the
// capabilities): listAny (Favorites), webURL, tagNamesJa (Japanese names of the site's tags), invalidate,
// fromURL (the id of the work at a URL), attachment (where an attachment of a work is fetched from), favoriteNames (what its own Favorites can be narrowed by), status (lines of the site's state for its tab), viewHeader / viewAction
// (the header of the plugin's own screen and its buttons).

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
	if err := s.p.Call(ctx, "gallery", map[string]string{"id": id}, &d); err != nil {
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

func (s *Site) Image(ctx context.Context, id string, index int, format string) (*site.ImageSource, error) {
	var src site.ImageSource
	err := s.p.Call(ctx, "image", map[string]any{"id": id, "index": index, "format": format}, &src)
	return &src, err
}

func (s *Site) Thumb(ctx context.Context, id string, index int, big bool) (*site.ImageSource, error) {
	var src site.ImageSource
	err := s.p.Call(ctx, "thumb", map[string]any{"id": id, "index": index, "big": big}, &src)
	return &src, err
}

func (s *Site) Suggest(ctx context.Context, term string) ([]model.Suggestion, error) {
	out := []model.Suggestion{}
	err := s.p.Call(ctx, "suggest", map[string]string{"term": term}, &out)
	return out, err
}

func (s *Site) Invalidate() {
	if s.p.Info.Has("invalidate") {
		if err := s.p.Call(context.Background(), "invalidate", nil, nil); err != nil {
			log.Printf("[plugin %s] invalidate: %v", s.p.Info.ID, err)
		}
	}
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

// Attachment is where an attachment of a work is fetched from (the plugin's "attachment")
func (s *Site) Attachment(ctx context.Context, id string, index int) (*site.ImageSource, error) {
	if !s.p.Info.Has("attachment") {
		return nil, fmt.Errorf("plugin %s has no attachments", s.p.Info.ID)
	}
	var src site.ImageSource
	err := s.p.Call(ctx, "attachment", map[string]any{"id": id, "index": index}, &src)
	return &src, err
}

// FileNameFormat is the file name format the plugin suggests for its works ("" for none)
func (s *Site) FileNameFormat() string { return s.p.Info.FileNameFormat }

// SiteCreators reports whether the works' creators are their own artists and groups (no DLsite / FANZA lookup)
func (s *Site) SiteCreators() bool { return s.p.Info.SiteCreators }

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
	if err := s.p.Call(ctx, "status", map[string]string{"lang": uiLang()}, &out); err != nil {
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
	err := s.p.Call(ctx, "viewHeader", map[string]string{"view": view, "query": query, "lang": uiLang()}, &h)
	return h, err
}

// ViewAction does a button of the header of the plugin's own screen; the message is shown after it ("" for none)
func (s *Site) ViewAction(ctx context.Context, view, query, action string) (model.Text, error) {
	var r struct {
		Message model.Text `json:"message"`
	}
	err := s.p.Call(ctx, "viewAction", map[string]string{"view": view, "query": query, "action": action, "lang": uiLang()}, &r)
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

// anySite is a site plugin that also lists works by several artists (Favorites)
type anySite struct{ *Site }

// FavoriteNames are what the plugin's own Favorites can be narrowed by (none if it gives none)
func (s *Site) FavoriteNames(ctx context.Context) ([]model.FavoriteName, error) {
	out := []model.FavoriteName{}
	if !s.p.Info.Has("favoriteNames") {
		return out, nil
	}
	err := s.p.Call(ctx, "favoriteNames", map[string]string{"lang": uiLang()}, &out)
	return out, err
}

func (s *anySite) ListAny(ctx context.Context, q site.AnyQuery) (*model.ListResult, error) {
	var r model.ListResult
	if err := s.p.Call(ctx, "listAny", q, &r); err != nil {
		return nil, err
	}
	s.fixList(&r)
	return &r, nil
}

// Provider is what to register for a site plugin (with Favorites support when it answers listAny)
func Provider(p *Plugin) site.Provider {
	s := NewSite(p)
	if p.Info.Has("listAny") {
		return &anySite{s}
	}
	return s
}
