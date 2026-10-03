package meta

import (
	"regexp"
	"strings"

	"poruneko/internal/model"
)

// Works with many artists (magazines and anthologies) use "magazine" or "anthology"
// as the circle name instead of individual circles.

// ManyArtists is the number of artists at or above which a work counts as a magazine or anthology
const ManyArtists = 4

// circle names of magazines and anthologies (Japanese UI / English UI)
const (
	CircleMagazine    = "雑誌"
	CircleAnthology   = "アンソロジー"
	circleMagazineEn  = "Magazine"
	circleAnthologyEn = "Anthology"
)

func magazineName() string {
	if model.English() {
		return circleMagazineEn
	}
	return CircleMagazine
}

func anthologyName() string {
	if model.English() {
		return circleAnthologyEn
	}
	return CircleAnthology
}

// IsCollectiveCircle reports whether a circle name is one of the magazine / anthology names (in either language)
func IsCollectiveCircle(circle string) bool {
	switch circle {
	case CircleMagazine, CircleAnthology, circleMagazineEn, circleAnthologyEn:
		return true
	}
	return false
}

var (
	reAnthology = regexp.MustCompile(`(?i)(アンソロ|anthology|合同誌|合同本)`)
	reMagazine  = regexp.MustCompile(`(?i)(\d+\s*月号|\d+\s*年\s*\d+\s*月|増刊|vol\.?\s*\d+|コミック|comic|magazine)`)
	// event names (Comic Market etc.) are not used to detect magazines
	reEventName = regexp.MustCompile(`(?i)(コミックマーケット|コミケ|comic\s*market|comiket|コミティア|comitia|comic\s*city)`)
)

// CollectiveCircle returns the circle name to use when there are many artists ("" if not applicable)
func CollectiveCircle(info model.CreatorInfo, s *model.GallerySummary) string {
	if len(info.Artists) < ManyArtists {
		return ""
	}
	text := strings.Join([]string{s.JapaneseTitle, s.Title, info.ProductTitle}, " ")
	if reAnthology.MatchString(text) || hasTag(s, "anthology") {
		return anthologyName()
	}
	text = reEventName.ReplaceAllString(text, " ")
	// DLsite BJ products are commercial (magazines). the site's manga type is commercial magazines
	if strings.HasPrefix(info.ProductID, "BJ") || reMagazine.MatchString(text) || s.Type == "manga" {
		return magazineName()
	}
	return anthologyName()
}

func hasTag(s *model.GallerySummary, name string) bool {
	for _, t := range s.Tags {
		if strings.EqualFold(t.Name, name) {
			return true
		}
	}
	return false
}

// applyCollective replaces the circle name with "magazine" or "anthology" if there are many artists
func applyCollective(info *model.CreatorInfo, s *model.GallerySummary) {
	if c := CollectiveCircle(*info, s); c != "" {
		info.Circle = c
	}
}
