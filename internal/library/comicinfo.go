package library

import (
	"encoding/xml"
	"fmt"
	"strings"
	"time"

	"poruneko/internal/model"
	"poruneko/internal/site"
)

// ComicInfo.xml (ComicRack format): metadata many comic viewers can read, bundled in the cbz.

// comicInfoXML is ComicRack-format metadata (supported by many comic viewers)
type comicInfoXML struct {
	XMLName     xml.Name `xml:"ComicInfo"`
	XSI         string   `xml:"xmlns:xsi,attr"`
	XSD         string   `xml:"xmlns:xsd,attr"`
	Title       string   `xml:"Title,omitempty"`
	Series      string   `xml:"Series,omitempty"`
	Summary     string   `xml:"Summary,omitempty"`
	Notes       string   `xml:"Notes,omitempty"`
	Year        int      `xml:"Year,omitempty"`
	Month       int      `xml:"Month,omitempty"`
	Day         int      `xml:"Day,omitempty"`
	Writer      string   `xml:"Writer,omitempty"`
	Penciller   string   `xml:"Penciller,omitempty"`
	Publisher   string   `xml:"Publisher,omitempty"`
	Genre       string   `xml:"Genre,omitempty"`
	Tags        string   `xml:"Tags,omitempty"`
	Web         string   `xml:"Web,omitempty"`
	PageCount   int      `xml:"PageCount,omitempty"`
	LanguageISO string   `xml:"LanguageISO,omitempty"`
	Characters  string   `xml:"Characters,omitempty"`
	Teams       string   `xml:"Teams,omitempty"`
	Manga       string   `xml:"Manga,omitempty"`
	AgeRating   string   `xml:"AgeRating,omitempty"`
}

var langISO = map[string]string{"japanese": "ja", "english": "en", "chinese": "zh", "korean": "ko"}

// comicInfo makes ComicInfo.xml. customTitle is the user's title ("" for the work's own title)
func comicInfo(d *model.GalleryDetail, c model.CreatorInfo, customTitle string) ([]byte, error) {
	title := d.DisplayTitle()
	if customTitle != "" {
		title = customTitle
	}
	tags := make([]string, 0, len(d.Tags))
	for _, t := range d.Tags {
		if t.NS == "tag" {
			tags = append(tags, t.Name)
		} else {
			tags = append(tags, t.NS+":"+t.Name)
		}
	}
	ci := comicInfoXML{
		XSI:         "http://www.w3.org/2001/XMLSchema-instance",
		XSD:         "http://www.w3.org/2001/XMLSchema",
		Title:       title,
		Series:      strings.Join(d.Parodies, ", "),
		Writer:      strings.Join(c.Artists, ", "),
		Penciller:   strings.Join(c.Artists, ", "),
		Publisher:   c.Circle,
		Teams:       c.Circle,
		Genre:       d.Type,
		Tags:        strings.Join(tags, ", "),
		PageCount:   len(d.Pages),
		LanguageISO: langISO[d.Language],
		Characters:  strings.Join(d.Characters, ", "),
		AgeRating:   "Adults Only 18+",
		Notes:       fmt.Sprintf("site=%s id=%s creator_source=%s", d.Site, d.ID, c.Source),
	}
	ci.Web = site.WebURL(d.Key)
	ci.Summary = d.AltTitle()
	if customTitle != "" {
		ci.Summary = d.DisplayTitle() // the work's own title, since the user's title replaces it
	}
	// works made from a page range keep the source title and range
	if o := d.Origin; o != nil {
		ci.Summary = originSummary(o)
		ci.Notes += fmt.Sprintf(" origin=%s pages=%d-%d", o.Key, o.From, o.To)
		if u := site.WebURL(o.Key); u != "" {
			ci.Web = u
		}
	}
	if d.Language == "japanese" {
		ci.Manga = "YesAndRightToLeft"
	}
	if t, err := time.Parse("2006-01-02 15:04:05-07", d.Date); err == nil {
		ci.Year, ci.Month, ci.Day = t.Year(), int(t.Month()), t.Day()
	}
	b, err := xml.MarshalIndent(ci, "", "  ")
	if err != nil {
		return nil, err
	}
	return append([]byte(xml.Header), b...), nil
}

// originSummary describes the source of a work made from a page range (in the UI language)
func originSummary(o *model.Origin) string {
	if model.English() {
		return fmt.Sprintf("Source: %s (pp. %d–%d)", o.Title, o.From, o.To)
	}
	return fmt.Sprintf("元の作品: %s（p.%d–%d）", o.Title, o.From, o.To)
}
