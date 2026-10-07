package remote

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func request(h http.Handler, method, path, from string, form url.Values, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	var r *http.Request
	if form != nil {
		r = httptest.NewRequest(method, path, strings.NewReader(form.Encode()))
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	r.RemoteAddr = from
	for _, c := range cookies {
		r.AddCookie(c)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestPrivateClients(t *testing.T) {
	for addr, want := range map[string]bool{
		"192.168.1.5:1234": true, "100.70.1.2:1": true, "10.0.0.1:1": true, "[::1]:1": true, "[fd00::1]:1": true,
		"8.8.8.8:1": false, "[2001:db8::1]:1": false, "100.128.0.1:1": false,
	} {
		if got := privateClient(addr); got != want {
			t.Errorf("%s: %v", addr, got)
		}
	}
}

func TestMeshOnlyThroughTheVPN(t *testing.T) {
	vpn := &net.TCPAddr{IP: net.ParseIP("100.80.1.1"), Port: DefaultPort}
	lan := &net.TCPAddr{IP: net.ParseIP("192.168.1.2"), Port: DefaultPort}
	if !allowedClient("100.90.2.2:1", vpn) {
		t.Error("a mesh peer through the VPN is refused")
	}
	if allowedClient("100.90.2.2:1", lan) {
		t.Error("a 100.64/10 address through the home network (a router's provider side) is let in")
	}
	if !allowedClient("192.168.1.9:1", lan) {
		t.Error("a home device is refused")
	}
}

func TestSignIn(t *testing.T) {
	app := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("app")) })
	s := New(t.TempDir(), app)
	if err := s.SetEnabled(true); err != ErrNoPassword {
		t.Fatalf("enabled without a password: %v", err)
	}
	if err := s.SetPassword("short"); err != ErrShortPassword {
		t.Fatalf("short password: %v", err)
	}
	if err := s.SetPassword("correct horse"); err != nil {
		t.Fatal(err)
	}
	h := s.guard()
	const home = "192.168.1.5:5555"

	if w := request(h, "GET", "/api/call/Bookmarks", "8.8.8.8:1", nil); w.Code != http.StatusForbidden {
		t.Fatalf("internet client: %d", w.Code)
	}
	if w := request(h, "GET", "/", home, nil); !strings.Contains(w.Body.String(), `name="password"`) {
		t.Fatal("no sign-in page")
	}
	if w := request(h, "POST", "/api/call/Bookmarks", home, nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("API without signing in: %d", w.Code)
	}
	if w := request(h, "POST", "/remote/login", home, url.Values{"password": {"wrong one"}}); w.Code != http.StatusUnauthorized {
		t.Fatalf("wrong password: %d", w.Code)
	}
	w := request(h, "POST", "/remote/login", home, url.Values{"password": {"correct horse"}})
	cookies := w.Result().Cookies()
	if w.Code != http.StatusSeeOther || len(cookies) != 1 {
		t.Fatalf("sign in: %d %v", w.Code, cookies)
	}
	if w := request(h, "GET", "/", home, nil, cookies[0]); w.Body.String() != "app" {
		t.Fatalf("signed in: %q", w.Body.String())
	}
	// a new password signs everyone out
	if err := s.SetPassword("another horse"); err != nil {
		t.Fatal(err)
	}
	if w := request(h, "GET", "/x", home, nil, cookies[0]); w.Code != http.StatusUnauthorized {
		t.Fatalf("old session after a new password: %d", w.Code)
	}
}

func TestTooManyWrongPasswords(t *testing.T) {
	s := New(t.TempDir(), http.NotFoundHandler())
	if err := s.SetPassword("correct horse"); err != nil {
		t.Fatal(err)
	}
	h := s.guard()
	const from = "192.168.1.9:1"
	for range failsAllowed {
		request(h, "POST", "/remote/login", from, url.Values{"password": {"nope nope"}})
	}
	w := request(h, "POST", "/remote/login", from, url.Values{"password": {"correct horse"}})
	if len(w.Result().Cookies()) != 0 || !strings.Contains(w.Body.String(), "minute") {
		t.Fatalf("signed in while it should wait: %d", w.Code)
	}
}
