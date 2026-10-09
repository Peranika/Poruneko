package pluginsdk

// What a site plugin tells the app about itself (Info) and its screens (BrowseSpec): the app draws the search box,
// the filters, the tags and the plugin's own screens from them.

// Text is a text in each UI language ({"ja": ..., "en": ...})
type Text = map[string]string

// Info is what the plugin is and what its site offers. The SDK adds the interface version and the optional methods
// the plugin has
type Info struct {
	// ID is the site's id: the first part of the works' keys ("id:workid"), the bookmarks' site and the folder name
	// under the library folder. Never change it after release (bookmarks refer to it)
	ID      string `json:"id"`
	Name    string `json:"name"`    // on the tab and in the settings
	Version string `json:"version"` // in the settings
	// Icon is the tab icon as a data URL (an SVG is drawn in the text color like the app's icons)
	Icon string `json:"icon,omitempty"`
	// Hosts the plugin may fetch from ("example.com" also allows its subdomains); DisplayHosts are shown in the
	// settings instead (such as the site without its content servers)
	Hosts        []string `json:"hosts"`
	DisplayHosts []string `json:"displayHosts,omitempty"`
	// Pace is the least time between the plugin's requests to a host (ms; subdomains too), for a site that bans
	// quick page loads: the app holds each request until its turn. It applies to the plugin's own fetches only
	Pace map[string]int `json:"pace,omitempty"`
	// Login lets the user sign in to the site in a window of the app (Windows), which fills settings with cookies
	Login *Login `json:"login,omitempty"`
	// LoadMore is when the lists load their next page while scrolling: "near" (the default), "bottom" (only when
	// scrolling on at the bottom) or "button"; the later ones call the site less. The user can choose another
	LoadMore string `json:"loadMore,omitempty"`
	// FileNameFormat is the file name format suggested for the site's works (such as "[{creator}] {id} {title}");
	// the user can choose another
	FileNameFormat string `json:"fileNameFormat,omitempty"`
	// Creators is how the site's works name their creators
	Creators *Creators `json:"creators,omitempty"`
	// Favorites is how the site's Favorites screen works (with FavoritesLister)
	Favorites *Favorites `json:"favorites,omitempty"`
	// Browse is the site's screens: search box, filters, settings, tags, numbers and the plugin's own views
	Browse *BrowseSpec `json:"browse,omitempty"`
}

// Creators is how a site's works name their creators
type Creators struct {
	// FromSite: the works' own Artists / Groups are their creators (no lookup on DLsite / FANZA)
	FromSite bool `json:"fromSite,omitempty"`
	// Labels are what the site calls the creators the app calls circle ("group") and artist ("artist"), such as an
	// account's display name and id
	Labels map[string]Text `json:"labels,omitempty"`
}

// Favorites is how a site's Favorites screen works
type Favorites struct {
	// Own: Favorites is the plugin's own choice of works (such as the user's lists on the site), narrowed by the
	// names of FavoriteNamer: the screen shows no artists and the query gets the chosen name only
	Own bool `json:"own,omitempty"`
	// Label / Icon name the screen (such as "Lists")
	Label Text   `json:"label,omitempty"`
	Icon  string `json:"icon,omitempty"`
	// Scoped: Favorites is made of different lists (the names above): one of them is always chosen, the first at
	// first, with no "all" above them
	Scoped bool `json:"scoped,omitempty"`
}

// BrowseSpec is a site's search box hint, filters, settings, kinds of tags, the numbers its works have and the
// plugin's own screens
type BrowseSpec struct {
	Placeholder Text        `json:"placeholder,omitempty"`
	Filters     []Filter    `json:"filters"`
	Namespaces  []Namespace `json:"namespaces,omitempty"`
	Stats       []Stat      `json:"stats,omitempty"`
	// Views are the plugin's own screens on the site's tab: an input and the works List gives for it (ListQuery.View
	// is then the view's id and Query the input)
	Views []View `json:"views,omitempty"`
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

// ViewHeader is what is shown above the works of a view (ViewHeaderer). Owner is the owner of works it is about
// (the same as the works' Owner, such as a user's id): the app then offers the filters with a Stat to be kept for
// that owner
type ViewHeader struct {
	Owner    string       `json:"owner,omitempty"`
	Title    string       `json:"title"`
	Subtitle string       `json:"subtitle,omitempty"`
	Text     string       `json:"text,omitempty"`
	Image    string       `json:"image,omitempty"` // a small picture's URL
	Actions  []ViewAction `json:"actions,omitempty"`
}

// ViewAction is a button of a view's header: pressing it calls ViewActioner.ViewAction, whose message is shown after
// it. With Items it opens a menu of them instead
type ViewAction struct {
	ID      string       `json:"id"`
	Label   Text         `json:"label"`
	Icon    string       `json:"icon,omitempty"`
	Active  bool         `json:"active,omitempty"`  // shown as on (following, on a list...)
	Confirm Text         `json:"confirm,omitempty"` // asked before doing it
	Items   []ViewAction `json:"items,omitempty"`
}

// StatusLine is a line of the site's state shown on its tab (StatusTeller).
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
	// Translated: its tags have Japanese names (TagNamer)
	Translated bool `json:"translated,omitempty"`
}

// Login is how the user signs in to the site: the app opens URL in a window of its own, the user signs in
// there, and the app fills the plugin's settings with the site's cookies (each Setting gets its cookie's value)
type Login struct {
	URL string `json:"url"` // the sign-in page (https)
	// CookieURL is the URL whose cookies are read (URL if empty), such as the site's top page
	CookieURL string        `json:"cookieUrl,omitempty"`
	Cookies   []LoginCookie `json:"cookies"`
}

// LoginCookie is a cookie read after signing in. Match is a regular expression its value has once the user is signed
// in, for a cookie the site also sets for visitors (empty for any value)
type LoginCookie struct {
	Name    string `json:"name"`
	Setting string `json:"setting"`
	Match   string `json:"match,omitempty"`
}
