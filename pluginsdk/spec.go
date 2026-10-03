package pluginsdk

// What a site plugin's info says about its screens (the "browse" field of its info). The app draws the search box,
// the filters and the tags from it; see model.BrowseSpec in the app for what each field does.

// Text is a text in each UI language ({"ja": ..., "en": ...})
type Text = map[string]string

// BrowseSpec is a site's search box hint, filters, settings and kinds of tags
type BrowseSpec struct {
	Placeholder Text        `json:"placeholder,omitempty"`
	Filters     []Filter    `json:"filters"`
	Namespaces  []Namespace `json:"namespaces,omitempty"`
}

// Filter is one filter of the list screens, or a setting of the plugin (In: "settings")
type Filter struct {
	ID      string   `json:"id"`
	Label   Text     `json:"label"`
	Options []Option `json:"options"`
	// Default is the value until the user chooses another
	Default string `json:"default"`
	// In are the screens it is on: "browse", "favorites" (browse only if empty), or "settings"
	In []string `json:"in,omitempty"`
	// Multi lets several options be chosen (joined with ","; none means all)
	Multi bool `json:"multi,omitempty"`
	// OnSearch is the value used while there is a search query
	OnSearch string `json:"onSearch,omitempty"`
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
