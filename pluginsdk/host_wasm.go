//go:build wasip1

package pluginsdk

import (
	"encoding/json"
	"unsafe"
)

// The plugin's side of the WebAssembly interface: the exports the app calls and the app's functions the plugin
// calls (see the app's internal/plugin)

var handler Handler

// Run serves a site plugin (call it from init)
func Run(s Site) {
	Serve(func(method string, params json.RawMessage) (any, error) { return Handle(s, method, params) })
}

// Serve sets a handler of the calls (call it from init). Run serves a Site this way; a plugin answering calls of
// its own (the app's tests) can handle them itself
func Serve(h Handler) { handler = h }

// buffers handed to the app stay referenced here until the app frees them
var buffers = map[uint32][]byte{}

func keep(b []byte) uint32 {
	if len(b) == 0 {
		b = make([]byte, 1)
	}
	ptr := uint32(uintptr(unsafe.Pointer(&b[0])))
	buffers[ptr] = b
	return ptr
}

//go:wasmexport poruneko_alloc
func alloc(size uint32) uint32 { return keep(make([]byte, size)) }

//go:wasmexport poruneko_free
func free(ptr uint32) { delete(buffers, ptr) }

//go:wasmexport poruneko_call
func call(ptr, size uint32) uint64 {
	req := buffers[ptr][:size]
	var r struct {
		Method   string            `json:"method"`
		Params   json.RawMessage   `json:"params"`
		Settings map[string]string `json:"settings"`
		Lang     string            `json:"lang"`
	}
	err := json.Unmarshal(req, &r)
	SetCall(r.Settings, r.Lang)
	var out []byte
	if err != nil {
		out = errorJSON(&Error{Code: "plugin.badRequest", Message: err.Error()})
	} else if handler == nil {
		out = errorJSON(&Error{Code: "plugin.noHandler", Message: "Run was not called"})
	} else if res, err := handler(r.Method, r.Params); err != nil {
		out = errorJSON(errorOf(err))
	} else if b, err := json.Marshal(struct {
		Result any `json:"result"`
	}{res}); err != nil {
		out = errorJSON(&Error{Code: "plugin.badResult", Message: err.Error()})
	} else {
		out = b
	}
	return uint64(keep(out))<<32 | uint64(len(out))
}

func errorJSON(e *Error) []byte {
	b, _ := json.Marshal(struct {
		Error *Error `json:"error"`
	}{e})
	return b
}

//go:wasmimport poruneko http_fetch
func hostFetch(ptr, size uint32) uint32

//go:wasmimport poruneko http_fetch_many
func hostFetchMany(ptr, size uint32) uint32

//go:wasmimport poruneko take
func hostTake(ptr uint32)

//go:wasmimport poruneko log
func hostLog(ptr, size uint32)

//go:wasmimport poruneko store_set
func hostStoreSet(kptr, klen, vptr, vlen uint32)

//go:wasmimport poruneko store_get
func hostStoreGet(kptr, klen uint32) uint32

func ptrOf(b []byte) uint32 { return uint32(uintptr(unsafe.Pointer(&b[0]))) }

// taken is what the app kept for the plugin (n bytes), copied out
func taken(n uint32) []byte {
	out := make([]byte, n)
	if n > 0 {
		hostTake(ptrOf(out))
	}
	return out
}

// Fetch makes an HTTP GET (or POST) through the app
func Fetch(req Request) (*Response, error) {
	b, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	var res Response
	if err := json.Unmarshal(taken(hostFetch(ptrOf(b), uint32(len(b)))), &res); err != nil {
		return nil, err
	}
	if res.Error != "" {
		return &res, &HTTPError{Status: res.Status, Message: res.Error, Body: res.Body}
	}
	return &res, nil
}

// FetchMany makes several HTTP requests through the app, which runs them in parallel (up to 8 at a time). Each
// response has its own Error ("" when it succeeded)
func FetchMany(reqs []Request) ([]Response, error) {
	if len(reqs) == 0 {
		return nil, nil
	}
	b, err := json.Marshal(reqs)
	if err != nil {
		return nil, err
	}
	var res []Response
	if err := json.Unmarshal(taken(hostFetchMany(ptrOf(b), uint32(len(b)))), &res); err != nil {
		return nil, err
	}
	return res, nil
}

// Log writes a line to the app's log
func Log(msg string) {
	if msg == "" {
		return
	}
	b := []byte(msg)
	hostLog(ptrOf(b), uint32(len(b)))
}

// StoreSet keeps a value under a key for all instances of the plugin (each instance has its own globals). The app
// keeps it in memory only: entries expire after 12 hours and the oldest go past 20,000
func StoreSet(key string, value []byte) {
	if key == "" || len(value) == 0 {
		return
	}
	k := []byte(key)
	hostStoreSet(ptrOf(k), uint32(len(k)), ptrOf(value), uint32(len(value)))
}

// StoreGet is the value kept under a key by any instance of the plugin (false if there is none)
func StoreGet(key string) ([]byte, bool) {
	if key == "" {
		return nil, false
	}
	k := []byte(key)
	n := hostStoreGet(ptrOf(k), uint32(len(k)))
	if n == 0 {
		return nil, false
	}
	return taken(n), true
}
