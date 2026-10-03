//go:build wasip1

// A plugin for the tests of internal/plugin: "info", "echo", and "fetch" through the host
package main

import (
	"encoding/json"
	"errors"

	"poruneko/pluginsdk"
)

func init() {
	pluginsdk.Serve(func(method string, params json.RawMessage) (any, error) {
		switch method {
		case "info":
			return map[string]any{"abi": 1, "kind": "site", "id": "testsite", "name": "Test Site", "version": "0.1",
				"hosts": []string{"127.0.0.1"}, "capabilities": []string{"webURL"}}, nil
		case "echo":
			var v any
			_ = json.Unmarshal(params, &v)
			return v, nil
		case "fetch":
			var p struct{ URL string }
			_ = json.Unmarshal(params, &p)
			res, err := pluginsdk.Fetch(pluginsdk.Request{URL: p.URL, Headers: map[string]string{"X-Test": "1"}})
			if err != nil {
				return nil, &pluginsdk.Error{Code: "test.fetch", Message: err.Error()}
			}
			pluginsdk.Log("fetched " + p.URL)
			return string(res.Body), nil
		case "list":
			return map[string]any{"items": []map[string]any{{"id": "42", "title": "Work"}}, "total": 1, "page": 1}, nil
		case "webURL":
			var p struct{ ID string }
			_ = json.Unmarshal(params, &p)
			return "https://127.0.0.1/w/" + p.ID, nil
		case "fail":
			return nil, errors.New("plain failure")
		}
		return nil, &pluginsdk.Error{Code: "plugin.unknownMethod", Message: method}
	})
}

func main() {}
