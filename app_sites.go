package main

import (
	"context"
	"errors"
	"log"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/loginwin"
	"poruneko/internal/model"
	"poruneko/internal/site"
	"poruneko/internal/store"
)

// API for the sites from site plugins: their lists and screens, what their plugins tell, adding works from URLs,
// and the filter values kept per owner of works

// browseSite is the site with this id (the first site if empty)
func browseSite(id model.SiteID) (site.Provider, error) {
	if id != "" {
		return site.Get(id)
	}
	if p := site.Default(); p != nil {
		return p, nil
	}
	return nil, apperr.New("site.none", "no site plugin is installed")
}

// siteOfBookmark is the site a bookmark belongs to: its key's site, or for a page range work its source's site
func siteOfBookmark(b *model.Bookmark) model.SiteID {
	s, _, _ := model.ParseKey(b.Key)
	if s == model.SiteLocal && b.Summary.Origin != nil {
		s, _, _ = model.ParseKey(b.Summary.Origin.Key)
	}
	return s
}

// Sites returns the available sites (the frontend shows the browse screens only when there is one)
func (a *App) Sites() []model.SiteInfo {
	out := []model.SiteInfo{}
	for _, p := range site.All() {
		_, any := p.(site.AnyLister)
		pi := pluginInfoOf(p.ID())
		info := model.SiteInfo{
			ID: p.ID(), Name: p.Name(), Favorites: any, Dir: a.st.SiteDir(p.ID()),
			Icon: pi.Icon, Browse: pi.Browse, Version: pi.Version, Hosts: pi.DisplayHosts,
			FromURL: pi.Has("fromURL"), Status: pi.Has("status"), Login: pi.Login != nil && a.sh.canLogin(),
			OwnFavorites: pi.OwnFavorites, FavoriteNames: pi.OwnFavorites && pi.Has("favoriteNames"),
			FileNameFormat: pi.FileNameFormat,
		}
		if len(info.Hosts) == 0 {
			info.Hosts = pi.Hosts
		}
		if model.IsLoadMore(pi.LoadMore) {
			info.LoadMore = pi.LoadMore
		}
		out = append(out, info)
	}
	return out
}

// SiteStatus is a site's state as its plugin tells it (such as the API calls left), shown on its tab
func (a *App) SiteStatus(siteID model.SiteID) []model.StatusLine {
	p, err := site.Get(siteID)
	if err != nil {
		return []model.StatusLine{}
	}
	if s, ok := p.(site.StatusTeller); ok {
		ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
		defer cancel()
		return s.Status(ctx)
	}
	return []model.StatusLine{}
}

// SiteLogin opens a window where the user signs in to a site, and returns the plugin's login settings filled from
// the site's cookies (setting id -> value; nil when the window was closed first). The window keeps its own browser
// profile, so signing in again later is only opening it; fresh signs out of the site first (another account).
// title is the window's title (UI text comes from the frontend)
func (a *App) SiteLogin(siteID model.SiteID, title string, fresh bool) (map[string]string, error) {
	spec := pluginInfoOf(siteID).Login
	if spec == nil || len(spec.Cookies) == 0 {
		return nil, apperr.New("login.none", "the site has no login window")
	}
	opts := loginwin.Options{
		Title: title, URL: spec.URL, CookieURL: spec.CookieURL, Fresh: fresh,
		DataPath: filepath.Join(store.DataDir(), "LoginWebView"),
	}
	for _, c := range spec.Cookies {
		k := loginwin.Cookie{Name: c.Name}
		if c.Match != "" {
			re, err := regexp.Compile(c.Match)
			if err != nil {
				return nil, apperr.Wrap(err, "login.failed", "the plugin's cookie pattern is wrong")
			}
			k.Match = re
		}
		opts.Cookies = append(opts.Cookies, k)
	}
	got, err := a.sh.login(opts)
	switch {
	case errors.Is(err, loginwin.ErrClosed):
		return nil, nil
	case errors.Is(err, loginwin.ErrBusy):
		return nil, apperr.New("login.busy", "a login window is already open")
	case errors.Is(err, loginwin.ErrUnsupported):
		return nil, apperr.New("login.unsupported", "login windows are not supported here")
	case err != nil:
		log.Printf("[login] %s: %v", siteID, err)
		return nil, apperr.Wrap(err, "login.failed", "the login window failed")
	}
	out := map[string]string{}
	for _, c := range spec.Cookies {
		out[c.Setting] = got[c.Name]
	}
	log.Printf("[login] %s: signed in", siteID)
	return out, nil
}

// ViewHeader is the header of a plugin's own screen for its input (nil when the plugin shows none)
func (a *App) ViewHeader(siteID model.SiteID, view, query string) (*model.ViewHeader, error) {
	p, err := site.Get(siteID)
	if err != nil {
		return nil, err
	}
	v, ok := p.(site.ViewSource)
	if !ok {
		return nil, nil
	}
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	h, err := v.ViewHeader(ctx, view, query)
	if err != nil {
		log.Printf("[view] %s %s header: %v", siteID, view, err)
	}
	return h, err
}

// ViewAction does a button of a plugin's own screen (such as following a user); the message is shown after it
func (a *App) ViewAction(siteID model.SiteID, view, query, action string) (model.Text, error) {
	p, err := site.Get(siteID)
	if err != nil {
		return nil, err
	}
	v, ok := p.(site.ViewSource)
	if !ok {
		return nil, apperr.New("site.noAction", "the site has no such action")
	}
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	return v.ViewAction(ctx, view, query, action)
}

// OpenAttachment opens an attachment of a work (a file that is not a page) in the browser, from where its site
// says it is now. Downloading attachments into the library comes later; until then this is how they are reached
func (a *App) OpenAttachment(key string, index int) error {
	siteID, id, err := model.ParseKey(key)
	if err != nil {
		return err
	}
	p, err := site.Get(siteID)
	if err != nil {
		return err
	}
	src, ok := p.(site.AttachmentSource)
	if !ok {
		return apperr.New("site.noAction", "the site has no attachments")
	}
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	at, err := src.Attachment(ctx, id, index)
	if err != nil {
		return err
	}
	return a.OpenExternal(at.URL)
}

// WebURL returns the web page of a work on its site ("" when there is none, e.g. local archives)
func (a *App) WebURL(key string) string { return site.WebURL(key) }

func (a *App) List(q model.ListQuery) (*model.ListResult, error) {
	p, err := browseSite(q.Site)
	if err != nil {
		return nil, err
	}
	r, err := p.List(a.ctx, q)
	if err != nil {
		log.Printf("[list] %s (view %q, page %d): %v", p.ID(), q.View, q.Page, err)
		return nil, err
	}
	// the app filters by page count and stats itself, for every plugin (one may have done it already)
	r.FilterPages(q.MinPages, q.MaxPages)
	r.FilterStats(browseSpec(p.ID()), q.Filters, a.st.OwnersOf(p.ID()))
	return r, nil
}

// OwnerSettings are the values of a site's filters kept for one owner of its works (such as an X user), which
// override the common ones for that owner's works wherever they are listed
func (a *App) OwnerSettings(siteID model.SiteID, owner string) map[string]string {
	return a.st.OwnerValues(siteID, owner)
}

// SetOwnerSetting keeps the value of a filter for one owner of a site's works ("" goes back to the common value)
func (a *App) SetOwnerSetting(siteID model.SiteID, owner, filterID, value string) map[string]string {
	return a.st.SetOwnerValue(siteID, owner, filterID, value)
}

// browseSpec is what a site's plugin says about its screens (nil for none)
func browseSpec(id model.SiteID) *model.BrowseSpec { return pluginInfoOf(id).Browse }

// AddBookmarkFromURL bookmarks the work at a URL on one of the sites (such as one copied from the browser)
func (a *App) AddBookmarkFromURL(rawURL string) (model.Bookmark, error) {
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	rawURL = strings.TrimSpace(rawURL)
	for _, p := range site.All() {
		r, ok := p.(site.URLReader)
		if !ok {
			continue
		}
		id, err := r.FromURL(ctx, rawURL)
		if err != nil {
			return model.Bookmark{}, err
		}
		if id == "" {
			continue
		}
		key := model.MakeKey(p.ID(), id)
		if b, ok := a.st.Bookmark(key); ok {
			return b, nil
		}
		d, err := p.Gallery(ctx, id)
		if err != nil {
			return model.Bookmark{}, err
		}
		return a.AddBookmark(d.GallerySummary), nil
	}
	return model.Bookmark{}, apperr.New("bookmark.unknownURL", "no site knows this URL: "+rawURL)
}

func (a *App) Suggest(siteID, term string) ([]model.Suggestion, error) {
	p, err := browseSite(siteID)
	if err != nil {
		return nil, err
	}
	return p.Suggest(a.ctx, term)
}
