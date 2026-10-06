package webapi

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
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

func TestNative(t *testing.T) {
	s := New(&target{}, func(err error) any { return err.Error() })
	srv := httptest.NewServer(s)
	defer srv.Close()
	defer s.Close()

	// the native app: reads a call and answers it
	go func() {
		resp, err := http.Get(srv.URL + "/native/calls")
		if err != nil {
			return
		}
		defer resp.Body.Close()
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			var c struct {
				ID     int64
				Method string
				Params map[string]string
			}
			_ = json.Unmarshal(sc.Bytes(), &c)
			rep, _ := json.Marshal(map[string]any{"id": c.ID, "result": c.Method + ":" + c.Params["title"]})
			if c.Method == "nope" {
				rep, _ = json.Marshal(map[string]any{"id": c.ID, "error": "unsupported"})
			}
			r, err := http.Post(srv.URL+"/native/reply", "application/json", strings.NewReader(string(rep)))
			if err == nil {
				r.Body.Close()
			}
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var got string
	if err := s.Native(ctx, "chooseDir", map[string]string{"title": "t"}, &got); err != nil || got != "chooseDir:t" {
		t.Fatalf("Native: %q, %v", got, err)
	}
	if err := s.Native(ctx, "nope", nil, nil); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("unsupported: %v", err)
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
