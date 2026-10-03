package meta

import (
	"context"
	"net/url"
	"regexp"
	"strings"

	"poruneko/internal/apperr"
	"poruneko/internal/model"
)

// Reading creator info from a product page the user found (only DLsite and FANZA Doujin pages are accepted).

var (
	reDLsiteWorkNo = regexp.MustCompile(`\b((?:RJ|BJ|VJ)\d{4,})\b`)
	reFanzaCID     = regexp.MustCompile(`cid=(d_\d+)`)
)

// CandidateFromURL reads the circle and creators from a DLsite or FANZA Doujin product page
func CandidateFromURL(ctx context.Context, rawURL string) (model.CreatorCandidate, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return model.CreatorCandidate{}, errUnsupportedURL()
	}
	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	switch {
	case host == "dlsite.com":
		m := reDLsiteWorkNo.FindStringSubmatch(u.Path)
		if m == nil {
			return model.CreatorCandidate{}, errUnsupportedURL()
		}
		p, err := dlsiteProductInfo(ctx, m[1])
		if err != nil {
			return model.CreatorCandidate{}, apperr.Wrap(err, "creator.urlFailed", "failed to read the page")
		}
		c := model.CreatorCandidate{Source: "dlsite", ProductID: p.WorkNo, ProductTitle: p.WorkName, Artists: []string{}, Score: 1}
		applyDLsiteProduct(&c, p)
		return c, nil
	case host == "dmm.co.jp" && strings.Contains(u.Path, "/dc/doujin/"):
		m := reFanzaCID.FindStringSubmatch(u.Path)
		if m == nil {
			return model.CreatorCandidate{}, errUnsupportedURL()
		}
		d, err := fanzaDetail(ctx, m[1])
		if err != nil {
			return model.CreatorCandidate{}, apperr.Wrap(err, "creator.urlFailed", "failed to read the page")
		}
		return model.CreatorCandidate{
			Source: "fanza", ProductID: m[1], ProductTitle: d.title, URL: fanzaDetailURL(m[1]),
			Circle: d.circle, Artists: d.authors, Score: 1,
		}, nil
	}
	return model.CreatorCandidate{}, errUnsupportedURL()
}

func errUnsupportedURL() error {
	return apperr.New("creator.unsupportedUrl", "only DLsite and FANZA Doujin product pages are supported")
}
