package webapi

import (
	"bufio"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type item struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type target struct{ called bool }

func (t *target) Add(a, b int) int                 { return a + b }
func (t *target) Echo(it item) (item, error)       { it.Count++; return it, nil }
func (t *target) Fail(code string) (string, error) { return "", errors.New(code) }
func (t *target) Nothing()                         { t.called = true }

func post(t *testing.T, h http.Handler, path, body string) (int, map[string]json.RawMessage) {
	t.Helper()
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodPost, path, strings.NewReader(body)))
	var out map[string]json.RawMessage
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func TestCall(t *testing.T) {
	tg := &target{}
	s := New(tg, func(err error) any { return map[string]string{"code": err.Error()} })
	if _, out := post(t, s, "/api/call/Add", "[2, 3]"); string(out["result"]) != "5" {
		t.Errorf("Add: %s", out["result"])
	}
	if _, out := post(t, s, "/api/call/Echo", `[{"name": "x", "count": 1}]`); string(out["result"]) != `{"name":"x","count":2}` {
		t.Errorf("Echo: %s", out["result"])
	}
	if _, out := post(t, s, "/api/call/Fail", `["bad"]`); string(out["error"]) != `{"code":"bad"}` {
		t.Errorf("Fail: %s", out["error"])
	}
	if _, out := post(t, s, "/api/call/Nothing", `[]`); string(out["result"]) != "null" || !tg.called {
		t.Errorf("Nothing: %s", out["result"])
	}
	if code, _ := post(t, s, "/api/call/Missing", `[]`); code != http.StatusNotFound {
		t.Errorf("Missing: %d", code)
	}
	if code, _ := post(t, s, "/api/call/Add", `["x"]`); code != http.StatusBadRequest {
		t.Errorf("bad argument: %d", code)
	}
}

func TestEvents(t *testing.T) {
	s := New(&target{}, func(err error) any { return err.Error() })
	srv := httptest.NewServer(s)
	defer srv.Close()
	defer s.Close()
	resp, err := http.Get(srv.URL + "/api/events")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	r := bufio.NewReader(resp.Body)
	if line, _ := r.ReadString('\n'); line != ": open\n" {
		t.Fatalf("first line %q", line)
	}
	s.Emit("series:changed", nil)
	r.ReadString('\n') // the blank line after the comment
	if line, _ := r.ReadString('\n'); line != `data: {"data":null,"name":"series:changed"}`+"\n" {
		t.Fatalf("event %q", line)
	}
}
