// Package pluginsdk is the plugin side of the Poruneko plugin interface (ABI 2; the host side is the app's
// internal/plugin). A site plugin is a value with the methods of Site, run with Run from init:
//
//	type mySite struct{}
//
//	func (mySite) Info() pluginsdk.Info                                         { ... }
//	func (mySite) List(q pluginsdk.ListQuery) (*pluginsdk.ListResult, error)    { ... }
//	func (mySite) Work(id string) (*pluginsdk.Work, error)                      { ... }
//	func (mySite) Source(q pluginsdk.SourceQuery) (*pluginsdk.Source, error)    { ... }
//
//	func init() { pluginsdk.Run(mySite{}) }
//	func main() {}
//
// and built with
//
//	GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -ldflags="-s -w" -o mysite.wasm .
//
// What a plugin does more is one method each (Suggester, FavoritesLister, WebURLer...): the SDK tells the app which
// of them the plugin has. The plugin fetches only through the app (Fetch, FetchMany), keeps values for all its
// instances with StoreSet / StoreGet / Cached, and reads its settings with Setting and the UI language with Lang.
//
// The types and Handle build without WebAssembly too, so a plugin's own code and its calls can be tested with
// go test (Fetch and the store then do nothing).
package pluginsdk
