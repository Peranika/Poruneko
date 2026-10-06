//go:build wasip1

// Package pluginsdk is the plugin side of the Poruneko plugin interface (see internal/plugin).
// A plugin calls Serve with its handler in init and is built with
//
//	GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -o myplugin.wasm .
//
// The handler gets the method name and its JSON parameters, and returns the result (encoded as JSON) or an error.
// Returning an *Error keeps its code; other errors become code "plugin.error". The plugin's settings (the values the
// user chose for its filters and settings) come with every call; read them with Setting.
package pluginsdk

import (
	"encoding/json"
	"errors"
	"time"
	"unsafe"
)

// Handler handles one call
type Handler func(method string, params json.RawMessage) (any, error)

// Error is an error with a code the app can show. Message is English for the log; Text, if given, is what the
// screen shows in each UI language ({"ja": ..., "en": ...})
type Error struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Text    map[string]string `json:"text,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

var (
	handler  Handler
	settings map[string]string
)

// Serve sets the handler (call it from init)
func Serve(h Handler) { handler = h }

// Setting is the value of one of the plugin's settings during a call ("" when the user has not chosen one)
func Setting(id string) string { return settings[id] }

// buffers handed to the host stay referenced here until the host frees them
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
	}
	err := json.Unmarshal(req, &r)
	settings = r.Settings
	var out []byte
	if err != nil {
		out = errorJSON(&Error{Code: "plugin.badRequest", Message: err.Error()})
	} else if handler == nil {
		out = errorJSON(&Error{Code: "plugin.noHandler", Message: "Serve was not called"})
	} else if res, err := handler(r.Method, r.Params); err != nil {
		var e *Error
		if !errors.As(err, &e) {
			e = &Error{Code: "plugin.error", Message: err.Error()}
		}
		out = errorJSON(e)
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

// ---------------------------------------------------------------- calls to the host

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

// Request is an HTTP GET (or POST) for the host to make (only to the hosts in the plugin's info)
type Request struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
	// Method is "" (GET) or "POST"; Body is sent with a POST
	Method string `json:"method,omitempty"`
	Body   []byte `json:"body,omitempty"`
	// NoRetry: the app does not retry a failure (for a site that counts every request against a limit)
	NoRetry bool `json:"noRetry,omitempty"`
}

// Response is the host's answer to a Request
type Response struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    []byte            `json:"body,omitempty"`
	Error   string            `json:"error,omitempty"`
}

// HTTPError is a failed fetch (Status is 0 when there was no HTTP response). The Response that comes with it has the
// start of the site's error response and its headers, if any
type HTTPError struct {
	Status  int
	Message string
	Body    []byte
}

func (e *HTTPError) Error() string { return e.Message }

// Fetch makes an HTTP GET (or POST) through the host
func Fetch(req Request) (*Response, error) {
	b, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	n := hostFetch(uint32(uintptr(unsafe.Pointer(&b[0]))), uint32(len(b)))
	out := make([]byte, n)
	if n > 0 {
		hostTake(uint32(uintptr(unsafe.Pointer(&out[0]))))
	}
	var res Response
	if err := json.Unmarshal(out, &res); err != nil {
		return nil, err
	}
	if res.Error != "" {
		return &res, &HTTPError{Status: res.Status, Message: res.Error, Body: res.Body}
	}
	return &res, nil
}

// FetchMany makes several HTTP GETs through the host, which runs them in parallel. Each response has its own
// Error ("" when it succeeded)
func FetchMany(reqs []Request) ([]Response, error) {
	if len(reqs) == 0 {
		return nil, nil
	}
	b, err := json.Marshal(reqs)
	if err != nil {
		return nil, err
	}
	n := hostFetchMany(uint32(uintptr(unsafe.Pointer(&b[0]))), uint32(len(b)))
	out := make([]byte, n)
	if n > 0 {
		hostTake(uint32(uintptr(unsafe.Pointer(&out[0]))))
	}
	var res []Response
	if err := json.Unmarshal(out, &res); err != nil {
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
	hostLog(uint32(uintptr(unsafe.Pointer(&b[0]))), uint32(len(b)))
}

// StoreSet keeps a value under a key for all instances of the plugin (each instance has its own globals). The app
// keeps it in memory only: entries expire after a while and the oldest go when there are many
func StoreSet(key string, value []byte) {
	if key == "" || len(value) == 0 {
		return
	}
	k := []byte(key)
	hostStoreSet(uint32(uintptr(unsafe.Pointer(&k[0]))), uint32(len(k)), uint32(uintptr(unsafe.Pointer(&value[0]))), uint32(len(value)))
}

// StoreGet is the value kept under a key by any instance of the plugin (false if there is none)
func StoreGet(key string) ([]byte, bool) {
	if key == "" {
		return nil, false
	}
	k := []byte(key)
	n := hostStoreGet(uint32(uintptr(unsafe.Pointer(&k[0]))), uint32(len(k)))
	if n == 0 {
		return nil, false
	}
	out := make([]byte, n)
	hostTake(uint32(uintptr(unsafe.Pointer(&out[0]))))
	return out, true
}

// UserError is an error with the text the screen shows in each UI language (code and message go to the log)
func UserError(code, message, ja, en string) error {
	return &Error{Code: code, Message: message, Text: map[string]string{"ja": ja, "en": en}}
}

// Cached is a value kept for all instances of the plugin under key (with StoreSet), made again with fetch when it is
// older than maxAge or not kept. A failed fetch keeps nothing
func Cached[T any](key string, maxAge time.Duration, fetch func() (T, error)) (T, error) {
	type entry struct {
		V  T
		At time.Time
	}
	if b, ok := StoreGet(key); ok {
		var e entry
		if json.Unmarshal(b, &e) == nil && time.Since(e.At) < maxAge {
			return e.V, nil
		}
	}
	v, err := fetch()
	if err != nil {
		return v, err
	}
	if b, err := json.Marshal(entry{V: v, At: time.Now()}); err == nil {
		StoreSet(key, b)
	}
	return v, nil
}
