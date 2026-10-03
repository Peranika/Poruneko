// Package plugin runs plugins: WebAssembly modules (.wasm) that add sites (and later archive formats) to the app.
//
// The interface between the app (host) and a plugin (guest), version 1:
//
// The guest is a WASI (preview 1) reactor module exporting
//
//	poruneko_alloc(size u32) u32          memory for the host to write a request into (kept until freed)
//	poruneko_free(ptr u32)                releases memory from poruneko_alloc or a call's result
//	poruneko_call(ptr u32, len u32) u64   handles one call: the JSON request at ptr, len; returns the JSON
//	                                      response as (ptr << 32 | len), which the host frees afterwards
//
// A request is {"method": "...", "params": {...}} and a response is {"result": ...} or
// {"error": {"code": "...", "message": "..."}}. Every plugin answers "info" (see Info).
//
// The host gives the guest these functions, in the import module "poruneko":
//
//	http_fetch(ptr u32, len u32) u32       fetches the JSON HTTPRequest at ptr, len; the JSON HTTPResponse is kept
//	                                       by the host and its length returned
//	http_fetch_many(ptr u32, len u32) u32  the same for a JSON array of requests, fetched in parallel; the kept
//	                                       answer is the array of responses in the same order
//	take(ptr u32)                          copies the kept response to ptr (the guest allocates that many bytes)
//	log(ptr u32, len u32)              writes a line to the app's log
//
// A guest has no file system or network of its own: it fetches only through http_fetch, and only from the hosts
// its info lists. Each instance runs one call at a time; the host keeps a few instances of each plugin.
package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"

	"poruneko/internal/netx"
)

// ABIVersion is the version of the interface above; plugins with another version are not loaded
const ABIVersion = 1

// Kinds of plugins
const (
	KindSite    = "site"    // adds a site (browse, works, pages)
	KindArchive = "archive" // reads more archive formats (not supported yet)
)

// Info describes a plugin (its answer to "info")
type Info struct {
	ABI     int    `json:"abi"`
	Kind    string `json:"kind"`
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version"`
	// Hosts the plugin may fetch from ("example.com" also allows its subdomains)
	Hosts []string `json:"hosts"`
	// Capabilities are optional methods the plugin answers ("listAny", "webURL", "tagNamesJa")
	Capabilities []string `json:"capabilities"`
}

// Has reports whether the plugin answers an optional method
func (i *Info) Has(capability string) bool {
	for _, c := range i.Capabilities {
		if c == capability {
			return true
		}
	}
	return false
}

// HTTPRequest is what a guest asks the host to fetch
type HTTPRequest struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
}

// HTTPResponse is the result of a fetch (the body is base64 in JSON)
type HTTPResponse struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    []byte            `json:"body,omitempty"`
	Error   string            `json:"error,omitempty"`
}

// Error is an error answered by a plugin
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

// maxInstances is how many calls of one plugin can run at the same time
const maxInstances = 4

// Plugin is a loaded plugin
type Plugin struct {
	Info Info
	Path string

	rt       wazero.Runtime
	compiled wazero.CompiledModule
	mu       sync.Mutex
	idle     []*instance
	count    int
	free     chan struct{} // a slot for one more call (maxInstances of them)
}

// instance is one running copy of a plugin
type instance struct {
	mod     api.Module
	alloc   api.Function
	freeFn  api.Function
	call    api.Function
	pending []byte // the last http_fetch response, until the guest takes it
}

var (
	runtimeOnce sync.Once
	runtime     wazero.Runtime
	runtimeErr  error
	// instances by module name, for the host functions
	byModule sync.Map // string -> *instance
	// the plugin owning each module (hosts it may fetch from)
	ownerOf sync.Map // string -> *Plugin
	// numbers the instances, for unique module names
	instanceSeq atomic.Int64
)

// sharedRuntime is the one WebAssembly runtime of the app, with compiled modules cached in cacheDir
func sharedRuntime(cacheDir string) (wazero.Runtime, error) {
	runtimeOnce.Do(func() {
		ctx := context.Background()
		cfg := wazero.NewRuntimeConfig()
		if cacheDir != "" {
			if cache, err := wazero.NewCompilationCacheWithDir(cacheDir); err == nil {
				cfg = cfg.WithCompilationCache(cache)
			}
		}
		rt := wazero.NewRuntimeWithConfig(ctx, cfg)
		wasi_snapshot_preview1.MustInstantiate(ctx, rt)
		_, err := rt.NewHostModuleBuilder("poruneko").
			NewFunctionBuilder().WithFunc(hostFetch).Export("http_fetch").
			NewFunctionBuilder().WithFunc(hostFetchMany).Export("http_fetch_many").
			NewFunctionBuilder().WithFunc(hostTake).Export("take").
			NewFunctionBuilder().WithFunc(hostLog).Export("log").
			Instantiate(ctx)
		runtime, runtimeErr = rt, err
	})
	return runtime, runtimeErr
}

// LoadDir loads every .wasm in dir (a missing dir is no error). Plugins that fail are logged and skipped
func LoadDir(dir, cacheDir string) []*Plugin {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []*Plugin
	for _, e := range entries {
		if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".wasm") {
			continue
		}
		p, err := Load(filepath.Join(dir, e.Name()), cacheDir)
		if err != nil {
			log.Printf("[plugin] %s: %v", e.Name(), err)
			continue
		}
		log.Printf("[plugin] loaded %s %s (%s, %s)", p.Info.ID, p.Info.Version, p.Info.Kind, e.Name())
		out = append(out, p)
	}
	return out
}

// Load compiles a plugin and asks for its info
func Load(path, cacheDir string) (*Plugin, error) {
	rt, err := sharedRuntime(cacheDir)
	if err != nil {
		return nil, err
	}
	code, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	compiled, err := rt.CompileModule(context.Background(), code)
	if err != nil {
		return nil, fmt.Errorf("compile: %w", err)
	}
	p := &Plugin{Path: path, rt: rt, compiled: compiled, free: make(chan struct{}, maxInstances)}
	for range maxInstances {
		p.free <- struct{}{}
	}
	if err := p.Call(context.Background(), "info", nil, &p.Info); err != nil {
		return nil, fmt.Errorf("info: %w", err)
	}
	switch {
	case p.Info.ABI != ABIVersion:
		return nil, fmt.Errorf("interface version %d is not supported (the app supports %d)", p.Info.ABI, ABIVersion)
	case p.Info.ID == "" || strings.ContainsAny(p.Info.ID, ":/ "):
		return nil, fmt.Errorf("invalid id %q", p.Info.ID)
	case p.Info.Kind != KindSite:
		return nil, fmt.Errorf("kind %q is not supported", p.Info.Kind)
	}
	return p, nil
}

// Call calls a method of the plugin: params is sent as JSON and the result is decoded into out (if not nil)
func (p *Plugin) Call(ctx context.Context, method string, params, out any) error {
	req, err := json.Marshal(struct {
		Method string `json:"method"`
		Params any    `json:"params,omitempty"`
	}{method, params})
	if err != nil {
		return err
	}
	select {
	case <-p.free:
	case <-ctx.Done():
		return ctx.Err()
	}
	defer func() { p.free <- struct{}{} }()
	inst, err := p.take()
	if err != nil {
		return err
	}
	res, err := inst.invoke(ctx, req)
	if err != nil {
		// a trapped instance cannot be trusted any more; start a fresh one next time
		inst.mod.Close(context.Background())
		byModule.Delete(inst.mod.Name())
		ownerOf.Delete(inst.mod.Name())
		p.mu.Lock()
		p.count--
		p.mu.Unlock()
		return fmt.Errorf("plugin %s: %s: %w", p.Info.ID, method, err)
	}
	p.put(inst)
	var resp struct {
		Result json.RawMessage `json:"result"`
		Error  *Error          `json:"error"`
	}
	if err := json.Unmarshal(res, &resp); err != nil {
		return fmt.Errorf("plugin %s: %s: bad response: %w", p.Info.ID, method, err)
	}
	if resp.Error != nil {
		return resp.Error
	}
	if out != nil && len(resp.Result) > 0 {
		return json.Unmarshal(resp.Result, out)
	}
	return nil
}

// take returns an idle instance or starts a new one
func (p *Plugin) take() (*instance, error) {
	p.mu.Lock()
	if n := len(p.idle); n > 0 {
		inst := p.idle[n-1]
		p.idle = p.idle[:n-1]
		p.mu.Unlock()
		return inst, nil
	}
	// module names must be unique in the runtime (the same file can be loaded again)
	name := fmt.Sprintf("%s#%d", filepath.Base(p.Path), instanceSeq.Add(1))
	p.count++
	p.mu.Unlock()
	cfg := wazero.NewModuleConfig().WithName(name).WithStartFunctions("_initialize").
		WithStderr(logWriter{name}).WithStdout(logWriter{name}).
		WithSysWalltime().WithSysNanotime().WithRandSource(randSource{})
	mod, err := p.rt.InstantiateModule(context.Background(), p.compiled, cfg)
	if err != nil {
		p.mu.Lock()
		p.count--
		p.mu.Unlock()
		return nil, fmt.Errorf("start: %w", err)
	}
	inst := &instance{mod: mod, alloc: mod.ExportedFunction("poruneko_alloc"), freeFn: mod.ExportedFunction("poruneko_free"), call: mod.ExportedFunction("poruneko_call")}
	if inst.alloc == nil || inst.freeFn == nil || inst.call == nil {
		mod.Close(context.Background())
		return nil, errors.New("missing poruneko_alloc / poruneko_free / poruneko_call")
	}
	byModule.Store(name, inst)
	ownerOf.Store(name, p)
	return inst, nil
}

func (p *Plugin) put(inst *instance) {
	p.mu.Lock()
	p.idle = append(p.idle, inst)
	p.mu.Unlock()
}

// invoke writes the request into the guest, runs poruneko_call and reads the response
func (inst *instance) invoke(ctx context.Context, req []byte) ([]byte, error) {
	r, err := inst.alloc.Call(ctx, uint64(len(req)))
	if err != nil {
		return nil, err
	}
	ptr := uint32(r[0])
	defer inst.freeFn.Call(context.Background(), uint64(ptr))
	if !inst.mod.Memory().Write(ptr, req) {
		return nil, errors.New("request out of memory range")
	}
	r, err = inst.call.Call(ctx, uint64(ptr), uint64(len(req)))
	if err != nil {
		return nil, err
	}
	resPtr, resLen := uint32(r[0]>>32), uint32(r[0])
	defer inst.freeFn.Call(context.Background(), uint64(resPtr))
	b, ok := inst.mod.Memory().Read(resPtr, resLen)
	if !ok {
		return nil, errors.New("response out of memory range")
	}
	return append([]byte(nil), b...), nil
}

// ---------------------------------------------------------------- host functions

// hostFetch fetches for the guest. Only http(s) URLs on the hosts in the plugin's info are allowed
func hostFetch(ctx context.Context, m api.Module, ptr, size uint32) uint32 {
	inst, _ := byModule.Load(m.Name())
	owner, _ := ownerOf.Load(m.Name())
	if inst == nil || owner == nil {
		return 0
	}
	in := inst.(*instance)
	var res HTTPResponse
	if b, ok := m.Memory().Read(ptr, size); !ok {
		res.Error = "request out of memory range"
	} else {
		var req HTTPRequest
		if err := json.Unmarshal(b, &req); err != nil {
			res.Error = "bad request: " + err.Error()
		} else if err := owner.(*Plugin).allowed(req.URL); err != nil {
			res.Error = err.Error()
		} else {
			fetch(ctx, &req, &res)
		}
	}
	in.pending, _ = json.Marshal(res)
	return uint32(len(in.pending))
}

// manyLimit is how many requests of one http_fetch_many run at the same time
const manyLimit = 8

// hostFetchMany fetches several requests in parallel (a guest waits for each fetch, so batching saves time)
func hostFetchMany(ctx context.Context, m api.Module, ptr, size uint32) uint32 {
	inst, _ := byModule.Load(m.Name())
	owner, _ := ownerOf.Load(m.Name())
	if inst == nil || owner == nil {
		return 0
	}
	var reqs []HTTPRequest
	b, ok := m.Memory().Read(ptr, size)
	if !ok || json.Unmarshal(b, &reqs) != nil {
		reqs = nil
	}
	out := make([]HTTPResponse, len(reqs))
	netx.ParallelEach(reqs, manyLimit, func(i int, req HTTPRequest) {
		if err := owner.(*Plugin).allowed(req.URL); err != nil {
			out[i].Error = err.Error()
			return
		}
		fetch(ctx, &req, &out[i])
	})
	in := inst.(*instance)
	in.pending, _ = json.Marshal(out)
	return uint32(len(in.pending))
}

func fetch(ctx context.Context, req *HTTPRequest, res *HTTPResponse) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	r, err := netx.Get(ctx, req.URL, &netx.Opts{Headers: req.Headers})
	if err != nil {
		var he *netx.HTTPError
		if errors.As(err, &he) {
			res.Status = he.Status
		}
		res.Error = err.Error()
		return
	}
	res.Status = 200
	res.Body = r.Body
	res.Headers = map[string]string{}
	for k, v := range r.Header {
		if len(v) > 0 {
			res.Headers[k] = v[0]
		}
	}
}

// allowed checks a URL against the hosts the plugin may fetch from
func (p *Plugin) allowed(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return fmt.Errorf("not an http(s) URL: %q", raw)
	}
	host := strings.ToLower(u.Hostname())
	for _, h := range p.Info.Hosts {
		h = strings.ToLower(h)
		if host == h || strings.HasSuffix(host, "."+h) {
			return nil
		}
	}
	return fmt.Errorf("host %q is not in the plugin's list", host)
}

func hostTake(_ context.Context, m api.Module, ptr uint32) {
	if inst, ok := byModule.Load(m.Name()); ok {
		in := inst.(*instance)
		m.Memory().Write(ptr, in.pending)
		in.pending = nil
	}
}

func hostLog(_ context.Context, m api.Module, ptr, size uint32) {
	if b, ok := m.Memory().Read(ptr, size); ok {
		log.Printf("[plugin %s] %s", m.Name(), b)
	}
}

// logWriter sends a guest's stdout / stderr to the log
type logWriter struct{ name string }

func (w logWriter) Write(b []byte) (int, error) {
	log.Printf("[plugin %s] %s", w.name, strings.TrimRight(string(b), "\n"))
	return len(b), nil
}

// randSource gives guests real randomness (crypto/rand through WASI random_get)
type randSource struct{}

func (randSource) Read(b []byte) (int, error) { return cryptoRead(b) }
