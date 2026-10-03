package meta

import (
	"context"
	"encoding/json"
	"errors"
	"html"
	"log"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"poruneko/internal/model"
	"poruneko/internal/netx"
)

// Find the creator of works not found on DLsite / FANZA from information on the web.
//   - pawchive (an archive of Patreon, FANBOX etc. posts): search posts by work title and take authors of posts with similar titles
//   - DuckDuckGo: search by the site artist name and read the creator name from result page titles (pixiv, X, FANBOX, etc.)
// Both decide by name or title matches only, so the results are marked for review.

// throttle spaces out queries to the same site (rapid queries get refused as congestion or bots)
type throttle struct {
	mu   sync.Mutex
	last time.Time
	gap  time.Duration
}

func (t *throttle) wait(ctx context.Context) error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if d := t.gap - time.Since(t.last); d > 0 {
		select {
		case <-time.After(d):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	t.last = time.Now()
	return nil
}

// getJSON fetches a URL and decodes its JSON body into v
func getJSON(ctx context.Context, rawURL string, headers map[string]string, retries int, v any) error {
	res, err := netx.Get(ctx, rawURL, &netx.Opts{Headers: headers, Retries: retries, Timeout: 15 * time.Second})
	if err != nil {
		return err
	}
	return json.Unmarshal(res.Body, v)
}

// ---------------------------------------------------------------- pawchive

var pawchiveGate = &throttle{gap: 1500 * time.Millisecond}

type pawchivePost struct {
	ID      string `json:"id"`
	User    string `json:"user"`
	Service string `json:"service"`
	Title   string `json:"title"`
}

// SearchPawchive searches pawchive posts by work title and suggests authors of posts with similar titles
func SearchPawchive(ctx context.Context, title string) ([]model.CreatorCandidate, error) {
	q := strings.TrimSpace(title)
	if len([]rune(q)) < 2 { // pawchive rejects searches shorter than 2 characters
		return nil, nil
	}
	if err := pawchiveGate.wait(ctx); err != nil {
		return nil, err
	}
	var posts []pawchivePost
	if err := getJSON(ctx, "https://pawchive.pw/api/v1/posts?q="+url.QueryEscape(q), nil, 0, &posts); err != nil {
		return nil, err
	}
	// one per author, in order of title similarity
	type hit struct {
		post  pawchivePost
		score float64
	}
	var hits []hit
	seen := map[string]bool{}
	for _, p := range posts {
		k := p.Service + "/" + p.User
		s := Similarity(title, p.Title)
		if seen[k] || s < thUncertain {
			continue
		}
		seen[k] = true
		hits = append(hits, hit{p, s})
	}
	var out []model.CreatorCandidate
	for _, h := range hits[:min(3, len(hits))] {
		name, err := pawchiveCreatorName(ctx, h.post.Service, h.post.User)
		if err != nil || name == "" {
			continue
		}
		out = append(out, model.CreatorCandidate{
			Source:       "pawchive",
			ProductID:    h.post.Service + ":" + h.post.User,
			ProductTitle: h.post.Title,
			URL:          "https://pawchive.pw/" + h.post.Service + "/user/" + h.post.User + "/post/" + h.post.ID,
			Artists:      []string{cleanCreatorName(name)},
			// a matching title does not mean the same work, so do not confirm it
			Score: min(h.score, thMatched-0.05),
		})
	}
	sortByScore(out)
	return out, nil
}

func pawchiveCreatorName(ctx context.Context, service, user string) (string, error) {
	if err := pawchiveGate.wait(ctx); err != nil {
		return "", err
	}
	var p struct {
		Name string `json:"name"`
	}
	err := getJSON(ctx, "https://pawchive.pw/api/v1/"+url.PathEscape(service)+"/user/"+url.PathEscape(user)+"/profile", nil, 0, &p)
	return strings.TrimSpace(p.Name), err
}

// ---------------------------------------------------------------- DuckDuckGo

var ddgGate = &throttle{gap: 4 * time.Second}

var (
	reDDGResult = regexp.MustCompile(`<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)</a>`)
	reTagsAny   = regexp.MustCompile(`<[^>]+>`)
	// read the creator name from result page titles (the title format of each site)
	reNameFromTitle = []*regexp.Regexp{
		regexp.MustCompile(`^(.+?)\s*\(@(\w+)\)\s*/\s*(?:X|Twitter)`),                   // X: name (@id) / X
		regexp.MustCompile(`^(.+?)\s*[｜|]\s*pixivFANBOX`),                               // FANBOX: name｜pixivFANBOX
		regexp.MustCompile(`^(.+?)(?:のイラスト・マンガ(?:作品一覧)?)?\s*-\s*pixiv$`),                // pixiv: name - pixiv
		regexp.MustCompile(`^(.+?)'s (?:illustrations|manga|works|novels).*-\s*pixiv$`), // pixiv (English)
		regexp.MustCompile(`^(.+?)\s*[｜|]\s*Skeb`),                                      // Skeb
		regexp.MustCompile(`^(.+?)\s*[｜|]\s*Fantia`),                                    // Fantia
	}
)

// SearchDuckDuckGo searches DuckDuckGo for an artist name and suggests creator names read from result page titles.
// The more pages a name is read from, the likelier it is. Fails if DuckDuckGo treats the query as a bot.
func SearchDuckDuckGo(ctx context.Context, name string) ([]model.CreatorCandidate, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, nil
	}
	if err := ddgGate.wait(ctx); err != nil {
		return nil, err
	}
	res, err := netx.Get(ctx, "https://html.duckduckgo.com/html/?q="+url.QueryEscape(`"`+name+`"`), &netx.Opts{Retries: -1, Timeout: 20 * time.Second})
	if err != nil {
		return nil, err
	}
	body := string(res.Body)
	if strings.Contains(body, "anomaly-modal") {
		log.Printf("[meta] duckduckgo: blocked as automated access")
		return nil, errors.New("duckduckgo: blocked as automated access")
	}
	return parseDuckDuckGo(body, name), nil
}

// parseDuckDuckGo reads creator names from result page titles and makes candidates
func parseDuckDuckGo(body, name string) []model.CreatorCandidate {
	type found struct {
		name  string
		url   string
		count int
		idHit bool // an X ID or the like matched the queried name
	}
	var order []string
	names := map[string]*found{}
	for _, m := range reDDGResult.FindAllStringSubmatch(body, 20) {
		title := strings.TrimSpace(html.UnescapeString(reTagsAny.ReplaceAllString(m[2], "")))
		link := html.UnescapeString(m[1])
		if u, err := url.Parse(link); err == nil && u.Query().Get("uddg") != "" {
			link = u.Query().Get("uddg")
		}
		for _, re := range reNameFromTitle {
			sm := re.FindStringSubmatch(title)
			if sm == nil {
				continue
			}
			n := cleanCreatorName(sm[1])
			if n == "" {
				break
			}
			k := Normalize(n)
			f := names[k]
			if f == nil {
				f = &found{name: n, url: link}
				names[k] = f
				order = append(order, k)
			}
			f.count++
			if len(sm) > 2 && sameIDAny(name, sm[2]) {
				f.idHit = true
			}
			break
		}
	}
	var out []model.CreatorCandidate
	for _, k := range order {
		f := names[k]
		score := 0.55
		switch {
		case f.idHit || sameID(name, f.name):
			score = 0.7
		case f.count >= 2:
			score = 0.65
		}
		out = append(out, model.CreatorCandidate{
			Source:       "duckduckgo",
			ProductID:    f.url,
			ProductTitle: "DuckDuckGo: " + f.name,
			URL:          f.url,
			Artists:      []string{f.name},
			Score:        score,
		})
	}
	sortByScore(out)
	return out
}

// sameIDAny reports whether an ID matches any of the name's variants ("foo bar" -> foobar, foo-bar, foo_bar)
func sameIDAny(name, id string) bool {
	for _, v := range nameVariants(name) {
		if strings.EqualFold(v, id) {
			return true
		}
	}
	return false
}
