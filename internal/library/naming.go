package library

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"poruneko/internal/model"
)

// Placeholders are the placeholders for the file name format (their descriptions are in fileName.placeholders in the frontend string tables)
var Placeholders = []string{
	"{title}", "{title_alt}", "{artist}", "{group}", "{circle}", "{creator}", "{parody}", "{type}",
	"{language}", "{date}", "{year}", "{series}", "{series_no}", "{id}", "{site}",
}

var (
	reEmptyBrackets = regexp.MustCompile(`\[\s*\]|\(\s*\)|【\s*】|（\s*）|［\s*］|\{\s*\}`)
	reOpenSpace     = regexp.MustCompile(`([\[(【（［])\s+`)
	reCloseSpace    = regexp.MustCompile(`\s+([\])】）］])`)
	reMultiSpace    = regexp.MustCompile(`\s{2,}`)
	rePlaceholder   = regexp.MustCompile(`\{[a-z_]+\}`)
)

// sanitize replaces characters not allowed in file names (with full-width ones, or "_" with the English UI)
func sanitize(s string) string {
	if model.English() {
		return strings.TrimSpace(badCharsEn.Replace(s))
	}
	return strings.TrimSpace(badChars.Replace(s))
}

// unknownName is the name used when a part of the file name is empty
func unknownName() string {
	if model.English() {
		return "Unknown"
	}
	return "不明"
}

// SeriesRef is the series a work belongs to (zero value if none)
type SeriesRef struct {
	Name string
	No   int // 1-based
}

func placeholderValues(d *model.GalleryDetail, c model.CreatorInfo, sr SeriesRef, title string) map[string]string {
	date, year := "", ""
	if len(d.Date) >= 10 {
		date, year = d.Date[:10], d.Date[:4]
	}
	artists := strings.Join(c.Artists, ", ")
	creator := c.Circle // the circle name, or the artist names if none
	if creator == "" {
		creator = artists
	}
	seriesNo := ""
	if sr.Name != "" && sr.No > 0 {
		seriesNo = fmt.Sprintf("%02d", sr.No)
	}
	return map[string]string{
		"{series}":    sr.Name,
		"{series_no}": seriesNo,
		"{title}":     title,
		"{title_alt}": d.Title,
		"{artist}":    artists,
		"{group}":     c.Circle,
		"{circle}":    c.Circle,
		"{creator}":   creator,
		"{parody}":    strings.Join(d.Parodies, ", "),
		"{type}":      d.Type,
		"{language}":  d.Language,
		"{date}":      date,
		"{year}":      year,
		"{id}":        d.ID,
		"{site}":      d.Site,
	}
}

// cleanSegment tidies brackets and spaces left by empty placeholders
func cleanSegment(s string) string {
	for {
		n := reEmptyBrackets.ReplaceAllString(s, "")
		n = reOpenSpace.ReplaceAllString(n, "$1")
		n = reCloseSpace.ReplaceAllString(n, "$1")
		n = reMultiSpace.ReplaceAllString(n, " ")
		n = strings.TrimSpace(n)
		if n == s {
			break
		}
		s = n
	}
	s = strings.TrimRight(s, ". ")
	if r := []rune(s); len(r) > 120 {
		s = strings.TrimSpace(string(r[:120]))
	}
	return s
}

// ArchiveExt is the extension of saved files (an uncompressed zip inside; .cbz so comic viewers recognize it)
const ArchiveExt = ".cbz"

// FormatName makes the relative save path (slash-separated, with extension) from the format.
// A / in the format separates folders.
func FormatName(format string, d *model.GalleryDetail, c model.CreatorInfo, sr SeriesRef) string {
	return FormatNameTitled(format, d, c, sr, d.DisplayTitle())
}

// FormatNameTitled is FormatName with the title for {title} given (the user's title for a bookmark)
func FormatNameTitled(format string, d *model.GalleryDetail, c model.CreatorInfo, sr SeriesRef, title string) string {
	if strings.TrimSpace(format) == "" {
		format = "{title}"
	}
	vals := placeholderValues(d, c, sr, title)
	format = strings.ReplaceAll(format, `\`, "/")
	parts := strings.Split(format, "/")
	var segs []string
	for i, seg := range parts {
		// works not in a series do not get a folder named only by the series
		seriesOnly := strings.Contains(seg, "{series") && sr.Name == ""
		seg = rePlaceholder.ReplaceAllStringFunc(seg, func(p string) string {
			if v, ok := vals[p]; ok {
				return sanitize(v)
			}
			return p
		})
		seg = cleanSegment(sanitize(seg))
		if seg == "" && seriesOnly && i < len(parts)-1 {
			continue
		}
		if seg == "" || seg == "." || seg == ".." {
			seg = unknownName()
		}
		segs = append(segs, seg)
	}
	return strings.Join(segs, "/") + ArchiveExt
}

// withID makes an alternative name with the ID for name clashes
func withID(rel, id string, n int) string {
	base := strings.TrimSuffix(rel, ArchiveExt)
	if n <= 1 {
		return base + " (" + id + ")" + ArchiveExt
	}
	return base + " (" + id + "-" + string(rune('0'+n)) + ")" + ArchiveExt
}

func toOS(rel string) string { return filepath.FromSlash(rel) }
