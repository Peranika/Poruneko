package meta

import (
	"context"
	"log"
	"slices"
	"time"

	"poruneko/internal/model"
)

const (
	thMatched   = 0.75
	thUncertain = 0.5
)

type searcher func(ctx context.Context, title string) ([]model.CreatorCandidate, error)

var searchers = map[model.MetaSource]searcher{
	"dlsite": SearchDLsite,
	"fanza":  SearchFanza,
	// the following are fallbacks used when DLsite / FANZA find nothing
	"pawchive":   SearchPawchive,
	"duckduckgo": SearchDuckDuckGo,
}

// fallbackOrder is the order in which fallbacks are tried (only those enabled in the settings, in this order).
// pawchive searches by work title, the others by site artist and group names
var fallbackOrder = []model.MetaSource{"pawchive", "duckduckgo"}

// enabledFallbacks lists the fallbacks enabled in the settings in fallbackOrder order
func enabledFallbacks(fallbacks []model.MetaSource) (byTitle bool, byName []model.MetaSource) {
	for _, s := range fallbackOrder {
		if !slices.Contains(fallbacks, s) {
			continue
		}
		if s == "pawchive" {
			byTitle = true
		} else {
			byName = append(byName, s)
		}
	}
	return byTitle, byName
}

// SearchCandidates searches every source for manual search
func SearchCandidates(ctx context.Context, term string, sources []model.MetaSource) []model.CreatorCandidate {
	q := CleanTitle(term)
	out := []model.CreatorCandidate{}
	for _, s := range sources {
		fn, ok := searchers[s]
		if !ok {
			continue
		}
		c, err := fn(ctx, q)
		if err != nil {
			log.Printf("[meta] %s search failed: %v", s, err)
			continue
		}
		out = append(out, c...)
	}
	sortByScore(out)
	return out
}

// boost raises the score if it matches the site's artists or groups
func boost(c model.CreatorCandidate, s *model.GallerySummary) float64 {
	hit := false
	for _, g := range s.Groups {
		if c.Circle != "" && SameName(g, c.Circle) {
			hit = true
		}
	}
	for _, a := range c.Artists {
		for _, x := range s.Artists {
			if SameName(a, x) {
				hit = true
			}
		}
	}
	if hit {
		return min(1, c.Score+0.15)
	}
	// short titles like "約束" have many other works with the same name, so mark it for review without creator confirmation
	title := s.JapaneseTitle
	if title == "" {
		title = s.Title
	}
	if len([]rune(Normalize(CleanTitle(title)))) <= 4 {
		return min(c.Score, thMatched-0.05)
	}
	return c.Score
}

// titleQueries returns the search queries for a work (its Japanese title and the site's spelling, without duplicates).
// A title with words shops censor is also searched with those words censored (FANZA titles have 催● where site
// has 催眠, and DLsite finds nothing for some words written in full)
func titleQueries(s *model.GallerySummary) []string {
	var queries []string
	add := func(q string) {
		if q != "" && !slices.Contains(queries, q) {
			queries = append(queries, q)
		}
	}
	for _, t := range []string{s.JapaneseTitle, s.Title} {
		if t == "" {
			continue
		}
		q := CleanTitle(t)
		add(q)
		add(censoredQuery(q))
	}
	return queries
}

// useCandidate fills in the source and product of info from c
func useCandidate(info *model.CreatorInfo, c model.CreatorCandidate) {
	info.Source, info.ProductID, info.ProductTitle, info.URL, info.Score = c.Source, c.ProductID, c.ProductTitle, c.URL, c.Score
}

// resolveByTitle searches DLsite / FANZA by work title and decides the creator and circle.
// If nothing is found it returns status=notfound with the site's info as placeholders.
func resolveByTitle(ctx context.Context, s *model.GallerySummary, sources []model.MetaSource) model.CreatorInfo {
	queries := titleQueries(s)

	best := map[string]model.CreatorCandidate{}
	order := []string{}
	done := false
	for _, src := range sources {
		fn, ok := searchers[src]
		if !ok || done {
			continue
		}
		for _, q := range queries {
			cands, err := fn(ctx, q)
			if err != nil {
				log.Printf("[meta] %s search failed: %v", src, err)
				continue
			}
			for _, c := range cands {
				c.Score = boost(c, s)
				k := c.Source + ":" + c.ProductID
				if old, ok := best[k]; !ok || old.Score < c.Score {
					if !ok {
						order = append(order, k)
					}
					best[k] = c
				}
				if c.Score >= 0.95 {
					done = true
				}
			}
			if done {
				break
			}
		}
	}

	cands := make([]model.CreatorCandidate, 0, len(order))
	for _, k := range order {
		cands = append(cands, best[k])
	}
	srcIdx := func(s string) int { return slices.Index(sources, s) }
	slices.SortStableFunc(cands, func(a, b model.CreatorCandidate) int {
		if c := cmpScore(b.Score, a.Score); c != 0 {
			return c
		}
		return srcIdx(a.Source) - srcIdx(b.Source)
	})
	if len(cands) > 10 {
		cands = cands[:10]
	}

	now := time.Now().UnixMilli()
	if len(cands) == 0 || cands[0].Score < thUncertain {
		info := model.CreatorInfo{Status: model.CreatorNotFound, Artists: s.Artists, Source: "site", Candidates: cands, ResolvedAt: now}
		if len(s.Groups) > 0 {
			info.Circle = s.Groups[0]
		}
		return info
	}

	top := cands[0]
	artists, circle := top.Artists, top.Circle
	// FANZA often has no author registered, so fill in the creator from a DLsite candidate of the same circle
	if len(artists) == 0 && circle != "" {
		for _, c := range cands {
			if len(c.Artists) > 0 && SameName(c.Circle, circle) {
				artists = c.Artists
				break
			}
		}
	}
	// DLsite / FANZA tell circles (makers) and creators apart, so a circle without a creator stays a circle
	status := model.CreatorUncertain
	if top.Score >= thMatched {
		status = model.CreatorMatched
	}
	info := model.CreatorInfo{Status: status, Circle: circle, Artists: artists, Candidates: cands, ResolvedAt: now}
	useCandidate(&info, top)
	return info
}

// Resolve decides the creator and circle info.
//
//  1. Search DLsite / FANZA by work title (sources)
//
//  2. If the creator or circle is still unknown, match site artist and group names
//     on the web to fill them in (fallbacks: pawchive by title, DuckDuckGo by name)
//
//  3. With many artists (ManyArtists or more), set the circle name to "magazine" or "anthology"
//
// the site's info is only used as hints for matching and as placeholders when nothing is found anywhere.
func Resolve(ctx context.Context, s *model.GallerySummary, sources, fallbacks []model.MetaSource) model.CreatorInfo {
	info := resolveCreator(ctx, s, sources, fallbacks)
	applyCollective(&info, s)
	return info
}

// FromSite makes creator info from the site's artists and groups as they are, without looking anything up
// (used for non-Japanese works, whose readers know the site's romanized names)
func FromSite(s *model.GallerySummary) model.CreatorInfo {
	info := model.CreatorInfo{Status: model.CreatorMatched, Source: "site", Artists: slices.Clone(s.Artists), ResolvedAt: time.Now().UnixMilli()}
	if info.Artists == nil {
		info.Artists = []string{}
	}
	if len(s.Groups) > 0 {
		info.Circle = s.Groups[0]
	}
	applyCollective(&info, s)
	return info
}

// FromTitle makes creator info from the names the work's title gives (TitleCreators), without looking anything up
func FromTitle(s *model.GallerySummary) model.CreatorInfo {
	tc := s.TitleCreators
	info := model.CreatorInfo{Status: model.CreatorMatched, Source: "title", Artists: slices.Clone(tc.Artists), Circle: tc.Circle, ResolvedAt: time.Now().UnixMilli()}
	if info.Artists == nil {
		info.Artists = []string{}
	}
	applyCollective(&info, s)
	return info
}

func resolveCreator(ctx context.Context, s *model.GallerySummary, sources, fallbacks []model.MetaSource) model.CreatorInfo {
	info := resolveByTitle(ctx, s, sources)
	notFound := info.Status == model.CreatorNotFound
	needArtists := notFound || len(info.Artists) == 0
	// with a known creator the circle may be empty (many works have no circle)
	needCircle := notFound || (info.Circle == "" && len(info.Artists) == 0)
	byTitle, byName := enabledFallbacks(fallbacks)
	if !needArtists && !needCircle {
		return info
	}

	// first search pawchive posts by work title
	if notFound && byTitle {
		if c, ok := resolveByArchive(ctx, s); ok {
			info.Candidates = append(c, info.Candidates...)
			info.Status, info.Artists = model.CreatorUncertain, c[0].Artists
			useCandidate(&info, c[0])
			return info
		}
	}
	if len(byName) == 0 {
		return info
	}

	fb := resolveByName(ctx, s, byName, needArtists, needCircle)
	if len(fb.candidates) == 0 {
		return info
	}
	info.Candidates = append(info.Candidates, fb.candidates...)

	if notFound {
		// works found nowhere: put in the name matches and keep the site's names for those that did not match.
		// The work was not identified by names alone, so always mark it for review and let the user confirm
		info.Status, info.Artists = model.CreatorUncertain, fb.artists
		if fb.circle != "" {
			info.Circle = fb.circle
		}
		useCandidate(&info, fb.top)
		return info
	}
	// found by title but the creator (or circle) is empty: fill it in and mark for review
	if len(info.Artists) == 0 && fb.resolvedArtists > 0 {
		info.Artists = fb.artists
		info.Status = model.CreatorUncertain
	}
	if info.Circle == "" && fb.circle != "" {
		info.Circle = fb.circle
		info.Status = model.CreatorUncertain
	}
	return info
}

// resolveByArchive searches pawchive posts by work title (the Japanese title and the site's spelling)
func resolveByArchive(ctx context.Context, s *model.GallerySummary) ([]model.CreatorCandidate, bool) {
	for _, q := range titleQueries(s) {
		c, err := SearchPawchive(ctx, q)
		if err != nil {
			log.Printf("[meta] pawchive search failed: %v", err)
			continue
		}
		if len(c) > 0 {
			return c, true
		}
	}
	return nil, false
}

type nameResult struct {
	artists         []string
	resolvedArtists int // number of creators matched
	circle          string
	top             model.CreatorCandidate // the first match (its Source is empty if nothing matched)
	candidates      []model.CreatorCandidate
}

// resolveByName looks up site artist and group names with the name-based fallbacks (DuckDuckGo)
func resolveByName(ctx context.Context, s *model.GallerySummary, fallbacks []model.MetaSource, needArtists, needCircle bool) nameResult {
	r := nameResult{}
	lookup := func(name string) (model.CreatorCandidate, bool) {
		for _, src := range fallbacks {
			fn, ok := searchers[src]
			if !ok {
				continue
			}
			cands, err := fn(ctx, name)
			if err != nil {
				log.Printf("[meta] %s lookup %q failed: %v", src, name, err)
				continue
			}
			if len(cands) == 0 {
				continue
			}
			sortByScore(cands)
			if cands[0].Score < thUncertain {
				continue
			}
			r.candidates = append(r.candidates, cands...)
			return cands[0], true
		}
		return model.CreatorCandidate{}, false
	}
	note := func(c model.CreatorCandidate) {
		if r.top.Source == "" {
			r.top = c
		}
	}

	if needArtists {
		for _, a := range s.Artists[:min(3, len(s.Artists))] {
			if c, ok := lookup(a); ok {
				r.artists = append(r.artists, c.Artists[0])
				r.resolvedArtists++
				note(c)
			} else {
				r.artists = append(r.artists, a)
			}
		}
		if len(s.Artists) > 3 {
			r.artists = append(r.artists, s.Artists[3:]...)
		}
	}
	if needCircle {
		for _, g := range s.Groups[:min(2, len(s.Groups))] {
			if c, ok := lookup(g); ok {
				r.circle = c.Artists[0]
				note(c)
				break
			}
		}
	}
	if r.top.Source == "" {
		return nameResult{}
	}
	if r.artists == nil {
		r.artists = []string{}
	}
	return r
}
