package pluginsdk

// What a site plugin's info says about its screens (the "browse" field of its info). The app draws the search box,
// the filters and the tags from it; see model.BrowseSpec in the app for what each field does.

// Text is a text in each UI language ({"ja": ..., "en": ...})
type Text = map[string]string

// BrowseSpec is a site's search box hint, filters, settings, kinds of tags and the numbers its works have
type BrowseSpec struct {
	Placeholder Text        `json:"placeholder,omitempty"`
	Filters     []Filter    `json:"filters"`
	Namespaces  []Namespace `json:"namespaces,omitempty"`
	Stats       []Stat      `json:"stats,omitempty"`
	// CreatorLabels are what the site calls the creators the app calls circle ("group") and artist ("artist")
	CreatorLabels map[string]Text `json:"creatorLabels,omitempty"`
	// Views are the plugin's own screens on the site's tab: an input and the works "list" gives for it (its params
	// then have "view" and the input as "query")
	Views []View `json:"views,omitempty"`
	// FavoritesLabel / FavoritesIcon name the Favorites screen (such as "Lists" for the user's lists)
	FavoritesLabel Text   `json:"favoritesLabel,omitempty"`
	FavoritesIcon  string `json:"favoritesIcon,omitempty"`
}

// View is a plugin's own screen
type View struct {
	ID          string `json:"id"`
	Label       Text   `json:"label"`
	Icon        string `json:"icon,omitempty"` // one of the app's icons ("user"...)
	Placeholder Text   `json:"placeholder,omitempty"`
	Hint        Text   `json:"hint,omitempty"` // shown while nothing has been entered
	// Namespaces are the kinds of the works' names (such as "artist") whose links open this screen with the name
	Namespaces []string `json:"namespaces,omitempty"`
	// Aliases are kinds of names that stand for a work's name of the first of Namespaces (such as a display name
	// for a user id): their links open this screen with the work's name of that kind
	Aliases []string `json:"aliases,omitempty"`
}

// ViewHeader is the answer to "viewHeader" ({view, query, lang}; lang is the UI language "ja" | "en"): what is shown
// above the works of a view. Owner is the owner of works it is about (the same as the works' "owner", such as a
// user's id): the app then offers the filters with a Stat to be kept for that owner
type ViewHeader struct {
	Owner    string       `json:"owner,omitempty"`
	Title    string       `json:"title"`
	Subtitle string       `json:"subtitle,omitempty"`
	Text     string       `json:"text,omitempty"`
	Image    string       `json:"image,omitempty"` // a small picture's URL
	Actions  []ViewAction `json:"actions,omitempty"`
}

// ViewAction is a button of a view's header: pressing it calls "viewAction" ({view, query, action}), which answers
// {message} (a Text shown after it, or none). With Items it opens a menu of them instead
type ViewAction struct {
	ID      string       `json:"id"`
	Label   Text         `json:"label"`
	Icon    string       `json:"icon,omitempty"`
	Active  bool         `json:"active,omitempty"`  // shown as on (following, on a list...)
	Confirm Text         `json:"confirm,omitempty"` // asked before doing it
	Items   []ViewAction `json:"items,omitempty"`
}

// Attachment is a file of a work that is not a page (an archive, a document...), listed in "gallery"'s
// "attachments". Its URL is not given there: the app asks "attachment" ({id, index}) for it when needed, which
// answers like "image" ({url, headers, ext}), so an expiring URL can be made fresh
type Attachment struct {
	Index int    `json:"index"`
	Name  string `json:"name"`
	Kind  string `json:"kind,omitempty"` // archive | document | audio | other ("" for the app to tell by the name)
	Size  int64  `json:"size,omitempty"`
}

// StatusLine is a line of the site's state shown on its tab (the answer to "status" ({lang}) is a list of them).
// The lines are a table: Value, "/ Max" and Note each line up in their own column
type StatusLine struct {
	Label Text   `json:"label"`
	Value string `json:"value"`
	Max   string `json:"max,omitempty"`  // what Value is out of
	Note  string `json:"note,omitempty"` // such as the time until it resets
	Warn  bool   `json:"warn,omitempty"`
}

// Stat is a number the site's works have (likes, views...), given in each work's "stats" and shown on it
type Stat struct {
	ID    string `json:"id"`
	Label Text   `json:"label"`
	// Icon is the name of one of the app's icons shown before the number ("heart", "repeat"...; the label if none)
	Icon string `json:"icon,omitempty"`
}

// Filter is one filter of the list screens, or a setting of the plugin (In: "settings")
type Filter struct {
	ID      string   `json:"id"`
	Label   Text     `json:"label"`
	Options []Option `json:"options"`
	// Default is the value until the user chooses another
	Default string `json:"default"`
	// In are the screens it is on: "browse", "favorites", a view's id (browse only if empty), or "settings"
	In []string `json:"in,omitempty"`
	// Multi lets several options be chosen (joined with ","; none means all)
	Multi bool `json:"multi,omitempty"`
	// OnSearch is the value used while there is a search query
	OnSearch string `json:"onSearch,omitempty"`
	// Stat makes it a minimum of a stat: the options' values are numbers ("" or "0" for none) and the app hides
	// the works below the chosen one
	Stat string `json:"stat,omitempty"`
	// Kind of a setting (In: "settings"): "" a choice of Options, "text" a line of text, "secret" a hidden one
	Kind string `json:"kind,omitempty"`
	// Hint is shown under a setting
	Hint Text `json:"hint,omitempty"`
}

// Option is one choice of a filter
type Option struct {
	Value string `json:"value"`
	Label Text   `json:"label"`
	// Color is shown where works have this value (their type, for the "type" filter)
	Color string `json:"color,omitempty"`
	// Spread: works of this type are manga, opened in spreads when the viewer setting asks for it
	Spread bool `json:"spread,omitempty"`
}

// Namespace is a kind of the site's tags ("female", "artist"...)
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
