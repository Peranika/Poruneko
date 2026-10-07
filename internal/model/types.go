// Package model defines the data types shared by the backend and the frontend.
// Wails generates the TypeScript types from them.
package model

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"poruneko/internal/apperr"
)

// SiteID identifies a supported site (add new ones here)
type SiteID = string

// SiteLocal is a local work cut out from a page range (the cbz is the work; without a cbz the source gallery's pages are shown)
const SiteLocal SiteID = "local"

// SiteFile is an archive of the user's own in a local folder (the id is "@<folder id>/<path relative to the folder>")
const SiteFile SiteID = "file"

// IsFileKey reports whether the key is of an archive of the user's own in a local folder
func IsFileKey(key string) bool {
	s, _, err := ParseKey(key)
	return err == nil && s == SiteFile
}

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
	// Video: the page is a video (mp4 / webm), played in the viewer
	Video bool `json:"video,omitempty"`
	// Delay is how long the page is shown (ms) when it is a frame of an animation: a work whose pages all have one
	// (a pixiv ugoira) is played in the viewer as one animation
	Delay int `json:"delay,omitempty"`
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
	// Description is the work's own text (such as a post's body; "" for none), shown on the work page and saved
	// in ComicInfo.xml
	Description string `json:"description,omitempty"`
	// Stats are the site's numbers for the work (likes, views...: the ids in the plugin's BrowseSpec.Stats)
	Stats map[string]int `json:"stats,omitempty"`
	// Owner is the account the work belongs to (such as an X user's id), for settings kept per owner ("" for none)
	Owner string `json:"owner,omitempty"`
	// TitleCreators are the circle and artists the work's title names, from a site whose titles carry them
	// ("[Circle (Artist)] Title"; the plugin takes them out of the title). The app takes them as the work's
	// creators as they are, without looking them up
	TitleCreators *TitleCreators `json:"titleCreators,omitempty"`
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
	// Attachments are the work's files that are not pages (archives, documents...), in the site's order. They are
	// kept in the work info (also in the cbz), so a saved work still knows them
	Attachments []Attachment `json:"attachments,omitempty"`
}

// Attachment is a file of a work that is not a page. Where it is fetched from is asked of the site when needed
// (the plugin's "attachment", like a page image), so an expiring URL is no problem
type Attachment struct {
	// Index is its place among the work's attachments (0-based; what the site is asked for it by)
	Index int    `json:"index"`
	Name  string `json:"name"`
	// Kind is what it is (AttachmentKind of its name when the site does not say): archive | document | audio | other
	Kind string `json:"kind"`
	// Size in bytes (0 when unknown)
	Size int64 `json:"size,omitempty"`
}

// kinds of attachments, by file extension (an archive can later be opened and its images and videos shown as pages)
var attachmentKinds = map[string]string{
	"zip": "archive", "rar": "archive", "7z": "archive", "cbz": "archive", "cbr": "archive", "lzh": "archive", "tar": "archive", "gz": "archive",
	"pdf": "document", "psd": "document", "clip": "document", "ai": "document", "txt": "document", "doc": "document", "docx": "document",
	"mp3": "audio", "wav": "audio", "flac": "audio", "ogg": "audio", "m4a": "audio",
}

// AttachmentKind is the kind of an attachment by its name: archive, document, audio or other
func AttachmentKind(name string) string {
	i := strings.LastIndexByte(name, '.')
	if i < 0 {
		return "other"
	}
	if k, ok := attachmentKinds[strings.ToLower(name[i+1:])]; ok {
		return k
	}
	return "other"
}

type ListQuery struct {
	// Site is the site listed (the first site if empty)
	Site SiteID `json:"site,omitempty"`
	// View is the plugin's own screen listed (one of its BrowseSpec.Views; "" for its list screen). Query is then
	// what was entered on that screen
	View  string `json:"view,omitempty"`
	Query string `json:"query"`
	// Filters are the values of the site plugin's filters (BrowseSpec), such as its sort order and language
	Filters map[string]string `json:"filters"`
	Page    int               `json:"page"`
	// MinPages / MaxPages filter by page count (0 for no limit).
	// The source list's paging is kept and non-matching works are removed within each page (by the app; a plugin
	// may do it too)
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
	// More: there is a next page. Used when the total is not known (Total -1), such as a timeline
	More bool `json:"more,omitempty"`
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

// FilterStats removes works whose stats are below the minimums chosen in the filters with a Stat (filters: the
// filters' values) and adds the count to Hidden. owners are the values kept for owners of works (owner -> filter
// id -> value): a work of such an owner uses them in place of the filters'. A work without the stat is kept
func (r *ListResult) FilterStats(spec *BrowseSpec, filters map[string]string, owners map[string]map[string]string) {
	if spec == nil {
		return
	}
	minsOf := func(values ...map[string]string) map[string]int {
		mins := map[string]int{}
		for _, f := range spec.Filters {
			if f.Stat == "" {
				continue
			}
			v := filters[f.ID]
			for _, over := range values {
				if o, ok := over[f.ID]; ok {
					v = o
				}
			}
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				mins[f.Stat] = n
			}
		}
		return mins
	}
	common := minsOf()
	kept := r.Items[:0]
	for _, it := range r.Items {
		mins := common
		if o := owners[it.Owner]; it.Owner != "" && o != nil {
			mins = minsOf(o)
		}
		low := false
		for stat, min := range mins {
			if v, ok := it.Stats[stat]; ok && v < min {
				low = true
			}
		}
		if low {
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
	// Folder is the subfolder the series was made from (as in ArchiveFile); new archives in it join
	Folder string `json:"folder,omitempty"`
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
	// ArchiveFile is the archive's path relative to the site's save location, or for a work in a local folder
	// "@<folder id>/<path relative to the folder>" (slash-separated)
	ArchiveFile string `json:"archiveFile,omitempty"`
	// Tags are the user's own tags (separate from the work's own tags)
	Tags []string `json:"tags,omitempty"`
	// CustomThumb is the thumbnail chosen by the user (the work's cover if nil)
	CustomThumb *ThumbSpec `json:"customThumb,omitempty"`
	// CustomTitle is the title the user gave the work ("" for the work's own title)
	CustomTitle string `json:"customTitle,omitempty"`
}

// LocalDir is a folder of the user's own archives, shown as a tab of its own. The id stays the same for as long as
// the folder is in the list
type LocalDir struct {
	ID   int    `json:"id"`
	Path string `json:"path"`
	// Name is the tab's name (the folder's name by default)
	Name string `json:"name"`
	// Icon is the tab's icon: a built-in icon's name, or "file:<name>" for an image in the icons folder
	Icon string `json:"icon"`
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
	// Moire is how strongly pages shown smaller than their size are smoothed against moire ("" off | weak | strong)
	Moire string `json:"moire"`
}

type Settings struct {
	LibraryDir string `json:"libraryDir"`
	// PluginSettings are the site plugins' settings: plugin id -> filter id -> the value used by default
	PluginSettings map[string]map[string]string `json:"pluginSettings"`
	// SiteDirs are the save locations chosen for site plugins (site id -> folder). A site without one saves in
	// LibraryDir/<site id>
	SiteDirs                map[string]string `json:"siteDirs"`
	AutoDownload            bool              `json:"autoDownload"`
	DeleteFilesOnUnbookmark bool              `json:"deleteFilesOnUnbookmark"`
	DownloadConcurrency     int               `json:"downloadConcurrency"`
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
	// Gestures are the actions of the touch gestures ("viewer.swipe2Up" -> action ID, "" for none; unset ones use
	// the frontend defaults)
	Gestures map[string]string `json:"gestures"`
	// InfiniteScroll loads the next page automatically when scrolling a list
	InfiniteScroll bool `json:"infiniteScroll"`
	// SiteOrder is the order of the sites' tabs in the sidebar as the user arranged them (site ids; sites not in it
	// follow in their own order)
	SiteOrder []string `json:"siteOrder"`
	// SiteScreenOrder is the order of each site's screens under its tab (site id -> screen ids: "browse",
	// "bookmarks", "favorites", "view.<id>")
	SiteScreenOrder map[string][]string `json:"siteScreenOrder"`
	// SiteScreens is how the screens of the site being used are laid out under its tab in the sidebar ("" icons with
	// their names, one a row | grid: icons only, two a row)
	SiteScreens string `json:"siteScreens"`
	// SiteScreensOpen shows the screens of every site under its tab, not only of the site in use
	SiteScreensOpen bool `json:"siteScreensOpen"`
	// SiteLoadMore is when a site's list loads its next page while scrolling (site id -> LoadMore*); a site without
	// one uses its plugin's choice, or LoadMoreNear
	SiteLoadMore map[string]string `json:"siteLoadMore"`
	// RememberWindow restores the window position, size and maximized state from the last exit at the next start
	RememberWindow bool `json:"rememberWindow"`
	// RememberScreen opens the screen shown at the last exit at the next start (the tab, its list or the open work)
	RememberScreen bool `json:"rememberScreen"`
	// MouseGestures enables "hold right + left click to go back / hold left + right click to go forward"
	MouseGestures bool `json:"mouseGestures"`
	// LibraryIgnored are the archives (relative to the library folder) the user removed from the library;
	// scans skip them
	LibraryIgnored []string `json:"libraryIgnored"`
	// LocalDirs are the folders of the user's own archives, each a tab. Their works are keyed
	// "file:@<id>/<path relative to the folder>"
	LocalDirs []LocalDir `json:"localDirs"`
	// FolderSeriesOff are the subfolders whose automatic series the user deleted; they are not made into series again
	FolderSeriesOff []string `json:"folderSeriesOff"`
	// FileNameFormat is the zip file name format ({title} {artist} {group} etc.; / makes folders)
	FileNameFormat string `json:"fileNameFormat"`
	// SiteFileNameFormats are the formats chosen for sites (site id -> format). A site without one uses its
	// plugin's format, or FileNameFormat
	SiteFileNameFormats map[string]string `json:"siteFileNameFormats"`
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
	// Icon is the site's icon from its plugin (a data URL; "" for none)
	Icon string `json:"icon"`
	// Dir is where the site's works are saved
	Dir string `json:"dir"`
	// Browse is what the site's list screen offers (from its plugin; nil for none)
	Browse *BrowseSpec `json:"browse"`
	// FromURL: works can be added from their URL on the site (the plugin reads the URL)
	FromURL bool `json:"fromURL"`
	// OwnFavorites: Favorites lists the plugin's own choice of works, not works by the bookmarked artists
	OwnFavorites bool `json:"ownFavorites"`
	// FavoriteNames: with OwnFavorites, the plugin gives the names Favorites can be narrowed by (its lists and
	// users...)
	FavoriteNames bool `json:"favoriteNames"`
	// FileNameFormat is the file name format the plugin suggests for its works ("" to use the common one)
	FileNameFormat string `json:"fileNameFormat"`
	// Status: the plugin tells its state (SiteStatus), shown on the site's tab
	Status bool `json:"status"`
	// Login: the user can sign in to the site in a window of the app (SiteLogin), which fills the plugin's login
	// settings
	Login bool `json:"login"`
	// Version and Hosts are the plugin's version and the hosts it connects to (shown on the site's tab)
	Version string   `json:"version"`
	Hosts   []string `json:"hosts"`
	// LoadMore is when the plugin suggests loading the next page while scrolling ("" for LoadMoreNear)
	LoadMore string `json:"loadMore"`
}

// when a list loads its next page while scrolling (Settings.SiteLoadMore, SiteInfo.LoadMore)
const (
	LoadMoreNear   = "near"   // when the end of the list comes near
	LoadMoreBottom = "bottom" // when scrolling on at the bottom of the list
	LoadMoreButton = "button" // only with the button at the bottom
)

// IsLoadMore reports whether s is one of the LoadMore* values
func IsLoadMore(s string) bool {
	return s == LoadMoreNear || s == LoadMoreBottom || s == LoadMoreButton
}

// Text is a text in each UI language ({"ja": ..., "en": ...})
type Text map[string]string

// BrowseSpec is what a site plugin's list screen offers: the search box's hint and the filters above the list.
// The app draws them; their values go to the plugin as ListQuery.Filters (FavoritesQuery.Filters for Favorites)
type BrowseSpec struct {
	Placeholder Text         `json:"placeholder,omitempty"`
	Filters     []FilterSpec `json:"filters"`
	// Namespaces are the kinds of the site's tags ("female", "artist"...): how the app names and colors them
	Namespaces []Namespace `json:"namespaces,omitempty"`
	// Stats are the numbers the site's works have (GallerySummary.Stats), shown on the works
	Stats []StatSpec `json:"stats,omitempty"`
	// CreatorLabels are what the site calls the creators the app calls circle ("group") and artist ("artist"),
	// such as an account's display name and id
	CreatorLabels map[string]Text `json:"creatorLabels,omitempty"`
	// Views are the plugin's own screens, added to the site's tab: a list of works for what is entered on it (such
	// as a user's posts for a user)
	Views []ViewSpec `json:"views,omitempty"`
	// FavoritesLabel / FavoritesIcon name the Favorites screen when it shows the plugin's own choice (such as the
	// user's lists; "Favorites" and its heart if empty)
	FavoritesLabel Text   `json:"favoritesLabel,omitempty"`
	FavoritesIcon  string `json:"favoritesIcon,omitempty"`
	// FavoritesScoped: one of the names above (FavoriteName.Parent / Parents) is always chosen on Favorites, the
	// first at first: there is no "all" above, as they are different lists (such as new works and bookmarks)
	FavoritesScoped bool `json:"favoritesScoped,omitempty"`
}

// ViewSpec is a plugin's own screen: an input (which can be taken from the clipboard) and the works the plugin
// lists for it (ListQuery.View, ListQuery.Query)
type ViewSpec struct {
	ID    string `json:"id"`
	Label Text   `json:"label"`
	// Icon is one of the app's icons for the screen ("user"...)
	Icon        string `json:"icon,omitempty"`
	Placeholder Text   `json:"placeholder,omitempty"`
	// Hint is shown while nothing has been entered
	Hint Text `json:"hint,omitempty"`
	// Namespaces are the kinds of the works' names (such as "artist") whose links open this screen with the name
	Namespaces []string `json:"namespaces,omitempty"`
	// Aliases are kinds of names that stand for a work's name of the first of Namespaces (such as a display name
	// for a user id): their links open this screen with the work's name of that kind
	Aliases []string `json:"aliases,omitempty"`
}

// ViewHeader is what the plugin shows above the works of its own screen for an input (the plugin's "viewHeader")
type ViewHeader struct {
	// Owner is the owner of works the screen is about (such as a user's id): the app offers the values of the
	// filters with a Stat kept for them in the header
	Owner    string `json:"owner,omitempty"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle,omitempty"`
	Text     string `json:"text,omitempty"`
	// Image is a small picture's URL (an icon)
	Image   string       `json:"image,omitempty"`
	Actions []ViewAction `json:"actions,omitempty"`
}

// ViewAction is a button of a view's header: it asks the plugin to do it ("viewAction"), or with Items opens a menu
// of more actions
type ViewAction struct {
	ID    string `json:"id"`
	Label Text   `json:"label"`
	Icon  string `json:"icon,omitempty"`
	// Active shows it as on (such as following, or being on a list)
	Active bool `json:"active,omitempty"`
	// Confirm is asked before doing it ("" to do it at once)
	Confirm Text         `json:"confirm,omitempty"`
	Items   []ViewAction `json:"items,omitempty"`
}

// OwnerSettings are the values of a site's filters kept for one owner of its works (overriding the common ones).
// A value is kept as a share of the common value when it was set (Scales), so it follows the common value: 100
// set while the common value was 1000 is 0.1, and becomes 1000 once the common value is 10000. A value set while
// the common value was 0 has nothing to be a share of, and is kept as it is (Values)
type OwnerSettings struct {
	Site  SiteID `json:"site"`
	Owner string `json:"owner"`
	// Values are the values kept as they are (filter id -> value)
	Values map[string]string `json:"values"`
	// Scales are the values kept as a share of the common value (filter id -> share)
	Scales    map[string]float64 `json:"scales,omitempty"`
	UpdatedAt int64              `json:"updatedAt"`
}

// Empty reports whether nothing is kept
func (o *OwnerSettings) Empty() bool { return len(o.Values) == 0 && len(o.Scales) == 0 }

// Set keeps a value of a filter, given its common value at the time: as a share of it when it is a number above 0
// and the value a number, else as it is ("" removes the value)
func (o *OwnerSettings) Set(id, value, common string) {
	delete(o.Values, id)
	delete(o.Scales, id)
	if value == "" {
		return
	}
	v, err1 := strconv.Atoi(value)
	c, err2 := strconv.Atoi(common)
	if err1 == nil && err2 == nil && c > 0 {
		if o.Scales == nil {
			o.Scales = map[string]float64{}
		}
		o.Scales[id] = float64(v) / float64(c)
		return
	}
	if o.Values == nil {
		o.Values = map[string]string{}
	}
	o.Values[id] = value
}

// Resolve is what the owner's values are with the common values (filter id -> value): the ones kept as they are,
// and the shares of the common ones worked out (rounded)
func (o *OwnerSettings) Resolve(common map[string]string) map[string]string {
	out := map[string]string{}
	for id, v := range o.Values {
		out[id] = v
	}
	for id, share := range o.Scales {
		c, _ := strconv.Atoi(common[id])
		out[id] = strconv.Itoa(int(math.Round(share * float64(c))))
	}
	return out
}

// StatusLine is a line of a site's state shown on its tab (such as the API calls left). The lines are shown as a
// table, each part in a column of its own so the numbers line up
type StatusLine struct {
	Label Text   `json:"label"`
	Value string `json:"value"`
	// Max is what Value is out of ("" for none), shown after it as "/ Max"
	Max string `json:"max,omitempty"`
	// Note is a small text at the end (such as the time until it resets)
	Note string `json:"note,omitempty"`
	// Warn shows the line as a warning
	Warn bool `json:"warn,omitempty"`
}

// StatSpec is a number the site's works have (likes, views...)
type StatSpec struct {
	ID    string `json:"id"`
	Label Text   `json:"label"`
	// Icon is the name of one of the app's icons shown before the number ("heart", "repeat"...; the label if none)
	Icon string `json:"icon,omitempty"`
}

// Namespace is a kind of the site's tags
type Namespace struct {
	ID    string `json:"id"`
	Label Text   `json:"label"`
	// Suffix is added after its tags' names ("♀")
	Suffix string `json:"suffix,omitempty"`
	// Color is its tags' color (CSS)
	Color string `json:"color,omitempty"`
	// Translated: its tags have names in the plugin's tagNamesJa
	Translated bool `json:"translated,omitempty"`
}

// FilterSpec is one filter: a choice of options
type FilterSpec struct {
	ID      string         `json:"id"`
	Label   Text           `json:"label"`
	Options []FilterOption `json:"options"`
	// Default is the value until the user chooses another (the user's choice is kept as the plugin's setting)
	Default string `json:"default"`
	// In are the screens it is on: "browse" and / or "favorites" (browse only if empty), or "settings" for a setting
	// of the plugin that is not a filter (the plugin reads it with pluginsdk.Setting)
	In []string `json:"in,omitempty"`
	// Multi lets several options be chosen (the value is them joined with ","; none chosen means all)
	Multi bool `json:"multi,omitempty"`
	// OnSearch is the value used while there is a search query (the setting comes back when it is cleared)
	OnSearch string `json:"onSearch,omitempty"`
	// Stat makes it a minimum of one of the works' stats (BrowseSpec.Stats): its values are numbers ("" or "0" for
	// none) and the app hides the works below the chosen one
	Stat string `json:"stat,omitempty"`
	// Kind of a setting ("in": settings): "" a choice of Options, "text" a line of text, "secret" a line of text
	// shown hidden (such as a login cookie)
	Kind string `json:"kind,omitempty"`
	// Hint is shown under a setting (how to fill it in)
	Hint Text `json:"hint,omitempty"`
}

type FilterOption struct {
	Value string `json:"value"`
	Label Text   `json:"label"`
	// Color is the option's color where works show it (their type, for the "type" filter)
	Color string `json:"color,omitempty"`
	// Spread: works of this type are manga, opened in spreads when the viewer setting asks for it
	Spread bool `json:"spread,omitempty"`
}

type FavoritesQuery struct {
	// Site is the site searched, with the names from its bookmarks (the first site if empty)
	Site SiteID `json:"site,omitempty"`
	// Filters are the values of the site plugin's filters for Favorites (BrowseSpec)
	Filters map[string]string `json:"filters"`
	Page    int               `json:"page"`
	// Tag narrows it to that artist ("artist:xxx") or group ("group:yyy")
	Tag            string `json:"tag"`
	IncludeGroups  bool   `json:"includeGroups"`
	HideBookmarked bool   `json:"hideBookmarked"`
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
	NS        string `json:"ns"`        // artist | group (or a kind of the plugin's own names)
	Bookmarks int    `json:"bookmarks"` // number of bookmarks with that name
	// Note is a small text after the name (the kind of a plugin's own name, such as "list")
	Note string `json:"note,omitempty"`
	// Parents are the tags of the names it belongs to (such as the lists a user is on). Names that are parents are
	// shown apart, above the others; choosing one shows only the names that belong to it
	Parents []string `json:"parents,omitempty"`
	// Parent shows the name above even when no name belongs to it
	Parent bool `json:"parent,omitempty"`
	// Open is one of the plugin's own screens the name can be opened in (such as a user's screen), with its input
	Open *ViewLink `json:"open,omitempty"`
}

// TitleCreators are a work's circle and artists as its title names them (either may be empty)
type TitleCreators struct {
	Circle  string   `json:"circle,omitempty"`
	Artists []string `json:"artists,omitempty"`
}

// ViewLink opens one of a plugin's own screens (ViewSpec) with an input
type ViewLink struct {
	View  string `json:"view"`
	Query string `json:"query"`
}

type FavoritesResult struct {
	ListResult
	Names []FavoriteName `json:"names"`
}
