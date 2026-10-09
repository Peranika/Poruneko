package pluginsdk

import (
	"encoding/json"
	"time"
)

// What a plugin works with during a call: its settings, the UI language, errors for the screen, and fetching and
// keeping values through the app (host_wasm.go; without WebAssembly they do nothing, for tests)

// Handler handles one call (the method name and its JSON params) for Serve
type Handler func(method string, params json.RawMessage) (any, error)

var (
	settings map[string]string
	lang     string
)

// Setting is the value of one of the plugin's settings during a call ("" when the user has not chosen one)
func Setting(id string) string { return settings[id] }

// Lang is the UI language during a call ("ja" | "en"), for texts the plugin makes
func Lang() string {
	if lang == "" {
		return "ja"
	}
	return lang
}

// SetCall sets the settings and UI language of the call being made (the SDK does it for each call; tests may too)
func SetCall(s map[string]string, l string) { settings, lang = s, l }

// Error is an error with a code the app can show. Message is English for the log; Text, if given, is what the
// screen shows in each UI language
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Text    Text   `json:"text,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

// UserError is an error with the text the screen shows in each UI language (code and message go to the log)
func UserError(code, message, ja, en string) error {
	return &Error{Code: code, Message: message, Text: Text{"ja": ja, "en": en}}
}

// Request is an HTTP GET (or POST) for the app to make (only to the hosts in the plugin's info). The app adds its
// User-Agent, retries and a 2 minute timeout
type Request struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
	// Method is "" (GET) or "POST"; Body is sent with a POST
	Method string `json:"method,omitempty"`
	Body   []byte `json:"body,omitempty"`
	// NoRetry: the app does not retry a failure (for a site that counts every request against a limit)
	NoRetry bool `json:"noRetry,omitempty"`
}

// Response is the app's answer to a Request
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

// As turns a value of the plugin's own types (or a map) into one of the SDK's by its JSON, for a plugin whose code
// keeps types of the same shape. It takes a call's result as it is:
//
//	return pluginsdk.As[pluginsdk.ListResult](client.List(q))
func As[T any](v any, err error) (*T, error) {
	if err != nil {
		return nil, err
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	out := new(T)
	if err := json.Unmarshal(b, out); err != nil {
		return nil, err
	}
	return out, nil
}
