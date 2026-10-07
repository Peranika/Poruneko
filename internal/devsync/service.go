package devsync

import (
	"bytes"
	"context"
	"crypto/hmac"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"poruneko/internal/model"
)

// Port is where devices listen for syncs (TCP) and for devices looking for them (UDP). If the TCP port is taken
// another one is used, which the UDP answer tells
const Port = 47391

const (
	pairingTime  = 5 * time.Minute // how long a pairing code works
	pairingTries = 5               // wrong codes before the pairing is cancelled
	maxClockSkew = 15 * time.Minute
)

// Peer is a device paired with this one
type Peer struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Secret []byte `json:"secret"`
	// Addr is where it was last reached (host:port)
	Addr      string `json:"addr,omitempty"`
	LastSync  int64  `json:"lastSync,omitempty"`
	LastError string `json:"lastError,omitempty"`
}

type config struct {
	DeviceID   string `json:"deviceId"`
	DeviceName string `json:"deviceName"`
	Peers      []Peer `json:"peers"`
}

type pairing struct {
	code  string
	until time.Time
	tries int
}

// Service pairs this device with others and syncs with them. State gives this device's shared data; Apply merges
// another device's into it and keeps the result; OnChange is told when the peers or their sync results change
type Service struct {
	State    func() model.SyncState
	Apply    func(remote model.SyncState) error
	OnChange func()

	path    string
	mu      sync.Mutex
	cfg     config
	pairing *pairing
	port    int    // the TCP port listened on (0 while not listening)
	bind    string // the address listened on ("": every network; tests use 127.0.0.1)
	srv     *http.Server
	udp     *net.UDPConn

	applyMu sync.Mutex // one merge at a time (as the one asking and as the one asked)
	syncMu  sync.Mutex // one SyncNow at a time
	syncing atomic.Bool
}

// New loads the paired devices from the data folder and starts listening if there are any
func New(dataDir string, state func() model.SyncState, apply func(model.SyncState) error, onChange func()) *Service {
	s := &Service{State: state, Apply: apply, OnChange: onChange, path: filepath.Join(dataDir, "sync.json")}
	if b, err := os.ReadFile(s.path); err == nil {
		if err := json.Unmarshal(b, &s.cfg); err != nil {
			log.Printf("[sync] %s: %v", s.path, err)
		}
	}
	if s.cfg.DeviceID == "" {
		s.cfg.DeviceID = fmt.Sprintf("%x", randomBytes(12))
		if s.cfg.DeviceName == "" {
			s.cfg.DeviceName = defaultName()
		}
		s.save()
	}
	if len(s.cfg.Peers) > 0 {
		s.listen()
	}
	return s
}

// defaultName is this device's name until the user gives one (the Android app sets PORUNEKO_DEVICE_NAME to the model)
func defaultName() string {
	if n := os.Getenv("PORUNEKO_DEVICE_NAME"); n != "" {
		return n
	}
	if n, err := os.Hostname(); err == nil && n != "" && n != "localhost" {
		return n
	}
	return "Poruneko"
}

// save writes the config (call with mu held, or before the service is shared)
func (s *Service) save() {
	b, err := json.MarshalIndent(s.cfg, "", " ")
	if err != nil {
		return
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err == nil {
		err = os.Rename(tmp, s.path)
		if err != nil {
			log.Printf("[sync] save: %v", err)
		}
	}
}

func (s *Service) changed() {
	if s.OnChange != nil {
		s.OnChange()
	}
}

// ---------------------------------------------------------------- Status

// PeerStatus is a paired device as the settings show it
type PeerStatus struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	LastSync  int64  `json:"lastSync"`
	LastError string `json:"lastError"`
}

// PairingStatus is the code this device shows while waiting to be paired, and where it can be reached
type PairingStatus struct {
	Code  string   `json:"code"`
	Until int64    `json:"until"`
	Addrs []string `json:"addrs"`
}

type Status struct {
	DeviceName string         `json:"deviceName"`
	Peers      []PeerStatus   `json:"peers"`
	Pairing    *PairingStatus `json:"pairing"`
	Syncing    bool           `json:"syncing"`
}

func (s *Service) Status() Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := Status{DeviceName: s.cfg.DeviceName, Peers: []PeerStatus{}, Syncing: s.syncing.Load()}
	for _, p := range s.cfg.Peers {
		st.Peers = append(st.Peers, PeerStatus{p.ID, p.Name, p.LastSync, p.LastError})
	}
	if p := s.activePairing(); p != nil {
		st.Pairing = &PairingStatus{Code: p.code, Until: p.until.UnixMilli(), Addrs: localAddrs(s.port)}
	}
	return st
}

func (s *Service) SetDeviceName(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if name == "" {
		name = defaultName()
	}
	s.cfg.DeviceName = name
	s.save()
}

// RemovePeer forgets a paired device (it can no longer sync with this one)
func (s *Service) RemovePeer(id string) {
	s.mu.Lock()
	s.cfg.Peers = slices.DeleteFunc(s.cfg.Peers, func(p Peer) bool { return p.ID == id })
	s.save()
	s.mu.Unlock()
	s.changed()
}

// activePairing is the pairing in progress (call with mu held)
func (s *Service) activePairing() *pairing {
	if s.pairing != nil && time.Now().After(s.pairing.until) {
		s.pairing = nil
	}
	return s.pairing
}

// ---------------------------------------------------------------- Listening

// StartPairing makes a code for another device to pair with this one, and listens until it is used or expires
func (s *Service) StartPairing() (PairingStatus, error) {
	if err := s.listen(); err != nil {
		return PairingStatus{}, err
	}
	s.mu.Lock()
	s.pairing = &pairing{code: newCode(), until: time.Now().Add(pairingTime)}
	st := PairingStatus{Code: s.pairing.code, Until: s.pairing.until.UnixMilli(), Addrs: localAddrs(s.port)}
	s.mu.Unlock()
	s.changed()
	return st, nil
}

func (s *Service) StopPairing() {
	s.mu.Lock()
	s.pairing = nil
	s.mu.Unlock()
	s.changed()
}

// listen starts the sync server and the answers to devices looking for this one (once)
func (s *Service) listen() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.port != 0 {
		return nil
	}
	ln, err := net.Listen("tcp", net.JoinHostPort(s.bind, strconv.Itoa(Port)))
	if err != nil {
		if ln, err = net.Listen("tcp", net.JoinHostPort(s.bind, "0")); err != nil {
			return err
		}
	}
	s.port = ln.Addr().(*net.TCPAddr).Port
	mux := http.NewServeMux()
	mux.HandleFunc("GET /poruneko-sync/hello", s.serveHello)
	mux.HandleFunc("POST /poruneko-sync/pair", s.servePair)
	mux.HandleFunc("POST /poruneko-sync/sync", s.serveSync)
	s.srv = &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := s.srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("[sync] server: %v", err)
		}
	}()
	if udp, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.ParseIP(s.bind), Port: Port}); err == nil {
		s.udp = udp
		go s.answerLookups(udp)
	} else {
		log.Printf("[sync] not answering lookups: %v", err)
	}
	log.Printf("[sync] listening on port %d", s.port)
	return nil
}

// Close stops listening
func (s *Service) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.srv != nil {
		_ = s.srv.Close()
	}
	if s.udp != nil {
		_ = s.udp.Close()
	}
}

// lookup is what a device looking for others broadcasts, and the answer
type lookup struct {
	T       string `json:"t"` // "poruneko-sync"
	From    string `json:"from,omitempty"`
	ID      string `json:"id,omitempty"`
	Name    string `json:"name,omitempty"`
	Port    int    `json:"port,omitempty"`
	Pairing bool   `json:"pairing,omitempty"`
}

const lookupTag = "poruneko-sync"

// answerLookups answers devices looking for this one: paired ones, or any while a pairing is in progress
func (s *Service) answerLookups(c *net.UDPConn) {
	buf := make([]byte, 2048)
	for {
		n, from, err := c.ReadFromUDP(buf)
		if err != nil {
			return
		}
		var q lookup
		if json.Unmarshal(buf[:n], &q) != nil || q.T != lookupTag || q.From == "" || q.ID != "" {
			continue
		}
		s.mu.Lock()
		pairingNow := s.activePairing() != nil
		known := slices.ContainsFunc(s.cfg.Peers, func(p Peer) bool { return p.ID == q.From })
		a := lookup{T: lookupTag, ID: s.cfg.DeviceID, Name: s.cfg.DeviceName, Port: s.port, Pairing: pairingNow}
		s.mu.Unlock()
		if q.From == a.ID || (!pairingNow && !known) {
			continue
		}
		b, _ := json.Marshal(a)
		_, _ = c.WriteToUDP(b, from)
	}
}

// ---------------------------------------------------------------- Finding devices

// Found is a device found on the network
type Found struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Addr    string `json:"addr"`
	Pairing bool   `json:"pairing"`
}

// Find looks for devices on the network for a while: the ones waiting to be paired, and paired ones
func (s *Service) Find(wait time.Duration) []Found {
	c, err := net.ListenUDP("udp4", &net.UDPAddr{})
	if err != nil {
		log.Printf("[sync] find: %v", err)
		return nil
	}
	defer c.Close()
	s.mu.Lock()
	q, _ := json.Marshal(lookup{T: lookupTag, From: s.cfg.DeviceID})
	targets := []net.IP{net.IPv4bcast}
	for _, p := range s.cfg.Peers {
		if host, _, err := net.SplitHostPort(p.Addr); err == nil {
			if ip := net.ParseIP(host); ip != nil {
				targets = append(targets, ip)
			}
		}
	}
	s.mu.Unlock()
	targets = append(targets, broadcastAddrs()...)
	for _, ip := range targets {
		_, _ = c.WriteToUDP(q, &net.UDPAddr{IP: ip, Port: Port})
	}

	var out []Found
	_ = c.SetReadDeadline(time.Now().Add(wait))
	buf := make([]byte, 2048)
	for {
		n, from, err := c.ReadFromUDP(buf)
		if err != nil {
			break
		}
		var a lookup
		if json.Unmarshal(buf[:n], &a) != nil || a.T != lookupTag || a.ID == "" || a.Port == 0 {
			continue
		}
		if slices.ContainsFunc(out, func(f Found) bool { return f.ID == a.ID }) {
			continue
		}
		out = append(out, Found{ID: a.ID, Name: a.Name, Addr: net.JoinHostPort(from.IP.String(), strconv.Itoa(a.Port)), Pairing: a.Pairing})
	}
	return out
}

// broadcastAddrs are the broadcast addresses of this device's IPv4 networks
func broadcastAddrs() []net.IP {
	var out []net.IP
	for _, n := range localNets() {
		ip := n.IP.To4()
		b := make(net.IP, 4)
		for i := range b {
			b[i] = ip[i] | ^n.Mask[i]
		}
		out = append(out, b)
	}
	return out
}

// localNets are this device's IPv4 networks (not loopback). Where the networks cannot be listed (Android does not
// let apps read them) it is the address used to reach the internet, taken as a /24 like most home networks
func localNets() []*net.IPNet {
	out := listedNets()
	if len(out) == 0 {
		if c, err := net.Dial("udp4", "192.0.2.1:9"); err == nil { // nothing is sent: it only picks the route
			if a, ok := c.LocalAddr().(*net.UDPAddr); ok && !a.IP.IsLoopback() {
				out = append(out, &net.IPNet{IP: a.IP.To4(), Mask: net.CIDRMask(24, 32)})
			}
			c.Close()
		}
	}
	return out
}

func listedNets() []*net.IPNet {
	var out []*net.IPNet
	ifs, _ := net.Interfaces()
	for _, ifc := range ifs {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			if n, ok := a.(*net.IPNet); ok && n.IP.To4() != nil && len(n.Mask) == net.IPv4len {
				out = append(out, n)
			}
		}
	}
	return out
}

// localAddrs are the addresses another device can type to reach this one
func localAddrs(port int) []string {
	out := []string{}
	for _, n := range localNets() {
		out = append(out, net.JoinHostPort(n.IP.String(), strconv.Itoa(port)))
	}
	return out
}

// ---------------------------------------------------------------- Pairing

type hello struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Pairing bool   `json:"pairing"`
}

type pairRequest struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Nonce []byte `json:"nonce"`
	Proof []byte `json:"proof"`
}

type pairAnswer struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Secret []byte `json:"secret"` // sealed with the pairing key
	Proof  []byte `json:"proof"`
}

func (s *Service) serveHello(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	h := hello{ID: s.cfg.DeviceID, Name: s.cfg.DeviceName, Pairing: s.activePairing() != nil}
	s.mu.Unlock()
	writeJSON(w, h)
}

func (s *Service) servePair(w http.ResponseWriter, r *http.Request) {
	var q pairRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&q); err != nil || q.ID == "" || len(q.Nonce) < 16 {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	p := s.activePairing()
	if p == nil {
		s.mu.Unlock()
		http.Error(w, "not pairing", http.StatusConflict)
		return
	}
	code, hostID, hostName := p.code, s.cfg.DeviceID, s.cfg.DeviceName
	s.mu.Unlock()

	key, err := pairKey(code, hostID, q.ID, q.Nonce)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !hmac.Equal(q.Proof, proof(key, "client", q.ID)) {
		s.mu.Lock()
		if p := s.activePairing(); p != nil {
			if p.tries++; p.tries >= pairingTries {
				s.pairing = nil
			}
		}
		s.mu.Unlock()
		s.changed()
		http.Error(w, "wrong code", http.StatusForbidden)
		return
	}
	secret := randomBytes(32)
	box, err := seal(key, secret)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.addPeer(Peer{ID: q.ID, Name: q.Name, Secret: secret})
	s.mu.Lock()
	s.pairing = nil
	s.mu.Unlock()
	log.Printf("[sync] paired with %s (%s)", q.Name, q.ID)
	s.changed()
	writeJSON(w, pairAnswer{ID: hostID, Name: hostName, Secret: box, Proof: proof(key, "host", hostID)})
}

// addPeer keeps a paired device (pairing again replaces it)
func (s *Service) addPeer(p Peer) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cfg.Peers = slices.DeleteFunc(s.cfg.Peers, func(x Peer) bool { return x.ID == p.ID })
	s.cfg.Peers = append(s.cfg.Peers, p)
	s.save()
}

// ErrWrongCode is a pairing with a code that the other device did not show
var ErrWrongCode = errors.New("wrong pairing code")

// ErrNotPairing is a pairing with a device that shows no code
var ErrNotPairing = errors.New("the device is not waiting to be paired")

// Pair pairs with the device at addr (host:port) that shows code, and syncs with it
func (s *Service) Pair(ctx context.Context, addr, code string) (Peer, error) {
	if _, _, err := net.SplitHostPort(addr); err != nil {
		addr = net.JoinHostPort(addr, strconv.Itoa(Port))
	}
	var h hello
	if err := getJSON(ctx, "http://"+addr+"/poruneko-sync/hello", &h); err != nil {
		return Peer{}, err
	}
	if !h.Pairing {
		return Peer{}, ErrNotPairing
	}
	s.mu.Lock()
	me, myName := s.cfg.DeviceID, s.cfg.DeviceName
	s.mu.Unlock()
	nonce := randomBytes(16)
	key, err := pairKey(code, h.ID, me, nonce)
	if err != nil {
		return Peer{}, err
	}
	body, _ := json.Marshal(pairRequest{ID: me, Name: myName, Nonce: nonce, Proof: proof(key, "client", me)})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+addr+"/poruneko-sync/pair", bytes.NewReader(body))
	res, err := httpClient.Do(req)
	if err != nil {
		return Peer{}, err
	}
	defer res.Body.Close()
	switch res.StatusCode {
	case http.StatusOK:
	case http.StatusForbidden:
		return Peer{}, ErrWrongCode
	case http.StatusConflict:
		return Peer{}, ErrNotPairing
	default:
		return Peer{}, fmt.Errorf("pairing failed: %s", res.Status)
	}
	var a pairAnswer
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<16)).Decode(&a); err != nil {
		return Peer{}, err
	}
	if a.ID != h.ID || !hmac.Equal(a.Proof, proof(key, "host", a.ID)) {
		return Peer{}, errors.New("the other device's answer could not be verified")
	}
	secret, err := open(key, a.Secret)
	if err != nil {
		return Peer{}, err
	}
	p := Peer{ID: a.ID, Name: a.Name, Secret: secret, Addr: addr}
	s.addPeer(p)
	if err := s.listen(); err != nil {
		log.Printf("[sync] listen: %v", err)
	}
	log.Printf("[sync] paired with %s (%s)", a.Name, a.ID)
	s.changed()
	return p, nil
}

// ---------------------------------------------------------------- Syncing

// envelope is a synced state with the time it was sent (an old one replayed is refused)
type envelope struct {
	Time  int64           `json:"time"`
	State model.SyncState `json:"state"`
}

const fromHeader = "X-Poruneko-Device"

func (s *Service) peer(id string) (Peer, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	i := slices.IndexFunc(s.cfg.Peers, func(p Peer) bool { return p.ID == id })
	if i < 0 {
		return Peer{}, false
	}
	return s.cfg.Peers[i], true
}

// recordSync keeps how syncing with a peer went
func (s *Service) recordSync(id, addr string, err error) {
	s.mu.Lock()
	for i := range s.cfg.Peers {
		p := &s.cfg.Peers[i]
		if p.ID != id {
			continue
		}
		if err != nil {
			p.LastError = err.Error()
		} else {
			p.LastError, p.LastSync = "", time.Now().UnixMilli()
			if addr != "" {
				p.Addr = addr
			}
		}
	}
	s.save()
	s.mu.Unlock()
	s.changed()
}

func (s *Service) pack(p Peer, st model.SyncState) ([]byte, error) {
	key, err := syncKey(p.Secret)
	if err != nil {
		return nil, err
	}
	b, err := json.Marshal(envelope{Time: time.Now().UnixMilli(), State: st})
	if err != nil {
		return nil, err
	}
	return seal(key, gzipBytes(b))
}

func (s *Service) unpack(p Peer, box []byte) (model.SyncState, error) {
	key, err := syncKey(p.Secret)
	if err != nil {
		return model.SyncState{}, err
	}
	z, err := open(key, box)
	if err != nil {
		return model.SyncState{}, err
	}
	b, err := gunzipBytes(z)
	if err != nil {
		return model.SyncState{}, err
	}
	var e envelope
	if err := json.Unmarshal(b, &e); err != nil {
		return model.SyncState{}, err
	}
	if d := time.Since(time.UnixMilli(e.Time)); d > maxClockSkew || d < -maxClockSkew {
		return model.SyncState{}, errors.New("the devices' clocks are too far apart")
	}
	return e.State, nil
}

// apply merges another device's state into this one's
func (s *Service) apply(st model.SyncState) error {
	s.applyMu.Lock()
	defer s.applyMu.Unlock()
	return s.Apply(st)
}

// serveSync takes a paired device's state, merges it and answers with the merged state
func (s *Service) serveSync(w http.ResponseWriter, r *http.Request) {
	p, ok := s.peer(r.Header.Get(fromHeader))
	if !ok {
		http.Error(w, "not paired", http.StatusForbidden)
		return
	}
	box, err := io.ReadAll(io.LimitReader(r.Body, maxState))
	if err != nil {
		return
	}
	in, err := s.unpack(p, box)
	if err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}
	s.applyMu.Lock()
	err = s.Apply(in)
	out := s.State()
	s.applyMu.Unlock()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	reply, err := s.pack(p, out)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.recordSync(p.ID, "", nil)
	w.Header().Set("Content-Type", "application/octet-stream")
	_, _ = w.Write(reply)
}

// SyncResult is how syncing with one device went
type SyncResult struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Error string `json:"error,omitempty"`
}

// ErrNotFound is a paired device not found on the network
var ErrNotFound = errors.New("the device was not found on the network")

// SyncNow syncs with every paired device that can be found on the network
func (s *Service) SyncNow(ctx context.Context) []SyncResult {
	s.syncMu.Lock()
	defer s.syncMu.Unlock()
	s.mu.Lock()
	peers := slices.Clone(s.cfg.Peers)
	s.mu.Unlock()
	if len(peers) == 0 {
		return nil
	}
	s.syncing.Store(true)
	s.changed()
	defer func() {
		s.syncing.Store(false)
		s.changed()
	}()

	found := map[string]string{}
	for _, f := range s.Find(1500 * time.Millisecond) {
		found[f.ID] = f.Addr
	}
	var out []SyncResult
	for _, p := range peers {
		addr := found[p.ID]
		if addr == "" {
			addr = p.Addr // a network where lookups do not reach (the last address may still work)
		}
		var err error
		if addr == "" {
			err = ErrNotFound
		} else {
			err = s.syncWith(ctx, p, addr)
		}
		// an unreachable device is not an error to remember: it is just away
		if err != nil && !isUnreachable(err) {
			s.recordSync(p.ID, addr, err)
		} else if err == nil {
			s.recordSync(p.ID, addr, nil)
		}
		r := SyncResult{ID: p.ID, Name: p.Name}
		if err != nil {
			r.Error = err.Error()
			log.Printf("[sync] %s: %v", p.Name, err)
		}
		out = append(out, r)
	}
	return out
}

func isUnreachable(err error) bool {
	var ne net.Error
	return errors.Is(err, ErrNotFound) || errors.As(err, &ne) || errors.Is(err, context.DeadlineExceeded)
}

func (s *Service) syncWith(ctx context.Context, p Peer, addr string) error {
	box, err := s.pack(p, s.State())
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+addr+"/poruneko-sync/sync", bytes.NewReader(box))
	s.mu.Lock()
	req.Header.Set(fromHeader, s.cfg.DeviceID)
	s.mu.Unlock()
	res, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("%s: %s", res.Status, bytes.TrimSpace(msg))
	}
	reply, err := io.ReadAll(io.LimitReader(res.Body, maxState))
	if err != nil {
		return err
	}
	st, err := s.unpack(p, reply)
	if err != nil {
		return err
	}
	return s.apply(st)
}

// ---------------------------------------------------------------- HTTP

var httpClient = &http.Client{Transport: &http.Transport{Proxy: nil, DialContext: (&net.Dialer{Timeout: 5 * time.Second}).DialContext}}

func getJSON(ctx context.Context, url string, out any) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	res, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s", res.Status)
	}
	return json.NewDecoder(io.LimitReader(res.Body, 1<<16)).Decode(out)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
