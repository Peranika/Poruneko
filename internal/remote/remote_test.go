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
	var cookies []*http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == sessionCookie {
			cookies = append(cookies, c)
		}
	}
	if w.Code != http.StatusSeeOther || len(cookies) != 1 {
		t.Fatalf("sign in: %d %v", w.Code, w.Result().Cookies())
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
	if w.Code == http.StatusSeeOther || !strings.Contains(w.Body.String(), "minute") {
		t.Fatalf("signed in while it should wait: %d", w.Code)
	}
}

func TestDeviceSettings(t *testing.T) {
	s := New(t.TempDir(), http.NotFoundHandler())
	if err := s.SetPassword("correct horse"); err != nil {
		t.Fatal(err)
	}
	h := s.guard()
	const from = "192.168.1.9:1"
	signIn := func(device string) *http.Cookie {
		w := request(h, "POST", "/remote/login", from, url.Values{"password": {"correct horse"}, "device": {device}})
		for _, c := range w.Result().Cookies() {
			if c.Name == sessionCookie {
				return c
			}
		}
		t.Fatalf("%s: not signed in", device)
		return nil
	}
	ipad, phone := signIn("iPad"), signIn("phone")
	put := func(c *http.Cookie, body string) {
		r := httptest.NewRequest("PUT", "/remote/device", strings.NewReader(body))
		r.RemoteAddr = from
		r.AddCookie(c)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusNoContent {
			t.Fatalf("put: %d %s", w.Code, w.Body.String())
		}
	}
	put(ipad, `{"fontScale":120}`)
	put(phone, `{"fontScale":90}`)
	// the same device signed in again (another address, so another cookie) finds its settings
	again := signIn("iPad")
	if w := request(h, "GET", "/remote/device", from, nil, again); !strings.Contains(w.Body.String(), `"fontScale":120`) || !strings.Contains(w.Body.String(), `"name":"iPad"`) {
		t.Fatalf("iPad settings: %s", w.Body.String())
	}
	if st := s.Status(); strings.Join(st.Devices, ",") != "iPad,phone" {
		t.Fatalf("devices %v", st.Devices)
	}
}
