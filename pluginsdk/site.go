package pluginsdk

import (
	"encoding/json"
	"errors"
	"slices"
)

// ABI is the version of the interface between the app and its plugins this SDK speaks
const ABI = 2

// Site is a site plugin: its info, its lists, a work with its pages, and where each file of a work is fetched from
type Site interface {
	Info() Info
	List(q ListQuery) (*ListResult, error)
	Work(id string) (*Work, error)
	Source(q SourceQuery) (*Source, error)
}

// What a site plugin does more, one method each. The SDK tells the app which of them the plugin has.
type (
	// Suggester completes the search box: candidates for the word being typed
	Suggester interface {
		Suggest(term string) ([]Suggestion, error)
	}
	// FavoritesLister lists the site's works by several creators (the Favorites screen; see Info.Favorites)
	FavoritesLister interface {
		Favorites(q FavoritesQuery) (*ListResult, error)
	}
	// FavoriteNamer gives the names Favorites can be narrowed by (with Info.Favorites.Own)
	FavoriteNamer interface {
		FavoriteNames() ([]FavoriteName, error)
	}
	// WebURLer gives a work's page on the site ("" for none)
	WebURLer interface {
		WebURL(id string) string
	}
	// URLReader reads a URL the user copied: the id of the work there ("" when it is not one of the site's works)
	URLReader interface {
		FromURL(url string) (string, error)
	}
	// TagNamer gives Japanese names of the site's tags (English name -> Japanese) for the namespaces marked
	// Translated, as JSON (an embedded file is enough). Asked once
	TagNamer interface {
		TagNamesJa() json.RawMessage
	}
	// StatusTeller gives lines of the site's state for its tab (such as the API calls left)
	StatusTeller interface {
		Status() ([]StatusLine, error)
	}
	// ViewHeaderer gives the header above a view's works for its input (nil for none)
	ViewHeaderer interface {
		ViewHeader(view, query string) (*ViewHeader, error)
	}
	// ViewActioner does a button of a view's header (ViewAction.ID); the message is shown after it (nil for none)
	ViewActioner interface {
		ViewAction(view, query, action string) (Text, error)
	}
)

// features are the optional methods a site has (as the app names them)
func features(s Site) []string {
	var out []string
	add := func(has bool, name string) {
		if has {
			out = append(out, name)
		}
	}
	_, ok := s.(Suggester)
	add(ok, "suggest")
	_, ok = s.(FavoritesLister)
	add(ok, "favorites")
	_, ok = s.(FavoriteNamer)
	add(ok, "favoriteNames")
	_, ok = s.(WebURLer)
	add(ok, "webURL")
	_, ok = s.(URLReader)
	add(ok, "fromURL")
	_, ok = s.(TagNamer)
	add(ok, "tagNamesJa")
	_, ok = s.(StatusTeller)
	add(ok, "status")
	_, ok = s.(ViewHeaderer)
	add(ok, "viewHeader")
	_, ok = s.(ViewActioner)
	add(ok, "viewAction")
	return out
}

// Handle answers one call of the app to a site (what Run serves; tests can call it directly)
func Handle(s Site, method string, params json.RawMessage) (any, error) {
	read := func(v any) error {
		if len(params) == 0 {
			return nil
		}
		if err := json.Unmarshal(params, v); err != nil {
			return &Error{Code: "plugin.badParams", Message: method + ": " + err.Error()}
		}
		return nil
	}
	var a struct {
		ID     string `json:"id"`
		URL    string `json:"url"`
		Term   string `json:"term"`
		View   string `json:"view"`
		Query  string `json:"query"`
		Action string `json:"action"`
	}
	switch method {
	case "info":
		return struct {
			ABI int `json:"abi"`
			Info
			Features []string `json:"features"`
		}{ABI, s.Info(), features(s)}, nil
	case "list":
		var q ListQuery
		if err := read(&q); err != nil {
			return nil, err
		}
		return s.List(q)
	case "work":
		if err := read(&a); err != nil {
			return nil, err
		}
		return s.Work(a.ID)
	case "source":
		var q SourceQuery
		if err := read(&q); err != nil {
			return nil, err
		}
		return s.Source(q)
	}
	if err := read(&a); err != nil {
		return nil, err
	}
	switch method {
	case "suggest":
		if o, ok := s.(Suggester); ok {
			return o.Suggest(a.Term)
		}
	case "favorites":
		if o, ok := s.(FavoritesLister); ok {
			var q FavoritesQuery
			if err := read(&q); err != nil {
				return nil, err
			}
			return o.Favorites(q)
		}
	case "favoriteNames":
		if o, ok := s.(FavoriteNamer); ok {
			return o.FavoriteNames()
		}
	case "webURL":
		if o, ok := s.(WebURLer); ok {
			return o.WebURL(a.ID), nil
		}
	case "fromURL":
		if o, ok := s.(URLReader); ok {
			return o.FromURL(a.URL)
		}
	case "tagNamesJa":
		if o, ok := s.(TagNamer); ok {
			return o.TagNamesJa(), nil
		}
	case "status":
		if o, ok := s.(StatusTeller); ok {
			return o.Status()
		}
	case "viewHeader":
		if o, ok := s.(ViewHeaderer); ok {
			return o.ViewHeader(a.View, a.Query)
		}
	case "viewAction":
		if o, ok := s.(ViewActioner); ok {
			msg, err := o.ViewAction(a.View, a.Query, a.Action)
			return struct {
				Message Text `json:"message,omitempty"`
			}{msg}, err
		}
	}
	return nil, &Error{Code: "plugin.unknownMethod", Message: method}
}

// HasFeature reports whether a site has the optional method the app names name (for tests)
func HasFeature(s Site, name string) bool { return slices.Contains(features(s), name) }

// errorOf is what the app gets for an error: an *Error keeps its code, others become "plugin.error"
func errorOf(err error) *Error {
	var e *Error
	if errors.As(err, &e) {
		return e
	}
	return &Error{Code: "plugin.error", Message: err.Error()}
}
