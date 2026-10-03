package meta

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"slices"
	"strings"
	"time"

	"poruneko/internal/model"
	"poruneko/internal/netx"
)

var dlsiteHeaders = map[string]string{"Cookie": "adultchecked=1"}

type dlsiteSuggest struct {
	Work []struct {
		WorkName  string `json:"work_name"`
		WorkNo    string `json:"workno"`
		MakerName string `json:"maker_name"`
	} `json:"work"`
}

type dlsiteProduct struct {
	WorkNo    string          `json:"workno"`
	WorkName  string          `json:"work_name"`
	MakerName string          `json:"maker_name"`
	SiteID    string          `json:"site_id"`
	Creaters  json.RawMessage `json:"creaters"` // [] when empty
	Author    []struct {
		AuthorName string `json:"author_name"`
	} `json:"author"`
}

func dlsiteWorkURL(workno, siteID string) string {
	if siteID == "" {
		siteID = "maniax"
		if strings.HasPrefix(workno, "BJ") {
			siteID = "books"
		}
	}
	return fmt.Sprintf("https://www.dlsite.com/%s/work/=/product_id/%s.html", siteID, workno)
}

func dlsiteProductInfo(ctx context.Context, workno string) (*dlsiteProduct, error) {
	res, err := netx.Get(ctx, "https://www.dlsite.com/maniax/api/=/product.json?workno="+url.QueryEscape(workno), &netx.Opts{Headers: dlsiteHeaders})
	if err != nil {
		return nil, err
	}
	var arr []dlsiteProduct
	if err := json.Unmarshal(res.Body, &arr); err != nil || len(arr) == 0 {
		return nil, fmt.Errorf("product not found: %s", workno)
	}
	return &arr[0], nil
}

// SearchDLsite searches DLsite by title and fetches creator and circle info for the top candidates
func SearchDLsite(ctx context.Context, title string) ([]model.CreatorCandidate, error) {
	u := fmt.Sprintf("https://www.dlsite.com/suggest/?term=%s&site=adult-jp&time=%d", url.QueryEscape(title), time.Now().UnixMilli())
	res, err := netx.Get(ctx, u, &netx.Opts{Headers: dlsiteHeaders})
	if err != nil {
		return nil, err
	}
	var s dlsiteSuggest
	if err := json.Unmarshal(res.Body, &s); err != nil {
		return nil, err
	}
	cands := make([]model.CreatorCandidate, 0, len(s.Work))
	for _, w := range s.Work {
		c := model.CreatorCandidate{
			Source:       "dlsite",
			ProductID:    w.WorkNo,
			ProductTitle: w.WorkName,
			URL:          dlsiteWorkURL(w.WorkNo, ""),
			Artists:      []string{},
			Score:        Similarity(title, w.WorkName),
		}
		// for commercial products (BJ) the maker is the publisher, not a circle
		if !strings.HasPrefix(w.WorkNo, "BJ") {
			c.Circle = w.MakerName
		}
		cands = append(cands, c)
	}
	sortByScore(cands)
	if len(cands) > 8 {
		cands = cands[:8]
	}

	// fetch details only for the top candidates to fill in the creator names
	netx.ParallelEach(cands[:min(3, len(cands))], 3, func(i int, c model.CreatorCandidate) {
		p, err := dlsiteProductInfo(ctx, c.ProductID)
		if err != nil {
			return
		}
		applyDLsiteProduct(&cands[i], p)
	})
	return cands, nil
}

// applyDLsiteProduct applies the creator and circle from product details to a candidate
func applyDLsiteProduct(c *model.CreatorCandidate, p *dlsiteProduct) {
	isBook := p.SiteID == "books" || strings.HasPrefix(p.WorkNo, "BJ")
	var names []string
	var creaters map[string][]struct {
		Name string `json:"name"`
	}
	if json.Unmarshal(p.Creaters, &creaters) == nil {
		for _, x := range creaters["created_by"] {
			names = append(names, x.Name)
		}
	}
	for _, a := range p.Author {
		names = append(names, a.AuthorName)
	}
	c.Artists = uniq(names)
	c.URL = dlsiteWorkURL(p.WorkNo, p.SiteID)
	// for commercial products (BJ) the maker is the publisher, not a circle
	if isBook {
		c.Circle = ""
	} else if p.MakerName != "" {
		c.Circle = p.MakerName
	}
}

func uniq(ss []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, s := range ss {
		s = strings.TrimSpace(s)
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// sortByScore sorts candidates by score, highest first (ties keep their order)
func sortByScore(cands []model.CreatorCandidate) {
	slices.SortStableFunc(cands, func(a, b model.CreatorCandidate) int { return cmpScore(b.Score, a.Score) })
}

func cmpScore(a, b float64) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}
