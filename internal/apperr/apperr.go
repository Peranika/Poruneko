// Package apperr represents errors shown in the UI.
//
// The text lives in the frontend string tables (frontend/src/i18n); this only holds the table key (Code)
// and the values to insert (Params). Error() returns English text for logs.
package apperr

import (
	"errors"
	"fmt"
)

// Error is an error shown in the UI
type Error struct {
	Code   string         // string table key (errors.<Code>)
	Params map[string]any // values inserted into the text
	Msg    string         // English text for logs
	Cause  error          // the original error (passed as the detail param if present)
}

func (e *Error) Error() string {
	if e.Cause != nil {
		return e.Msg + ": " + e.Cause.Error()
	}
	return e.Msg
}

func (e *Error) Unwrap() error { return e.Cause }

// New creates an error. kv is pairs of names and values to insert ("max", 12, ...)
func New(code, msg string, kv ...any) *Error {
	return &Error{Code: code, Msg: msg, Params: params(kv)}
}

// Wrap creates an error wrapping the original one (whose text can be inserted as detail)
func Wrap(cause error, code, msg string, kv ...any) *Error {
	return &Error{Code: code, Msg: msg, Params: params(kv), Cause: cause}
}

func params(kv []any) map[string]any {
	if len(kv) == 0 {
		return nil
	}
	m := make(map[string]any, len(kv)/2)
	for i := 0; i+1 < len(kv); i += 2 {
		m[fmt.Sprint(kv[i])] = kv[i+1]
	}
	return m
}

// Payload is the shape of an error passed to the frontend
type Payload struct {
	Code    string         `json:"code,omitempty"`
	Params  map[string]any `json:"params,omitempty"`
	Message string         `json:"message"` // English text (shown when the string table has no entry)
}

// ToPayload converts an error for the frontend (errors without a Code carry only English text)
func ToPayload(err error) Payload {
	var e *Error
	if !errors.As(err, &e) {
		return Payload{Message: err.Error()}
	}
	p := Payload{Code: e.Code, Message: err.Error()}
	if len(e.Params) > 0 || e.Cause != nil {
		p.Params = map[string]any{}
		for k, v := range e.Params {
			p.Params[k] = v
		}
		if e.Cause != nil {
			p.Params["detail"] = e.Cause.Error()
		}
	}
	return p
}

// Format is passed to Wails' ErrorFormatter (turns errors of bound methods into a Payload)
func Format(err error) any { return ToPayload(err) }
