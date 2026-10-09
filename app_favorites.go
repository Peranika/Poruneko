package main

import (
	"context"
	"log"
	"slices"
	"strings"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/meta"
	"poruneko/internal/model"
	"poruneko/internal/site"
)

// Favorites: lists works across the site involving the artists (and groups) of bookmarked works.

// favoriteNames collects artist and group names from the bookmarks that can be searched on the site.
// Japanese names fetched from DLsite etc. cannot be searched on the site, so the site's spelling is used.
// With excludeCollective, anthologies and magazines (works with many artists) are left out.
func (a *App) favoriteNames(siteID model.SiteID, excludeCollective bool) []model.FavoriteName {
	// a kind of name that stands for another, as a plugin's screen says (a user's display name for their id): the
	// other's entry shows it, and it is not listed apart
	aliasOf := map[string]string{}
	if br := pluginInfoOf(string(siteID)).Browse; br != nil {
		for _, v := range br.Views {
			for _, al := range v.Aliases {
				if len(v.Namespaces) > 0 && al != v.Namespaces[0] {
					aliasOf[al] = v.Namespaces[0]
				}
			}
		}
	}
	found := map[string]*model.FavoriteName{}
	add := func(ns, name, display string) {
		name = strings.ToLower(strings.TrimSpace(name))
		if name == "" {
			return
		}
		tag := ns + ":" + strings.ReplaceAll(name, " ", "_")
		f, ok := found[tag]
		if ok {
			f.Bookmarks++
		} else {
			f = &model.FavoriteName{Tag: tag, Name: name, NS: ns, Bookmarks: 1}
			found[tag] = f
		}
		if display = strings.TrimSpace(display); display != "" {
			f.Name = display
		}
	}
	for _, b := range a.st.Bookmarks() {
		if model.IsFileKey(b.Key) || siteOfBookmark(&b) != siteID {
			continue
		}
		s := b.Summary
		// works made from a page range use only the site artists and groups set on them
		// (creator names typed by the user are not necessarily the site's spellings)
		if s.Site == model.SiteLocal && (s.Origin == nil || !s.Origin.Tags) {
			continue
		}
		if excludeCollective && (len(s.Artists) >= meta.ManyArtists || meta.IsCollectiveCircle(b.Creator.Circle)) {
			continue
		}
		names := map[string][]string{"artist": s.Artists, "group": s.Groups}
		// the display names of the names others stand for (the one at the same place, else the first)
		display := map[string][]string{}
		for al, of := range aliasOf {
			display[of] = names[al]
		}
		for _, ns := range []string{"artist", "group"} {
			if _, isAlias := aliasOf[ns]; isAlias {
				continue
			}
			for i, name := range names[ns] {
				shown := ""
				if ds := display[ns]; len(ds) > 0 {
					shown = ds[min(i, len(ds)-1)]
				}
				add(ns, name, shown)
			}
		}
	}
	out := make([]model.FavoriteName, 0, len(found))
	for _, f := range found {
		out = append(out, *f)
	}
	slices.SortFunc(out, func(x, y model.FavoriteName) int {
		if x.Bookmarks != y.Bookmarks {
			return y.Bookmarks - x.Bookmarks
		}
		return strings.Compare(x.Name, y.Name)
	})
	return out
}

// FavoriteNames returns only the artists and groups Favorites searches for (quick: no site search), so the list
// can be shown while the works are still being fetched
func (a *App) FavoriteNames(q model.FavoritesQuery) ([]model.FavoriteName, error) {
	p, err := browseSite(q.Site)
	if err != nil {
		return nil, err
	}
	if pluginInfoOf(p.ID()).OwnFavorites {
		return a.ownFavoriteNames(p), nil
	}
	return a.favoriteNames(p.ID(), q.ExcludeCollective), nil
}

// ownFavoriteNames are the names a plugin's own Favorites can be narrowed by (its lists and users...; none if it
// gives none)
func (a *App) ownFavoriteNames(p site.Provider) []model.FavoriteName {
	n, ok := p.(site.FavoriteNamer)
	if !ok {
		return []model.FavoriteName{}
	}
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	names, err := n.FavoriteNames(ctx)
	if err != nil {
		log.Printf("[favorites] %s: names: %v", p.ID(), err)
		return []model.FavoriteName{}
	}
	return names
}

// Favorites lists works by bookmarked artists, newest first
func (a *App) Favorites(q model.FavoritesQuery) (*model.FavoritesResult, error) {
	ctx, cancel := context.WithTimeout(a.ctx, 2*time.Minute)
	defer cancel()
	p, err := browseSite(q.Site)
	if err != nil {
		return nil, err
	}
	lister, ok := p.(site.AnyLister)
	if !ok {
		return nil, apperr.New("favorites.unsupported", "this site does not support favorites search")
	}

	names := a.favoriteNames(p.ID(), q.ExcludeCollective)
	var tags []string
	if pluginInfoOf(p.ID()).OwnFavorites {
		// the plugin lists its own choice of works (no artists are searched), narrowed by one of its own names
		names = a.ownFavoriteNames(p)
		if q.Tag != "" {
			tags = []string{q.Tag}
		}
	} else if q.Tag != "" {
		tags = []string{q.Tag}
	} else {
		for _, n := range names {
			if n.NS == "artist" || q.IncludeGroups {
				tags = append(tags, n.Tag)
			}
		}
	}
	var exclude map[string]bool
	if q.HideBookmarked {
		exclude = map[string]bool{}
		for _, b := range a.st.Bookmarks() {
			exclude[b.Key] = true
		}
	}
	res, err := lister.ListAny(ctx, site.AnyQuery{Tags: tags, Filters: q.Filters, Page: q.Page, Exclude: exclude})
	if err != nil {
		log.Printf("[favorites] %s (page %d): %v", p.ID(), q.Page, err)
		return nil, err
	}
	res.FilterPages(q.MinPages, q.MaxPages)
	res.FilterStats(browseSpec(p.ID()), q.Filters, a.ownerValues(p.ID(), q.Filters, res.Items))
	return &model.FavoritesResult{ListResult: *res, Names: names}, nil
}
