// Package model defines the data types shared by the backend and the frontend.
// Wails generates the TypeScript types from them.
package model

import (
	"fmt"
	"strings"

	"poruneko/internal/apperr"
)

// SiteID identifies a supported site (add new ones here)
type SiteID = string

// SiteLocal is a local work cut out from a page range (the cbz is the work; without a cbz the source gallery's pages are shown)
const SiteLocal SiteID = "local"

// MakeKey makes the cross-site unique work key "site:id"
func MakeKey(site SiteID, id string) string { return site + ":" + id }

// ParseKey splits a work key
func ParseKey(key string) (site SiteID, id string, err error) {
	i := strings.IndexByte(key, ':')
	if i <= 0 {
		return "", "", fmt.Errorf("invalid key: %q", key)
	}
	return key[:i], key[i+1:], nil
}

// IsLocalKey reports whether the key is of a work made from a page range
func IsLocalKey(key string) bool {
	s, _, err := ParseKey(key)
	return err == nil && s == SiteLocal
}

type PageInfo struct {
	Index  int    `json:"index"`
	Name   string `json:"name"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type TagInfo struct {
	NS   string `json:"ns"` // female | male | tag
	Name string `json:"name"`
}

// GallerySummary is a work summary for lists
type GallerySummary struct {
	Key           string    `json:"key"`
	Site          SiteID    `json:"site"`
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	JapaneseTitle string    `json:"japaneseTitle"`
	Type          string    `json:"type"`
	Language      string    `json:"language"`
	LanguageLocal string    `json:"languageLocal"`
	Date          string    `json:"date"`
	Artists       []string  `json:"artists"`
	Groups        []string  `json:"groups"`
	Parodies      []string  `json:"parodies"`
	Characters    []string  `json:"characters"`
	Tags          []TagInfo `json:"tags"`
	PageCount     int       `json:"pageCount"`
	// Origin is the source of a work made from a page range (local works only)
	Origin *Origin `json:"origin,omitempty"`
}

// Origin is where a page range bookmark was cut from
type Origin struct {
	Key   string `json:"key"`   // key of the source gallery
	Title string `json:"title"` // title of the source gallery
	From  int    `json:"from"`  // first page (1-based)
	To    int    `json:"to"`    // last page (1-based, inclusive)
	// Tags reports whether the work info's artists and groups are the site's spellings (older ones hold the typed creator name)
	Tags bool `json:"tags,omitempty"`
}

// RangeRequest is what to create for a page range bookmark
type RangeRequest struct {
	SourceKey string   `json:"sourceKey"`
	From      int      `json:"from"` // 1-based
	To        int      `json:"to"`   // 1-based (inclusive)
	Title     string   `json:"title"`
	Artists   []string `json:"artists"`
	Circle    string   `json:"circle"`
	// SiteArtists / SiteGroups are the artists and groups as written on the source site (used by Favorites and the like)
	SiteArtists []string `json:"siteArtists"`
	SiteGroups  []string `json:"siteGroups"`
	// if Download is false no cbz is made; the bookmark just shows the source gallery's pages
	Download bool `json:"download"`
}

// DisplayTitle is the title to display (the Japanese title first, or the site's title with the English UI)
func (s *GallerySummary) DisplayTitle() string {
	if English() && s.Title != "" {
		return s.Title
	}
	if s.JapaneseTitle != "" {
		return s.JapaneseTitle
	}
	return s.Title
}

// AltTitle is the other title shown under the display title ("" if there is none)
func (s *GallerySummary) AltTitle() string {
	if s.JapaneseTitle == "" || s.JapaneseTitle == s.Title {
		return ""
	}
	if English() {
		return s.JapaneseTitle
	}
	return s.Title
}

// GalleryDetail is the work details including pages, for the viewer
type GalleryDetail struct {
	GallerySummary
	Pages []PageInfo `json:"pages"`
}

type ListQuery struct {
	Query    string `json:"query"`
	Language string `json:"language"`
	// date | popular-today | popular-week | popular-month | popular-year
	Sort string `json:"sort"`
	Page int    `json:"page"`
	// MinPages / MaxPages filter by page count (0 for no limit).
	// The source list's paging is kept and non-matching works are removed within each page
	MinPages int `json:"minPages,omitempty"`
	MaxPages int `json:"maxPages,omitempty"`
}

type ListResult struct {
	Items   []GallerySummary `json:"items"`
	Failed  []string         `json:"failed"`
	Total   int              `json:"total"`
	Page    int              `json:"page"`
	PerPage int              `json:"perPage"`
	// Hidden is the number of works removed from this page by the filters (page count etc.)
	Hidden int `json:"hidden"`
}

// FilterPages removes works not within MinPages / MaxPages and adds the count to Hidden
func (r *ListResult) FilterPages(minPages, maxPages int) {
	if minPages <= 0 && maxPages <= 0 {
		return
	}
	kept := r.Items[:0]
	for _, it := range r.Items {
		if (minPages > 0 && it.PageCount < minPages) || (maxPages > 0 && it.PageCount > maxPages) {
			r.Hidden++
			continue
		}
		kept = append(kept, it)
	}
	r.Items = kept
}

type Suggestion struct {
	NS    string `json:"ns"`
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// ---------------------------------------------------------------- Creator info

// MetaSource: dlsite | fanza | site (the work's own info) | manual
type MetaSource = string

type CreatorCandidate struct {
	Source       MetaSource `json:"source"`
	ProductID    string     `json:"productId"`
	ProductTitle string     `json:"productTitle"`
	URL          string     `json:"url"`
	Circle       string     `json:"circle"`
	Artists      []string   `json:"artists"`
	Score        float64    `json:"score"` // title similarity 0..1
}

// values of CreatorInfo.Status
const (
	CreatorPending   = "pending"   // fetching
	CreatorMatched   = "matched"   // decided by a high-confidence candidate
	CreatorUncertain = "uncertain" // needs review
	CreatorNotFound  = "notfound"  // not found; the work's own info is used as a placeholder
	CreatorManual    = "manual"    // set by the user
)

type CreatorInfo struct {
	// pending | matched | uncertain | notfound | manual (Creator* constants)
	Status       string             `json:"status"`
	Circle       string             `json:"circle"`
	Artists      []string           `json:"artists"`
	Source       MetaSource         `json:"source"`
	ProductID    string             `json:"productId,omitempty"`
	ProductTitle string             `json:"productTitle,omitempty"`
	URL          string             `json:"url,omitempty"`
	Score        float64            `json:"score,omitempty"`
	Candidates   []CreatorCandidate `json:"candidates,omitempty"`
	ResolvedAt   int64              `json:"resolvedAt,omitempty"`
}

// ---------------------------------------------------------------- Bookmarks / downloads

// Series groups bookmarks (sequels etc.). A work belongs to at most one series
type Series struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt int64  `json:"createdAt"`
	// Keys are the keys of the works in the series (in display order)
	Keys []string `json:"keys"`
}

// values of DownloadState.Status
const (
	DownloadNone        = "none"
	DownloadQueued      = "queued"
	DownloadDownloading = "downloading"
	DownloadDone        = "done"
	DownloadError       = "error"
	DownloadPaused      = "paused"
)

type DownloadState struct {
	// none | queued | downloading | done | error | paused (Download* constants)
	Status string `json:"status"`
	Done   int    `json:"done"`
	Total  int    `json:"total"`
	// Error is the English text of the failure reason (shown when there is no ErrorCode; Japanese in older versions)
	Error string `json:"error,omitempty"`
	// ErrorCode / ErrorParams are the failure reason (the UI string table key and the values to insert)
	ErrorCode   string         `json:"errorCode,omitempty"`
	ErrorParams map[string]any `json:"errorParams,omitempty"`
}

// Fail sets the failed state and records the reason
func (s *DownloadState) Fail(err error) {
	p := apperr.ToPayload(err)
	s.Status = DownloadError
	s.Error, s.ErrorCode, s.ErrorParams = p.Message, p.Code, p.Params
}

// ClearError clears the failure reason
func (s *DownloadState) ClearError() {
	s.Error, s.ErrorCode, s.ErrorParams = "", "", nil
}

type Bookmark struct {
	Key      string         `json:"key"`
	AddedAt  int64          `json:"addedAt"`
	Summary  GallerySummary `json:"summary"`
	Creator  CreatorInfo    `json:"creator"`
	Download DownloadState  `json:"download"`
	// ArchiveFile is the saved cbz's path relative to libraryDir (slash-separated)
	ArchiveFile string `json:"archiveFile,omitempty"`
	// Tags are the user's own tags (separate from the work's own tags)
	Tags []string `json:"tags,omitempty"`
	// CustomThumb is the thumbnail chosen by the user (the work's cover if nil)
	CustomThumb *ThumbSpec `json:"customThumb,omitempty"`
	// CustomTitle is the title the user gave the work ("" for the work's own title)
	CustomTitle string `json:"customTitle,omitempty"`
}

// Title is the title to show for a bookmark: the user's title if set, otherwise the work's
func (b *Bookmark) Title() string {
	if b.CustomTitle != "" {
		return b.CustomTitle
	}
	return b.Summary.DisplayTitle()
}

// ThumbSpec is the page and area used for the thumbnail (kept so it can be adjusted later).
// The area is a fraction of the page width and height (0 to 1)
type ThumbSpec struct {
	Page int     `json:"page"` // 0-based
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	W    float64 `json:"w"`
	H    float64 `json:"h"`
	// Free reports whether the aspect ratio was chosen freely (the card shrinks the whole area to fit)
	Free bool `json:"free"`
	// UpdatedAt is when it was saved (used to bust the image cache)
	UpdatedAt int64 `json:"updatedAt"`
}

type ViewerSettings struct {
	Mode        string `json:"mode"`      // single | spread | scroll
	Direction   string `json:"direction"` // rtl | ltr
	CoverSingle bool   `json:"coverSingle"`
	Fit         string `json:"fit"` // contain | width | height | original
	// Predecode is how many pages ahead to decode in advance (0 disables it)
	Predecode int `json:"predecode"`
	// AutoFullscreen goes full screen automatically when a work is opened
	AutoFullscreen bool `json:"autoFullscreen"`
	// SpreadForManga opens manga and doujinshi in spreads when the work has no mode of its own
	SpreadForManga bool `json:"spreadForManga"`
	// SlideSeconds is the slideshow interval in seconds
	SlideSeconds int `json:"slideSeconds"`
	// SlideNextWork makes the slideshow go on to the next work after the last page
	SlideNextWork bool `json:"slideNextWork"`
	// SlideAuto lengthens or shortens the interval by how much there is on the shown pages (SlideSeconds is for a typical view)
	SlideAuto bool `json:"slideAuto"`
	// SlideClock is the corner where the time left until the next page is shown while the toolbar is hidden
	// ("" off | tl | tr | bl | br)
	SlideClock string `json:"slideClock"`
	// SlideEdge is the edge of the viewer along which a bar shows the time left ("" off | top | bottom | left | right)
	SlideEdge string `json:"slideEdge"`
	// SlideEdgeReverse fills the progress bar from the other end (right to left, bottom to top)
	SlideEdgeReverse bool `json:"slideEdgeReverse"`
	// SlideEdgeShrink starts the progress bar full and shrinks it (what is left is the time left)
	SlideEdgeShrink bool `json:"slideEdgeShrink"`
	// SlideTimeLeft is the older on / off setting for the clock (bottom left); read once and moved to SlideClock
	SlideTimeLeft bool `json:"slideTimeLeft,omitempty"`
	// BarLocked keeps the bottom toolbar shown, with the pages above it (otherwise it hides over the pages)
	BarLocked bool `json:"barLocked"`
}

type Settings struct {
	LibraryDir string `json:"libraryDir"`
	Language   string `json:"language"`
	// Sort is the default list order (date | popular-today | popular-week | popular-month | popular-year)
	Sort                    string `json:"sort"`
	AutoDownload            bool   `json:"autoDownload"`
	DeleteFilesOnUnbookmark bool   `json:"deleteFilesOnUnbookmark"`
	DownloadConcurrency     int    `json:"downloadConcurrency"`
	ImageFormat             string `json:"imageFormat"` // webp | avif
	// TempFiles is how pages saved while viewing (.parts) are handled (startup | viewerClose | pack)
	TempFiles string `json:"tempFiles"`
	// FontScale is the UI text size (%; 100 is normal)
	FontScale int `json:"fontScale"`
	// Theme is the color theme ("" dark | light | system: follows the OS)
	Theme string `json:"theme"`
	// Accent is the accent color as #rrggbb ("" for the default pink)
	Accent string `json:"accent"`
	// UpdateCheck is whether to check for a newer version at startup ("" to check | off)
	UpdateCheck string `json:"updateCheck"`
	// UILanguage is the UI language ("" follows the OS | ja | en)
	UILanguage string `json:"uiLanguage"`
	// RangeThumb is the thumbnail of page range bookmarks (page: first page in the range | source: the source gallery's cover)
	RangeThumb  string         `json:"rangeThumb"`
	Viewer      ViewerSettings `json:"viewer"`
	MetaSources []MetaSource   `json:"metaSources"`
	// FallbackSources are the fallbacks used when the title search does not find the creator
	// (pawchive: search posts by title | duckduckgo: match by name)
	FallbackSources []MetaSource `json:"fallbackSources"`
	// SourcesRev is the version of the default sources (so newly added fallbacks are added once to older settings)
	SourcesRev int `json:"sourcesRev"`
	// Keybindings are the key bindings per action ID (unset actions use the frontend defaults)
	Keybindings map[string][]string `json:"keybindings"`
	// InfiniteScroll loads the next page automatically when scrolling a list
	InfiniteScroll bool `json:"infiniteScroll"`
	// RememberWindow restores the window position, size and maximized state from the last exit at the next start
	RememberWindow bool `json:"rememberWindow"`
	// RememberScreen opens the screen shown at the last exit at the next start (the tab, its list or the open work)
	RememberScreen bool `json:"rememberScreen"`
	// MouseGestures enables "hold right + left click to go back / hold left + right click to go forward"
	MouseGestures bool `json:"mouseGestures"`
	// FileNameFormat is the zip file name format ({title} {artist} {group} etc.; / makes folders)
	FileNameFormat string `json:"fileNameFormat"`
}

// WindowState is the window position and size at exit (if maximized, the restored position and size)
type WindowState struct {
	X         int  `json:"x"`
	Y         int  `json:"y"`
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	Maximized bool `json:"maximized"`
}

type DownloadProgress struct {
	Key   string        `json:"key"`
	State DownloadState `json:"state"`
}

// ---------------------------------------------------------------- History

// HistoryEntry is a work opened in the viewer
type HistoryEntry struct {
	Key      string         `json:"key"`
	Summary  GallerySummary `json:"summary"`
	OpenedAt int64          `json:"openedAt"`
	// Origin is where it was opened from: browse | favorites | bookmarks ("" if unknown)
	Origin string `json:"origin"`
}

// ---------------------------------------------------------------- Favorites

// FavoritesQuery is the query for listing works by the artists (and groups) of bookmarked works
// SiteInfo is an available site (from a site plugin)
type SiteInfo struct {
	ID   SiteID `json:"id"`
	Name string `json:"name"`
	// Favorites reports whether the site can list works by several artists (the Favorites screen)
	Favorites bool `json:"favorites"`
}

type FavoritesQuery struct {
	Language string `json:"language"`
	Page     int    `json:"page"`
	// Tag narrows it to that artist ("artist:xxx") or group ("group:yyy")
	Tag           string `json:"tag"`
	IncludeGroups bool   `json:"includeGroups"`
	// Types filters by type (doujinshi, manga, artistcg, etc.; all if empty)
	Types          []string `json:"types"`
	HideBookmarked bool     `json:"hideBookmarked"`
	// ExcludeCollective leaves out bookmarked anthologies and magazines (works with many artists) as sources of names
	ExcludeCollective bool `json:"excludeCollective"`
	// MinPages / MaxPages filter by page count like the browse list (0 for no limit)
	MinPages int `json:"minPages,omitempty"`
	MaxPages int `json:"maxPages,omitempty"`
}

// FavoriteName is an artist or group searched by Favorites
type FavoriteName struct {
	Tag       string `json:"tag"` // the site's search tag ("artist:xxx" / "group:yyy")
	Name      string `json:"name"`
	NS        string `json:"ns"`        // artist | group
	Bookmarks int    `json:"bookmarks"` // number of bookmarks with that name
}

type FavoritesResult struct {
	ListResult
	Names []FavoriteName `json:"names"`
}
