package pluginsdk

import (
	"encoding/json"
	"slices"
	"testing"
)

// a site with the required methods and a web URL
type testSite struct{}

func (testSite) Info() Info {
	return Info{ID: "test", Name: "Test", Version: "1", Hosts: []string{"example.com"}}
}
func (testSite) List(q ListQuery) (*ListResult, error) {
	return &ListResult{Items: []Summary{{ID: q.Query}}, Total: 1, Page: q.Page}, nil
}
func (testSite) Work(id string) (*Work, error) {
	return &Work{Summary: Summary{ID: id}, Pages: []Page{{Index: 0}}}, nil
}
func (testSite) Source(q SourceQuery) (*Source, error) {
	u := "https://example.com/" + q.ID + "/" + string(q.Kind)
	if q.Retry {
		u += "?again"
	}
	return &Source{URL: u, Ext: "jpg"}, nil
}
func (testSite) WebURL(id string) string { return "https://example.com/w/" + id }

func handled(t *testing.T, method, params string) string {
	t.Helper()
	res, err := Handle(testSite{}, method, json.RawMessage(params))
	if err != nil {
		t.Fatalf("%s: %v", method, err)
	}
	b, _ := json.Marshal(res)
	return string(b)
}

func TestInfoTellsTheVersionAndTheOptionalMethods(t *testing.T) {
	var info struct {
		ABI      int      `json:"abi"`
		ID       string   `json:"id"`
		Features []string `json:"features"`
	}
	_ = json.Unmarshal([]byte(handled(t, "info", "")), &info)
	if info.ABI != ABI || info.ID != "test" || !slices.Equal(info.Features, []string{"webURL"}) {
		t.Fatalf("info: %+v", info)
	}
}

func TestHandleReadsTheParams(t *testing.T) {
	if got := handled(t, "list", `{"query":"q","page":2}`); got != `{"items":[{"id":"q","title":"","japaneseTitle":"","type":"","language":"","languageLocal":"","date":"","artists":null,"groups":null,"parodies":null,"characters":null,"tags":null,"pageCount":0}],"failed":null,"total":1,"page":2,"perPage":0,"hidden":0}` {
		t.Errorf("list: %s", got)
	}
	if got := handled(t, "work", `{"id":"7"}`); got != `{"id":"7","title":"","japaneseTitle":"","type":"","language":"","languageLocal":"","date":"","artists":null,"groups":null,"parodies":null,"characters":null,"tags":null,"pageCount":0,"pages":[{"index":0,"name":"","width":0,"height":0}]}` {
		t.Errorf("work: %s", got)
	}
	if got := handled(t, "source", `{"id":"7","kind":"thumb","retry":true}`); got != `{"url":"https://example.com/7/thumb?again","ext":"jpg"}` {
		t.Errorf("source: %s", got)
	}
	if got := handled(t, "webURL", `{"id":"7"}`); got != `"https://example.com/w/7"` {
		t.Errorf("webURL: %s", got)
	}
}

func TestMethodsTheSiteHasNot(t *testing.T) {
	_, err := Handle(testSite{}, "suggest", json.RawMessage(`{"term":"a"}`))
	if e, ok := err.(*Error); !ok || e.Code != "plugin.unknownMethod" {
		t.Fatalf("a method the site has not: %v", err)
	}
	if HasFeature(testSite{}, "suggest") || !HasFeature(testSite{}, "webURL") {
		t.Fatal("features")
	}
}
