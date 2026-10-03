//go:build wasip1

// Package pluginsdk is the plugin side of the Poruneko plugin interface (see internal/plugin).
// A plugin calls Serve with its handler in init and is built with
//
//	GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -o myplugin.wasm .
//
// The handler gets the method name and its JSON parameters, and returns the result (encoded as JSON) or an error.
// Returning an *Error keeps its code; other errors become code "plugin.error".
package pluginsdk

import (
	"encoding/json"
	"errors"
	"unsafe"
)

// Handler handles one call
type Handler func(method string, params json.RawMessage) (any, error)

// Error is an error with a code the app can show
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

var handler Handler

// Serve sets the handler (call it from init)
func Serve(h Handler) { handler = h }

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
		Method string          `json:"method"`
		Params json.RawMessage `json:"params"`
	}
	var out []byte
	if err := json.Unmarshal(req, &r); err != nil {
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

//go:wasmimport poruneko take
func hostTake(ptr uint32)

//go:wasmimport poruneko log
func hostLog(ptr, size uint32)

// Request is an HTTP GET for the host to make (only to the hosts in the plugin's info)
type Request struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
}

// Response is the host's answer to a Request
type Response struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    []byte            `json:"body,omitempty"`
	Error   string            `json:"error,omitempty"`
}

// HTTPError is a failed fetch (Status is 0 when there was no HTTP response)
type HTTPError struct {
	Status  int
	Message string
}

func (e *HTTPError) Error() string { return e.Message }

// Fetch makes an HTTP GET through the host
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
		return &res, &HTTPError{Status: res.Status, Message: res.Error}
	}
	return &res, nil
}

// Log writes a line to the app's log
func Log(msg string) {
	if msg == "" {
		return
	}
	b := []byte(msg)
	hostLog(uint32(uintptr(unsafe.Pointer(&b[0]))), uint32(len(b)))
}
