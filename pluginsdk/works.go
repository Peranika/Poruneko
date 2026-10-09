package pluginsdk

// What a site plugin gives the app: lists of works, a work with its pages, and where each file is fetched from.
// The app sets the works' keys and site, and turns missing lists into empty ones.

// ListQuery is a page of the site's list (or of one of the plugin's views)
type ListQuery struct {
	// View is the plugin's own screen listed (one of BrowseSpec.Views; "" for the site's list screen), Query what
	// was entered on it. On the list screen Query is the search box as typed (the plugin parses it)
	View  string `json:"view,omitempty"`
	Query string `json:"query"`
	// Filters are the values of the filters on the screen (BrowseSpec.Filters)
	Filters map[string]string `json:"filters"`
	// Page starts at 1
	Page int `json:"page"`
	// MinPages / MaxPages are the page count filter (0 for no limit). The app takes the works outside it off the
	// page and counts them in Hidden itself, so a plugin can leave them alone
	MinPages int `json:"minPages,omitempty"`
	MaxPages int `json:"maxPages,omitempty"`
}

// ListResult is a page of works
type ListResult struct {
	Items []Summary `json:"items"`
	// Failed are ids on this page whose info could not be read (the screen says some works are missing)
	Failed []string `json:"failed"`
	// Total is how many works the list has (-1 when it is not known, such as a timeline: More then tells whether
	// there is a next page)
	Total   int  `json:"total"`
	Page    int  `json:"page"`
	PerPage int  `json:"perPage"`
	More    bool `json:"more,omitempty"`
	// Hidden is how many works of the page the plugin left out (by its own filters)
	Hidden int `json:"hidden"`
}

// Summary is a work as lists show it
type Summary struct {
	// ID is the work's id on the site (keep it stable: the work's key is "<site>:<id>")
	ID            string `json:"id"`
	Title         string `json:"title"`
	JapaneseTitle string `json:"japaneseTitle"`
	// Type is one of the values of the filter with id "type" (its labels, colors and Spread apply)
	Type          string `json:"type"`
	Language      string `json:"language"`
	LanguageLocal string `json:"languageLocal"`
	Date          string `json:"date"`
	// Artists / Groups are the site's own spellings of the creators. Favorites searches the site with them as
	// "artist:<name>" / "group:<name>" (lowercase, spaces as "_"), so give them as the site's search takes them
	Artists    []string `json:"artists"`
	Groups     []string `json:"groups"`
	Parodies   []string `json:"parodies"`
	Characters []string `json:"characters"`
	// Tags are shown as search links "ns:name" (Ns is one of BrowseSpec.Namespaces)
	Tags      []Tag `json:"tags"`
	PageCount int   `json:"pageCount"`
	// Description is the work's own text (a post's body...), shown on its page and saved in ComicInfo.xml
	Description string `json:"description,omitempty"`
	// Stats are the work's numbers (by the ids of BrowseSpec.Stats)
	Stats map[string]int `json:"stats,omitempty"`
	// Owner is the account the work belongs to (a user's id, stable when the name changes): the user can keep their
	// own values of the filters with a Stat for an owner (from a view's header with that Owner)
	Owner string `json:"owner,omitempty"`
	// TitleCreators are the creators the title names, for a site whose titles carry them ("[Circle (Artist)]
	// Title"; take them out of the title). The app takes them as the work's creators without looking them up.
	// Leave it out when the title does not tell
	TitleCreators *TitleCreators `json:"titleCreators,omitempty"`
}

// Tag is one of a work's tags
type Tag struct {
	NS   string `json:"ns"`
	Name string `json:"name"`
}

// TitleCreators are the circle and artists a work's title names
type TitleCreators struct {
	Circle  string   `json:"circle,omitempty"`
	Artists []string `json:"artists,omitempty"`
}

// Work is a work with its pages, for its page and the viewer
type Work struct {
	Summary
	// Pages are in reading order from index 0
	Pages []Page `json:"pages"`
	// Attachments are the work's files that are not pages (archives, documents...)
	Attachments []Attachment `json:"attachments,omitempty"`
}

// Page is a page of a work
type Page struct {
	Index int    `json:"index"`
	Name  string `json:"name"`
	// Width / Height are its size when the site tells it (0 when unknown): the viewer lays out spreads with it
	// before the image arrives (a page wider than tall is shown alone)
	Width  int `json:"width"`
	Height int `json:"height"`
	// Video: the page is a video (Source gives its mp4 / webm), played in the viewer
	Video bool `json:"video,omitempty"`
	// Delay is how long the page is shown (ms) when it is a frame of an animation: a work whose pages all have one
	// (a pixiv ugoira) is played in the viewer as one animation
	Delay int `json:"delay,omitempty"`
}

// Attachment is a file of a work that is not a page. Its URL comes from Source (Kind SourceAttachment) when it is
// opened or downloaded, so it may expire
type Attachment struct {
	// Index is its place among the work's attachments (what Source is asked for it by)
	Index int    `json:"index"`
	Name  string `json:"name"`
	// Kind is archive | document | audio | other ("" for the app to tell by the name)
	Kind string `json:"kind,omitempty"`
	Size int64  `json:"size,omitempty"`
}

// SourceKind is what file of a work a Source is asked for
type SourceKind string

const (
	SourcePage       SourceKind = "page"       // a page (Index)
	SourceThumb      SourceKind = "thumb"      // a page's thumbnail (Index; Big: a larger one for the work's cover)
	SourceAttachment SourceKind = "attachment" // an attachment (Index: Attachment.Index)
)

// SourceQuery asks where a file of a work is fetched from
type SourceQuery struct {
	ID    string     `json:"id"`
	Kind  SourceKind `json:"kind"`
	Index int        `json:"index"`
	// Big asks for a larger thumbnail (the cover on the work's page; give the small one when there is none)
	Big bool `json:"big,omitempty"`
	// Retry: fetching what this answered before failed. Drop what may be stale (an expired URL or key) and answer
	// afresh; the app asks once more this way
	Retry bool `json:"retry,omitempty"`
}

// Source is where the app fetches a file from (it fetches, caches and saves it itself)
type Source struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"` // such as Referer
	Ext     string            `json:"ext"`               // the file extension ("webp"...)
	// Fallback is fetched when URL is not there (404 / 410), such as the page's thumbnail on a site whose files are
	// sometimes missing
	Fallback string `json:"fallback,omitempty"`
	// Entry: the page is this file in the zip at URL (a site whose pages are files of one archive, such as a pixiv
	// ugoira's frames); the app fetches the zip once and reads each page from it
	Entry string `json:"entry,omitempty"`
	// Crop: the thumbnail is this rectangle of the picture at URL (a site whose thumbnails are tiles of one picture);
	// the app fetches the picture once and cuts each out
	Crop *Crop `json:"crop,omitempty"`
}

// Crop is a rectangle of a picture, in its pixels
type Crop struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

// Suggestion is a candidate for the word being typed in the search box (Count 0 when unknown)
type Suggestion struct {
	NS    string `json:"ns"`
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// FavoritesQuery is a page of Favorites: works having any of Tags ("artist:x", "group:y"), newest first. With
// Favorites.Own the tags are instead the one name chosen from FavoriteNames (none for all, or with Favorites.Scoped
// for the first)
type FavoritesQuery struct {
	Tags []string `json:"tags"`
	// Filters are the filters with "favorites" in their In
	Filters map[string]string `json:"filters"`
	Page    int               `json:"page"`
	// Exclude are keys ("<site>:<id>") of works to leave out (bookmarked ones)
	Exclude map[string]bool `json:"exclude"`
}

// FavoriteName is a name Favorites can be narrowed by, with Favorites.Own (shown on its left; its Tag comes as the
// query's only tag). Names that are some name's Parents (such as lists), or have Parent, are shown apart above the
// others; choosing one shows only the names belonging to it
type FavoriteName struct {
	Tag       string   `json:"tag"`
	Name      string   `json:"name"`
	NS        string   `json:"ns"`
	Bookmarks int      `json:"bookmarks"`
	Note      string   `json:"note,omitempty"` // a small text after the name (its kind, such as "list")
	Parents   []string `json:"parents,omitempty"`
	Parent    bool     `json:"parent,omitempty"`
	// Open adds a button opening one of the plugin's views with an input (a user's screen)
	Open *ViewLink `json:"open,omitempty"`
}

// ViewLink opens one of the plugin's views with an input
type ViewLink struct {
	View  string `json:"view"`
	Query string `json:"query"`
}
