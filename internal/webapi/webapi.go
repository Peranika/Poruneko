// Package webapi serves the app's API over HTTP, where there is no Wails (Android): the frontend calls the methods
// of the App, receives its events, and the native app around the WebView answers what only it can do (dialogs,
// the browser...).
//
//	POST /api/call/<Method>   body: the arguments as a JSON array. Answer: {"result": ...} or {"error": ...}
//	                          (the error formatted by FormatError, as Wails' ErrorFormatter does)
//	GET  /api/events          the events as server-sent events: data: {"name": "...", "data": ...}
//	GET  /native/calls        the native app reads the calls for it, one JSON object per line:
//	                          {"id": n, "method": "...", "params": ...}
//	POST /native/reply        the native app's answer: {"id": n, "result": ..., "error": "..."}
package webapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
)

// ErrUnsupported is a native call the native app cannot do (its answer's error is "unsupported")
var ErrUnsupported = errors.New("not supported on this platform")

// Server serves the exported methods of a value
type Server struct {
	methods     map[string]reflect.Value
	formatError func(error) any
	done        chan struct{} // closed by Close: the streams end

	subMu sync.Mutex
	subs  map[chan []byte]struct{}

	nativeID      atomic.Int64
	nativeCalls   chan []byte // calls not read yet by the native app
	nativeMu      sync.Mutex
	nativePending map[int64]chan nativeReply
}

type nativeReply struct {
	Result json.RawMessage `json:"result"`
	Error  string          `json:"error"`
}

var errorType = reflect.TypeFor[error]()

// New serves the exported methods of target. formatError turns a method's error into what the frontend receives
func New(target any, formatError func(error) any) *Server {
	s := &Server{
		methods:       map[string]reflect.Value{},
		formatError:   formatError,
		done:          make(chan struct{}),
		subs:          map[chan []byte]struct{}{},
		nativeCalls:   make(chan []byte, 16),
		nativePending: map[int64]chan nativeReply{},
	}
	v := reflect.ValueOf(target)
	for i := range v.NumMethod() {
		s.methods[v.Type().Method(i).Name] = v.Method(i)
	}
	return s
}

// Close ends the open streams (events, native calls), so that the HTTP server can shut down
func (s *Server) Close() {
	select {
	case <-s.done:
	default:
		close(s.done)
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasPrefix(r.URL.Path, "/api/call/") && r.Method == http.MethodPost:
		s.serveCall(w, r, strings.TrimPrefix(r.URL.Path, "/api/call/"))
	case r.URL.Path == "/api/events":
		s.serveEvents(w, r)
	case r.URL.Path == "/native/calls":
		s.serveNativeCalls(w, r)
	case r.URL.Path == "/native/reply" && r.Method == http.MethodPost:
		s.serveNativeReply(w, r)
	default:
		http.NotFound(w, r)
	}
}

// ---------------------------------------------------------------- Methods

func (s *Server) serveCall(w http.ResponseWriter, r *http.Request, name string) {
	m, ok := s.methods[name]
	if !ok {
		http.Error(w, "no method "+name, http.StatusNotFound)
		return
	}
	var raw []json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		http.Error(w, "bad arguments: "+err.Error(), http.StatusBadRequest)
		return
	}
	result, err := s.call(m, raw)
	if err != nil {
		var bad *argError
		if errors.As(err, &bad) {
			http.Error(w, fmt.Sprintf("%s: %v", name, err), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{"error": s.formatError(err)})
		return
	}
	writeJSON(w, map[string]any{"result": result})
}

type argError struct{ err error }

func (e *argError) Error() string { return e.err.Error() }

// call calls m with the JSON arguments (missing ones are zero values) and returns its result and error
func (s *Server) call(m reflect.Value, raw []json.RawMessage) (result any, err error) {
	t := m.Type()
	if len(raw) > t.NumIn() {
		return nil, &argError{fmt.Errorf("%d arguments for %d parameters", len(raw), t.NumIn())}
	}
	args := make([]reflect.Value, t.NumIn())
	for i := range args {
		p := reflect.New(t.In(i))
		if i < len(raw) && string(raw[i]) != "null" {
			if err := json.Unmarshal(raw[i], p.Interface()); err != nil {
				return nil, &argError{fmt.Errorf("argument %d: %w", i+1, err)}
			}
		}
		args[i] = p.Elem()
	}
	defer func() {
		if p := recover(); p != nil {
			log.Printf("[webapi] panic: %v", p)
			err = fmt.Errorf("panic: %v", p)
		}
	}()
	out := m.Call(args)
	if n := len(out); n > 0 && t.Out(n-1) == errorType {
		if e := out[n-1]; !e.IsNil() {
			return nil, e.Interface().(error)
		}
		out = out[:n-1]
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out[0].Interface(), nil
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[webapi] encode: %v", err)
	}
}

// ---------------------------------------------------------------- Events

// Emit sends an event to every open event stream
func (s *Server) Emit(name string, data any) {
	b, err := json.Marshal(map[string]any{"name": name, "data": data})
	if err != nil {
		log.Printf("[webapi] event %s: %v", name, err)
		return
	}
	s.subMu.Lock()
	defer s.subMu.Unlock()
	for ch := range s.subs {
		select {
		case ch <- b:
		default: // a stream that is not read is behind; it misses this event
		}
	}
}

func (s *Server) serveEvents(w http.ResponseWriter, r *http.Request) {
	ch := make(chan []byte, 1024)
	s.subMu.Lock()
	s.subs[ch] = struct{}{}
	s.subMu.Unlock()
	defer func() {
		s.subMu.Lock()
		delete(s.subs, ch)
		s.subMu.Unlock()
	}()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	rc := http.NewResponseController(w)
	fmt.Fprint(w, ": open\n\n")
	_ = rc.Flush()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-s.done:
			return
		case b := <-ch:
			if _, err := fmt.Fprintf(w, "data: %s\n\n", b); err != nil {
				return
			}
			_ = rc.Flush()
		}
	}
}

// ---------------------------------------------------------------- The native app

// Native asks the native app to do method and decodes its result into out (nil to ignore it). It waits until the
// native app answers or ctx ends
func (s *Server) Native(ctx context.Context, method string, params, out any) error {
	id := s.nativeID.Add(1)
	b, err := json.Marshal(map[string]any{"id": id, "method": method, "params": params})
	if err != nil {
		return err
	}
	reply := make(chan nativeReply, 1)
	s.nativeMu.Lock()
	s.nativePending[id] = reply
	s.nativeMu.Unlock()
	defer func() {
		s.nativeMu.Lock()
		delete(s.nativePending, id)
		s.nativeMu.Unlock()
	}()
	select {
	case s.nativeCalls <- b:
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case rep := <-reply:
		switch {
		case rep.Error == "unsupported":
			return ErrUnsupported
		case rep.Error != "":
			return errors.New(rep.Error)
		case out != nil && len(rep.Result) > 0:
			return json.Unmarshal(rep.Result, out)
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Server) serveNativeCalls(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-store")
	rc := http.NewResponseController(w)
	_ = rc.Flush()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-s.done:
			return
		case b := <-s.nativeCalls:
			if _, err := fmt.Fprintf(w, "%s\n", b); err != nil {
				return // the call is lost; its caller waits until its context ends
			}
			_ = rc.Flush()
		}
	}
}

func (s *Server) serveNativeReply(w http.ResponseWriter, r *http.Request) {
	var rep struct {
		ID int64 `json:"id"`
		nativeReply
	}
	if err := json.NewDecoder(r.Body).Decode(&rep); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.nativeMu.Lock()
	ch := s.nativePending[rep.ID]
	s.nativeMu.Unlock()
	if ch != nil {
		ch <- rep.nativeReply
	}
	w.WriteHeader(http.StatusNoContent)
}
