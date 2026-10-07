// Package remote lets the user use the desktop app from a browser on their other devices (a tablet, a phone), on
// the home network or through a mesh VPN (NordVPN Meshnet, Tailscale...): it serves the same screen and API as the
// Android app's backend, behind a password. Only devices on private networks may connect, so a port opened to the
// internet by mistake does not open the app to it.
package remote

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log"
	"net"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// DefaultPort is where the app listens unless told otherwise
const DefaultPort = 47392

const (
	sessionCookie = "poruneko_session"
	sessionTime   = 30 * 24 * time.Hour
	minPassword   = 8
	failsAllowed  = 5           // wrong passwords from one address before it waits
	failWait      = time.Minute // how long it waits
	hashRounds    = 600_000
)

type config struct {
	Enabled bool   `json:"enabled"`
	Port    int    `json:"port,omitempty"`
	Salt    []byte `json:"salt,omitempty"`
	Hash    []byte `json:"hash,omitempty"`
	// Sessions are the signed-in browsers: the SHA-256 of their cookie -> when it expires (Unix ms)
	Sessions map[string]int64 `json:"sessions,omitempty"`
}

// Server is the remote access: its settings, and the HTTP server while it is on
type Server struct {
	path    string
	handler http.Handler // the app's screen, API and images

	mu    sync.Mutex
	cfg   config
	srv   *http.Server
	err   error // why it could not listen
	fails map[string]*failCount
}

type failCount struct {
	n     int
	until time.Time
}

// New loads the settings from the data folder; Start serves handler once remote access is on
func New(dataDir string, handler http.Handler) *Server {
	s := &Server{path: filepath.Join(dataDir, "remote.json"), handler: handler, fails: map[string]*failCount{}}
	if b, err := os.ReadFile(s.path); err == nil {
		if err := json.Unmarshal(b, &s.cfg); err != nil {
			log.Printf("[remote] %s: %v", s.path, err)
		}
	}
	if s.cfg.Sessions == nil {
		s.cfg.Sessions = map[string]int64{}
	}
	return s
}

// save writes the settings (call with mu held)
func (s *Server) save() {
	now := time.Now().UnixMilli()
	for k, until := range s.cfg.Sessions {
		if until < now {
			delete(s.cfg.Sessions, k)
		}
	}
	b, err := json.MarshalIndent(s.cfg, "", " ")
	if err != nil {
		return
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err == nil {
		if err := os.Rename(tmp, s.path); err != nil {
			log.Printf("[remote] save: %v", err)
		}
	}
}

func (s *Server) port() int {
	if s.cfg.Port > 0 {
		return s.cfg.Port
	}
	return DefaultPort
}

// ---------------------------------------------------------------- Settings

// Status is remote access as the settings show it
type Status struct {
	Enabled     bool     `json:"enabled"`
	HasPassword bool     `json:"hasPassword"`
	Listening   bool     `json:"listening"`
	URLs        []string `json:"urls"`
	Error       string   `json:"error"`
	Sessions    int      `json:"sessions"`
}

func (s *Server) Status() Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := Status{Enabled: s.cfg.Enabled, HasPassword: len(s.cfg.Hash) > 0, Listening: s.srv != nil, URLs: []string{}, Sessions: len(s.cfg.Sessions)}
	if s.err != nil {
		st.Error = s.err.Error()
	}
	if s.srv != nil {
		for _, ip := range localIPs() {
			st.URLs = append(st.URLs, "http://"+net.JoinHostPort(ip, strconv.Itoa(s.port()))+"/")
		}
	}
	return st
}

// ErrShortPassword is a password shorter than minPassword
var ErrShortPassword = fmt.Errorf("the password needs at least %d characters", minPassword)

// ErrNoPassword is turning remote access on before a password is set
var ErrNoPassword = errors.New("set a password first")

// SetPassword sets the password; the browsers signed in with the old one are signed out
func (s *Server) SetPassword(pw string) error {
	if len([]rune(pw)) < minPassword {
		return ErrShortPassword
	}
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	hash, err := pbkdf2.Key(sha256.New, pw, salt, hashRounds, 32)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cfg.Salt, s.cfg.Hash = salt, hash
	s.cfg.Sessions = map[string]int64{}
	s.save()
	return nil
}

// SetEnabled turns remote access on (listening) or off
func (s *Server) SetEnabled(on bool) error {
	s.mu.Lock()
	if on && len(s.cfg.Hash) == 0 {
		s.mu.Unlock()
		return ErrNoPassword
	}
	s.cfg.Enabled = on
	s.save()
	s.mu.Unlock()
	if on {
		return s.Start()
	}
	s.Stop()
	return nil
}

// SignOutAll signs out every browser
func (s *Server) SignOutAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cfg.Sessions = map[string]int64{}
	s.save()
}

// ---------------------------------------------------------------- Serving

// Start listens if remote access is on (at startup and when it is turned on)
func (s *Server) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.cfg.Enabled || s.srv != nil {
		return nil
	}
	// PORUNEKO_REMOTE_BIND limits it to one address (127.0.0.1 to try it on this machine without the firewall asking)
	ln, err := net.Listen("tcp", net.JoinHostPort(os.Getenv("PORUNEKO_REMOTE_BIND"), strconv.Itoa(s.port())))
	s.err = err
	if err != nil {
		log.Printf("[remote] listen: %v", err)
		return err
	}
	s.srv = &http.Server{Handler: s.guard(), ReadHeaderTimeout: 10 * time.Second}
	srv := s.srv
	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("[remote] %v", err)
		}
	}()
	log.Printf("[remote] listening on port %d", s.port())
	return nil
}

// Stop stops listening (the browsers' streams end with it)
func (s *Server) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.srv != nil {
		_ = s.srv.Close()
		s.srv = nil
	}
	s.err = nil
}

// guard lets through browsers on private networks that are signed in, and shows the others the sign-in page
func (s *Server) guard() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		local, _ := r.Context().Value(http.LocalAddrContextKey).(net.Addr)
		if !allowedClient(r.RemoteAddr, local) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		switch r.URL.Path {
		case "/remote/login":
			s.serveLogin(w, r)
			return
		case "/remote/logout":
			s.endSession(w, r)
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		case "/manifest.webmanifest", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png":
			s.handler.ServeHTTP(w, r) // fetched by the browser without the cookie when adding to the home screen
			return
		}
		if !s.signedIn(r) {
			if r.URL.Path == "/" || r.URL.Path == "/index.html" {
				loginPage(w, r, "")
			} else {
				http.Error(w, "sign in first", http.StatusUnauthorized)
			}
			return
		}
		s.handler.ServeHTTP(w, r)
	})
}

func hashToken(t string) string {
	h := sha256.Sum256([]byte(t))
	return hex.EncodeToString(h[:])
}

func (s *Server) signedIn(r *http.Request) bool {
	c, err := r.Cookie(sessionCookie)
	if err != nil || c.Value == "" {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	until, ok := s.cfg.Sessions[hashToken(c.Value)]
	return ok && until > time.Now().UnixMilli()
}

func (s *Server) endSession(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		s.mu.Lock()
		delete(s.cfg.Sessions, hashToken(c.Value))
		s.save()
		s.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1})
}

func (s *Server) serveLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	s.mu.Lock()
	f := s.fails[host]
	waiting := f != nil && time.Now().Before(f.until)
	salt, hash := s.cfg.Salt, s.cfg.Hash
	s.mu.Unlock()
	if waiting {
		loginPage(w, r, "wait")
		return
	}
	pw := r.PostFormValue("password")
	got, err := pbkdf2.Key(sha256.New, pw, salt, hashRounds, 32)
	if err != nil || len(hash) == 0 || subtle.ConstantTimeCompare(got, hash) != 1 {
		s.mu.Lock()
		if f = s.fails[host]; f == nil {
			f = &failCount{}
			s.fails[host] = f
		}
		if f.n++; f.n >= failsAllowed {
			f.n, f.until = 0, time.Now().Add(failWait)
		}
		s.mu.Unlock()
		log.Printf("[remote] wrong password from %s", host)
		loginPage(w, r, "wrong")
		return
	}
	token := make([]byte, 32)
	_, _ = rand.Read(token)
	t := hex.EncodeToString(token)
	s.mu.Lock()
	delete(s.fails, host)
	s.cfg.Sessions[hashToken(t)] = time.Now().Add(sessionTime).UnixMilli()
	s.save()
	s.mu.Unlock()
	log.Printf("[remote] signed in from %s", host)
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: t, Path: "/", MaxAge: int(sessionTime / time.Second), HttpOnly: true, SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

// ---------------------------------------------------------------- Networks

// private are the networks a browser may connect from: this machine, home networks, and the 100.64.0.0/10 range
// mesh VPNs give their devices (see allowedClient)
var private = []netip.Prefix{
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("fc00::/7"),
	netip.MustParsePrefix("fe80::/10"),
}

// meshRange is the range mesh VPNs (NordVPN Meshnet, Tailscale) give their devices. Internet providers use it too
// (carrier-grade NAT), so a browser from it is let in only when this machine has an address in it as well: the
// connection came through the VPN, not through a port opened on a router whose other side is the provider's network
var meshRange = netip.MustParsePrefix("100.64.0.0/10")

// allowedClient reports whether a browser at remoteAddr may connect through the local address it reached
func allowedClient(remoteAddr string, local net.Addr) bool {
	if !privateClient(remoteAddr) {
		return false
	}
	ap, _ := netip.ParseAddrPort(remoteAddr)
	if !meshRange.Contains(ap.Addr().Unmap()) {
		return true
	}
	if local == nil {
		return false
	}
	lp, err := netip.ParseAddrPort(local.String())
	return err == nil && meshRange.Contains(lp.Addr().Unmap())
}

func privateClient(remoteAddr string) bool {
	ap, err := netip.ParseAddrPort(remoteAddr)
	if err != nil {
		return false
	}
	ip := ap.Addr().Unmap()
	for _, p := range private {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}

// localIPs are this machine's IPv4 addresses a browser on another device can use
func localIPs() []string {
	var out []string
	ifs, _ := net.Interfaces()
	for _, ifc := range ifs {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			if n, ok := a.(*net.IPNet); ok && n.IP.To4() != nil {
				out = append(out, n.IP.String())
			}
		}
	}
	return out
}

// ---------------------------------------------------------------- Sign-in page

// loginPage is the page a browser not signed in sees (in Japanese when the browser prefers it). problem is "wrong"
// after a wrong password and "wait" while the address has to wait
func loginPage(w http.ResponseWriter, r *http.Request, problem string) {
	ja := strings.HasPrefix(strings.ToLower(r.Header.Get("Accept-Language")), "ja")
	text := map[string][2]string{
		"title":  {"Poruneko", "Poruneko"},
		"lead":   {"Enter the password set in the app's settings (Remote access).", "アプリの設定（リモートアクセス）で決めたパスワードを入力してください。"},
		"button": {"Sign in", "ログイン"},
		"wrong":  {"The password is wrong.", "パスワードが違います。"},
		"wait":   {"Too many wrong passwords. Try again in a minute.", "パスワードの間違いが続いたため、1 分後にもう一度試してください。"},
	}
	tr := func(k string) string {
		if ja {
			return html.EscapeString(text[k][1])
		}
		return html.EscapeString(text[k][0])
	}
	msg := ""
	if problem != "" {
		msg = `<p class="err">` + tr(problem) + `</p>`
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if problem != "" {
		w.WriteHeader(http.StatusUnauthorized)
	}
	fmt.Fprintf(w, `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#0f1115">
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>%s</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1115;color:#e6e8ee;font-family:system-ui,sans-serif}
form{width:min(340px,calc(100%% - 32px));display:flex;flex-direction:column;gap:12px}
h1{margin:0 0 4px;font-size:22px}p{margin:0;color:#a3a9b8;line-height:1.5}.err{color:#ff5d5d}
input{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid #2a3040;background:#1b1f2a;color:inherit}
button{font:inherit;font-weight:600;padding:10px;border:0;border-radius:10px;background:#ff6b8b;color:#fff}
</style></head><body>
<form method="post" action="/remote/login">
<h1>%s</h1><p>%s</p>%s
<input type="password" name="password" autocomplete="current-password" autofocus required>
<button type="submit">%s</button>
</form></body></html>`, tr("title"), tr("title"), tr("lead"), msg, tr("button"))
}
