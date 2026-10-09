//go:build wasip1

// A plugin for the tests of internal/plugin: a site (with a web URL) made with the SDK, and calls of its own for
// the host's functions ("echo", "fetch", the store...)
package main

import (
	"encoding/json"
	"errors"

	"github.com/Peranika/Poruneko/pluginsdk"
)

type site struct{}

func (site) Info() pluginsdk.Info {
	return pluginsdk.Info{ID: "testsite", Name: "Test Site", Version: "0.1", Hosts: []string{"127.0.0.1"},
		Favorites: &pluginsdk.Favorites{Own: true, Label: pluginsdk.Text{"en": "Lists"}}}
}

func (site) List(q pluginsdk.ListQuery) (*pluginsdk.ListResult, error) {
	return &pluginsdk.ListResult{Items: []pluginsdk.Summary{{ID: "42", Title: "Work"}}, Total: 1, Page: 1}, nil
}

func (site) Work(id string) (*pluginsdk.Work, error) {
	return &pluginsdk.Work{Summary: pluginsdk.Summary{ID: id}, Pages: []pluginsdk.Page{{Index: 0}}}, nil
}

// Source tells what it was asked (and the UI language) in its URL
func (site) Source(q pluginsdk.SourceQuery) (*pluginsdk.Source, error) {
	u := "https://127.0.0.1/" + string(q.Kind) + "/" + q.ID + "?lang=" + pluginsdk.Lang()
	if q.Retry {
		u += "&retry"
	}
	return &pluginsdk.Source{URL: u, Ext: "jpg"}, nil
}

func (site) WebURL(id string) string { return "https://127.0.0.1/w/" + id }

func init() {
	pluginsdk.Serve(func(method string, params json.RawMessage) (any, error) {
		switch method {
		case "storeSet":
			var p struct{ Key, Value string }
			_ = json.Unmarshal(params, &p)
			pluginsdk.StoreSet(p.Key, []byte(p.Value))
			return nil, nil
		case "storeGet":
			var p struct{ Key string }
			_ = json.Unmarshal(params, &p)
			v, ok := pluginsdk.StoreGet(p.Key)
			return map[string]any{"value": string(v), "ok": ok}, nil
		case "echo":
			var v any
			_ = json.Unmarshal(params, &v)
			return v, nil
		case "fetch":
			var p struct{ URL string }
			_ = json.Unmarshal(params, &p)
			res, err := pluginsdk.Fetch(pluginsdk.Request{URL: p.URL, Headers: map[string]string{"X-Test": "1"}})
			if err != nil {
				return nil, &pluginsdk.Error{Code: "test.fetch", Message: err.Error()}
			}
			pluginsdk.Log("fetched " + p.URL)
			return string(res.Body), nil
		case "fetchMany":
			var p struct{ URLs []string }
			_ = json.Unmarshal(params, &p)
			reqs := make([]pluginsdk.Request, len(p.URLs))
			for i, u := range p.URLs {
				reqs[i] = pluginsdk.Request{URL: u}
			}
			res, err := pluginsdk.FetchMany(reqs)
			if err != nil {
				return nil, err
			}
			out := make([]string, len(res))
			for i, r := range res {
				if r.Error != "" {
					out[i] = "error"
				} else {
					out[i] = string(r.Body)
				}
			}
			return out, nil
		case "fail":
			return nil, errors.New("plain failure")
		}
		return pluginsdk.Handle(site{}, method, params)
	})
}

func main() {}
