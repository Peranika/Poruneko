// Package webapi serves the app's API over HTTP, where there is no Wails (a browser of remote access): the frontend
// calls the methods of the App and receives its events.
//
//	POST /api/call/<Method>   body: the arguments as a JSON array. Answer: {"result": ...} or {"error": ...}
//	                          (the error formatted by FormatError, as Wails' ErrorFormatter does)
//	GET  /api/events          the events as server-sent events: data: {"name": "...", "data": ...}
package webapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"reflect"
	"strings"
	"sync"
)

// Server serves the exported methods of a value
type Server struct {
	methods     map[string]reflect.Value
	formatError func(error) any
	done        chan struct{} // closed by Close: the streams end

	subMu sync.Mutex
	subs  map[chan []byte]struct{}
}

var errorType = reflect.TypeFor[error]()

// New serves the exported methods of target. formatError turns a method's error into what the frontend receives
func New(target any, formatError func(error) any) *Server {
	s := &Server{
		methods:     map[string]reflect.Value{},
		formatError: formatError,
		done:        make(chan struct{}),
		subs:        map[chan []byte]struct{}{},
	}
	v := reflect.ValueOf(target)
	for i := range v.NumMethod() {
		s.methods[v.Type().Method(i).Name] = v.Method(i)
	}
	return s
}

// Deny takes methods out of the API (what must not be done from where it is served)
func (s *Server) Deny(names ...string) {
	for _, n := range names {
		delete(s.methods, n)
	}
}

// Close ends the open event streams, so that the HTTP server can shut down
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
