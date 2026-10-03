package meta

import (
	"context"
	"html"
	"net/url"
	"regexp"
	"strings"
	"time"

	"poruneko/internal/model"
	"poruneko/internal/netx"
)

var (
	fanzaHeaders = map[string]string{"Cookie": "age_check_done=1"}
	reFanzaTitle = regexp.MustCompile(`class="tileListTtl__txt">\s*<a href="[^"]*cid=(d_\d+)[^"]*"[^>]*>([\s\S]*?)</a>`)
	reFanzaMaker = regexp.MustCompile(`class="tileListTtl__txt--author">\s*<a [^>]*>([\s\S]*?)</a>`)
	// the "作者" (author) field in the product page's info (links separated by / if several)
	reFanzaAuthors = regexp.MustCompile(`informationList__ttl">作者</dt>\s*<dd[^>]*>([\s\S]*?)</dd>`)
	reLinkText     = regexp.MustCompile(`<a [^>]*>([^<]+)</a>`)
	// the circle name and the title on a product page
	reFanzaCircle = regexp.MustCompile(`class="circleName__txt">([^<]+)</a>`)
	reFanzaH1     = regexp.MustCompile(`<h1 class="productTitle__txt">([\s\S]*?)</h1>`)
)

func fanzaDetailURL(cid string) string {
	return "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=" + cid + "/"
}

// SearchFanza scrapes the FANZA Doujin search results page.
// The results only have circle names, so the product pages of the top candidates are opened to fill in the "作者" (author)
// (many products have no author registered).
func SearchFanza(ctx context.Context, title string) ([]model.CreatorCandidate, error) {
	u := "https://www.dmm.co.jp/dc/doujin/-/list/narrow/=/word=" + url.PathEscape(title) + "/"
	res, err := netx.Get(ctx, u, &netx.Opts{Headers: fanzaHeaders, Timeout: 45 * time.Second})
	if err != nil {
		// 404 when nothing matches
		if netx.IsStatus(err, 404) {
			return []model.CreatorCandidate{}, nil
		}
		return nil, err
	}
	items := strings.Split(string(res.Body), `<li class="productList__item">`)
	out := []model.CreatorCandidate{}
	for _, it := range items[1:min(len(items), 41)] {
		t := reFanzaTitle.FindStringSubmatch(it)
		if t == nil {
			continue
		}
		pt := strings.TrimSpace(html.UnescapeString(t[2]))
		c := model.CreatorCandidate{
			Source:       "fanza",
			ProductID:    t[1],
			ProductTitle: pt,
			URL:          fanzaDetailURL(t[1]),
			Artists:      []string{},
			Score:        Similarity(title, pt),
		}
		if m := reFanzaMaker.FindStringSubmatch(it); m != nil {
			c.Circle = strings.TrimSpace(html.UnescapeString(m[1]))
		}
		out = append(out, c)
	}
	sortByScore(out)
	if len(out) > 8 {
		out = out[:8]
	}
	netx.ParallelEach(out[:min(3, len(out))], 3, func(i int, c model.CreatorCandidate) {
		if names, err := fanzaAuthors(ctx, c.ProductID); err == nil {
			out[i].Artists = names
		}
	})
	return out, nil
}

// fanzaProduct is what a product page tells
type fanzaProduct struct {
	title   string
	circle  string
	authors []string // the "作者" (author) field (empty if none)
}

// fanzaDetail reads a product page
func fanzaDetail(ctx context.Context, cid string) (*fanzaProduct, error) {
	res, err := netx.Get(ctx, fanzaDetailURL(cid), &netx.Opts{Headers: fanzaHeaders, Timeout: 45 * time.Second})
	if err != nil {
		return nil, err
	}
	text := func(re *regexp.Regexp) string {
		if m := re.FindSubmatch(res.Body); m != nil {
			return strings.TrimSpace(html.UnescapeString(reTagsAny.ReplaceAllString(string(m[1]), "")))
		}
		return ""
	}
	p := &fanzaProduct{title: text(reFanzaH1), circle: text(reFanzaCircle), authors: []string{}}
	if m := reFanzaAuthors.FindSubmatch(res.Body); m != nil {
		var names []string
		for _, a := range reLinkText.FindAllSubmatch(m[1], -1) {
			names = append(names, html.UnescapeString(string(a[1])))
		}
		p.authors = uniq(names)
	}
	return p, nil
}

// fanzaAuthors reads the "作者" (author) from a product page (empty if none)
func fanzaAuthors(ctx context.Context, cid string) ([]string, error) {
	p, err := fanzaDetail(ctx, cid)
	if err != nil {
		return nil, err
	}
	return p.authors, nil
}
