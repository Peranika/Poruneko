# Writing a Poruneko site plugin

English / [日本語](#japanese)


A site plugin adds one site: its list screen (search, filters, paging), its works (info and pages), suggestions,
and optionally Favorites. Everything else is the app's: tabs and screens, bookmarks, series, downloads and cbz
files, the viewer, caching and fetching the page images. The plugin only answers calls with JSON.
The hitomi plugin (`Poruneko.Hitomi`, private) is a complete example; `internal/plugin/testdata/testsite` is the
smallest one.

## 1. Set up a project

A plugin is its own Go module. `pluginsdk` cannot be imported from the app's module, so copy the `pluginsdk` folder
into the plugin and change its import path (the hitomi plugin does this):

```
myplugin/
  go.mod          module myplugin  (go 1.26)
  main.go         the handler (//go:build wasip1)
  browse.go       the browse spec (optional)
  icon.svg        the tab icon (optional, embedded)
  pluginsdk/      copy of the app's pluginsdk
```

Build and install:

```sh
GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -ldflags="-s -w" -o myplugin.wasm .
# PowerShell: $env:GOOS='wasip1'; $env:GOARCH='wasm'; go build -buildmode=c-shared -ldflags="-s -w" -o myplugin.wasm .
```

Put `myplugin.wasm` in `plugins` next to `Poruneko.exe` (or in `%AppData%\Poruneko\plugins`) and restart the app.
Plugins are loaded only at startup. If two plugins have the same id, the first one found wins (the exe's folder
comes first). The settings screen lists the loaded plugins; `poruneko.log` in the data folder says why one was not
loaded.

## 2. The handler

```go
//go:build wasip1

package main

import (
	"encoding/json"

	"myplugin/pluginsdk"
)

func init() { pluginsdk.Serve(handle) }

func main() {}

func handle(method string, params json.RawMessage) (any, error) {
	switch method {
	case "info":
		return map[string]any{
			"abi": 1, "kind": "site", "id": "example", "name": "Example", "version": "0.1.0",
			"hosts":        []string{"example.com"},
			"capabilities": []string{"webURL"},
		}, nil
	case "list":
		var q struct {
			Query   string
			Filters map[string]string
			Page    int
		}
		if err := json.Unmarshal(params, &q); err != nil {
			return nil, err
		}
		return list(q.Query, q.Filters, q.Page) // -> {"items": [...], "total": n, "page": p, "perPage": n}
	// case "gallery", "image", "thumb", "suggest", "webURL": ...
	}
	return nil, &pluginsdk.Error{Code: "plugin.unknownMethod", Message: method}
}
```

- Each call is a method name and JSON params; the result is encoded as JSON. `encoding/json` matches field names
  without regard to case, so Go structs without tags work for the params.
- Return a `*pluginsdk.Error` to keep an error code; other errors become `plugin.error`. Errors go to the log and
  the screen shows that loading failed.
- `pluginsdk.Setting(id)` is the value of one of the plugin's settings or filters during the call.
- `pluginsdk.Log(msg)` writes a line to `poruneko.log`.

## 3. info

| Field | |
| --- | --- |
| `abi` | `1` (other versions are not loaded) |
| `kind` | `"site"` |
| `id` | the site id: the first part of the works' keys (`id:workid`), the bookmarks' site and the folder name under the library folder. Never change it after release (bookmarks refer to it) |
| `name` | shown on the tab and in the settings |
| `version` | shown in the settings |
| `hosts` | the hosts the plugin may fetch from; `example.com` also allows its subdomains |
| `displayHosts` | optional: the hosts shown in the settings instead of `hosts` (e.g. without the content servers) |
| `capabilities` | the optional methods it answers: `listAny`, `webURL`, `tagNamesJa`, `invalidate`, `fromURL`, `attachment`, `favoriteNames`, `status`, `viewHeader`, `viewAction` |
| `icon` | optional: the tab icon as a data URL; an SVG is drawn in the text color like the app's icons |
| `browse` | optional: the list screen's hint, filters, settings, kinds of tags and the works' numbers (section 6) |
| `siteCreators` | optional: `true` takes the works' creators from their own `artists` / `groups` (no lookup on DLsite / FANZA) |
| `loadMore` | optional: when the list screens load the next page while scrolling: `near` (the default), `bottom` (only when scrolling on at the bottom) or `button`. The later ones call the site less (for a site with rate limits); the user can choose another |
| `fileNameFormat` | optional: the file name format suggested for the site's works (such as `[{creator}] {id} {title}`); the user can choose another for the site in the settings |
| `ownFavorites` | optional: `true` makes Favorites the plugin's own choice of works (such as the user's lists on the site): `listAny` gets no `tags` and the screen shows no artists |

## 4. Methods

Required: `info`, `list`, `gallery`, `image`, `thumb`, `suggest`. The others are optional: list the ones the
plugin answers in `capabilities`. The types are in `internal/model/types.go` and `internal/site/site.go`.

| Method | Params | Result |
| --- | --- | --- |
| `list` | `{query, filters, page, minPages, maxPages}` | `ListResult` |
| `gallery` | `{id}` | `GalleryDetail` (a `GallerySummary` plus `pages`) |
| `image` | `{id, index, format}` | `{url, headers, ext}` |
| `thumb` | `{id, index, big}` | `{url, headers, ext}` |
| `suggest` | `{term}` | `[{ns, name, count}]` |
| `listAny` | `{tags, filters, page, exclude}` | `ListResult` |
| `webURL` | `{id}` | the work's page on the site (a string, `""` for none) |
| `tagNamesJa` | none | `{"english name": "日本語名"}` |
| `invalidate` | none | nothing |
| `fromURL` | `{url}` | the id of the work at a URL on the site (`""` if it is not one) |
| `attachment` | `{id, index}` | where an attachment of the work is fetched from, like `image`: `{url, headers, ext}` |
| `favoriteNames` | `{lang}` | with `ownFavorites`: what Favorites can be narrowed by, `[{tag, name, ns, bookmarks, note, parents}]` (shown on its left; the chosen one's `tag` comes as `listAny`'s only tag). Names that are some name's `parents` (such as lists) are shown apart above the others; choosing one shows only the names belonging to it below. `open: {view, query}` adds a button that opens one of the plugin's views with that input (a user's screen) |
| `status` | `{lang}` | lines of the site's state shown on its tab, such as the API calls left: `[{label, value, max, note, warn}]` (a table: the parts line up in columns) |
| `viewHeader` | `{view, query, lang}` | the header above a view's works: `{title, subtitle, text, image, actions}` (`null` for none) |
| `viewAction` | `{view, query, action, lang}` | does a header button (`actions[].id`); `{message}` is shown after it |

**list** is the site's list screen. `query` is the search box as typed (the plugin parses it: tag syntax,
exclusions, words); `filters` are the values of the browse spec's filters; `page` starts at 1. `minPages` /
`maxPages` (0 for no limit) are the page count filter: the app removes works outside it from the page and counts
them in `hidden` itself, so a plugin can leave them alone (doing it too is harmless). The result:

```json
{
  "items": [{ "id": "123", "title": "Title", "japaneseTitle": "タイトル", "type": "doujinshi",
              "language": "japanese", "languageLocal": "日本語", "date": "2026-01-02",
              "artists": ["artist name"], "groups": ["group name"], "parodies": [], "characters": [],
              "tags": [{ "ns": "female", "name": "tag name" }], "pageCount": 24 }],
  "failed": [], "total": 1000, "page": 1, "perPage": 25, "hidden": 0
}
```

- `id` is the work's id on the site; keep it stable. The app sets `key` and `site` and turns missing lists into
  empty ones.
- `failed`: ids on this page whose info could not be fetched (the screen says some works are missing).
- `artists` / `groups` are the site's own spellings. Favorites searches the site with them as `artist:<name>` /
  `group:<name>` (lowercase, spaces as `_`), so return them in the form the site's search accepts.
- `type` should be one of the values of a filter with id `type` (its labels, colors and `spread` apply to works).
- `tags[].ns` is one of the browse spec's namespaces; tags are shown as search links `ns:name`.
- Optional: `owner` is the account the work belongs to (such as a user's id, stable even when the name changes).
  The user can keep their own values of the filters with a `stat` for an owner (from a view's header with an
  `owner`); those then apply to that owner's works everywhere instead of the common ones. The app keeps them in
  `bookmarks.db` (table `owner_settings`).
- Optional: `description` is the work's own text (a post's body...), shown on the work page and saved as the
  Summary of ComicInfo.xml; `stats` are its numbers (`{"likes": 120}`, the ids of the browse spec's `stats`).
- A list whose length is not known (a timeline) returns `"total": -1` and `"more": true` while there is a next page.

**gallery** returns the work with its pages. `pages[]` are `{index, name, width, height}` in reading order from
index 0. Give the real size when the site tells it: the viewer uses it for spreads (a page wider than tall is shown
alone) and for the layout before the image arrives. Use 0 when unknown. A page that is a video has `"video": true`
(and `image` gives its `mp4` / `webm`): the viewer plays it, shows it alone in spreads, and the slideshow waits for
it to end. Videos are saved in the cbz like pages and played from it.

**image** / **thumb** do not return the image itself but where the app fetches it: `url`, the `headers` to send
(such as `Referer`) and `ext`, the file extension (`webp`...). The app fetches it with its own timeouts, retries
and concurrency limit, caches it and saves it into the cbz. If the fetch ends in 403 or 404, the app calls
`invalidate` (when listed) and asks `image` once more, so a plugin with expiring URLs or keys should drop them in
`invalidate`. `format` is empty (the image format is left to the plugin's settings). `thumb` with `big: true` asks
for a larger cover for the work page; return the small one if there is none.

**suggest** completes the search box: `term` is the word being typed; return candidates with their namespace and
how many works have them (0 if unknown).

**listAny** is Favorites (the tab appears only for sites that list it): works having any of `tags` (`"artist:x"`,
`"group:y"`), newest first. `filters` are the filters with `"in": ["favorites"]`; leave out works whose key
(`id:workid`) is in `exclude`. The app applies the page count filter itself.

**Attachments**: files of a work that are not pages (archives, PSDs, PDFs...) go in `gallery`'s `attachments`
(`[{index, name, kind, size}]`; `kind` is archive / document / audio / other, told by the name when left out). The
work page lists them; their URL comes from `attachment` when one is opened, so it may expire. They are kept in the
work info, as the app is to download them, open archives and show their images later.

**fromURL** reads a URL the user copied (Bookmarks → Add from URL, or pasting on the Bookmarks screen): return the
work's id, or `""` when the URL is not one of the site's works.

**tagNamesJa** is asked once: English tag names to Japanese, for the namespaces marked `translated`. Embedding a
JSON file (`//go:embed`) and returning it as `json.RawMessage` is enough.

## 5. Fetching

- `pluginsdk.Fetch(Request{URL, Headers})` makes one GET through the app; `pluginsdk.FetchMany` makes several in
  parallel (up to 8 at a time). Batch requests where you can: a plugin waits for each fetch.
- GET, or POST with `Method: "POST"` and a `Body`; only `http(s)`, and only to `hosts`. The app adds its
  User-Agent, retries and a 2 minute timeout. `NoRetry: true` turns the retries off (for a site that counts every
  request, such as an API with a rate limit); the response of a failed fetch still has its headers.
- A failed fetch returns a `*pluginsdk.HTTPError` with the status (0 when there was no response) and the start of
  the site's error response in `Body`, so 404 and the like can be told apart.
- An error the user should read (such as "enter your login in the settings") is a `*pluginsdk.Error` with `Text`
  in each UI language; the screen shows it instead of the code.
- A plugin has no file system, network or timers of its own. Keep caches in memory.
- The app runs up to 4 instances of a plugin, each handling one call at a time. Global variables are per instance:
  a cache is not shared between instances and an instance can be dropped, so treat caches as a speed-up only.
- `pluginsdk.StoreSet(key, value)` / `pluginsdk.StoreGet(key)` keep values that every instance sees (in the app's
  memory: entries expire after 12 hours and the oldest go past 20,000), such as what a list call learned about
  works that `gallery` / `thumb` need later. `pluginsdk.Cached(key, maxAge, fetch)` reads a value kept that way, or
  makes it again with `fetch` when it is older than `maxAge`.
- `pluginsdk.UserError(code, message, ja, en)` is an error whose text the screen shows.

## 6. The browse spec (filters, settings, tags)

`browse` in the info (`pluginsdk.BrowseSpec`, see `pluginsdk/spec.go`) makes the app draw the site's screens.
Every text is given per UI language (`{"ja": ..., "en": ...}`).

- `placeholder`: the search box's hint.
- `filters`: drop-downs above the list. `in` says where: `browse` (the default), `favorites`, or `settings` for a
  setting that is not a filter (shown in the app's settings, read with `pluginsdk.Setting`). `default` is the
  value until the user chooses one; `multi` allows several (joined with `,`; none chosen means all); `onSearch` is
  the value used while there is a query (e.g. newest first). The user's choices are kept as the plugin's settings
  and sent with every call.
- A filter with id `type` also names and colors the works' types; its options with `spread: true` are manga and
  open in spreads when the viewer setting asks for it.
- `namespaces`: the kinds of tags (`female`, `artist`...) with a label, a `suffix` such as ♀, a CSS `color`, and
  `translated` when `tagNamesJa` has names for them.
- `stats`: the numbers works have (`{id, label, icon}`; `icon` is one of the app's icons such as `heart`, `repost`,
  `eye`). They are shown on the works.
- `views`: the plugin's own screens, added to the site's tab (`{id, label, icon, placeholder, hint}`). Each has an
  input (which can be pasted from the clipboard); `list` gets `view` (the screen's id) and the input as `query`.
  Filters show on a view when their `in` has its id. Links of the kinds in its `namespaces` (such as `artist`) open
  the view with the name; links of the kinds in its `aliases` (such as `group` for a display name) open it with the
  work's name of the first of `namespaces` instead (its user id). With `viewHeader` the view shows a header for its input (a user's name and picture...)
  and its `actions` as buttons (`active` shows one as on, `items` makes a menu, `confirm` asks first).
- `favoritesLabel` / `favoritesIcon`: the name and icon of the Favorites screen on the site's tab (for a plugin
  whose Favorites is its own choice, such as `Lists`).
- `creatorLabels`: what the site calls the creators the app calls circle (`group`) and artist (`artist`), such as an
  account's display name and id. The screens use them in place of "circle" and "artist".
- A filter with `stat` is a minimum of that number: its options' values are numbers (`"0"` for none) and the app
  hides the works below the chosen one (counted in `hidden`).
- A setting (`"in": ["settings"]`) with `kind: "text"` is a line of text and `kind: "secret"` a hidden one (such as a
  login cookie); `hint` is shown under it.

## 7. Checklist

- Search, filters and paging work on the list screen; a work with many pages opens and its pages load.
- Bookmark a work and download it: the cbz is made under the site's folder (Settings → save locations).
- Images still load after a while (expiring URLs need `invalidate`).
- With `listAny`: Favorites lists works of bookmarked artists, and `exclude` hides bookmarked ones.
- `PORUNEKO_DEBUG=1` logs every image request; plugin errors and `pluginsdk.Log` lines are in `poruneko.log`.

---

<a id="japanese"></a>

# Poruneko のサイトプラグインの作り方

[English](#writing-a-poruneko-site-plugin) / 日本語

サイトプラグインは 1 つのサイトを追加します。担当するのは、一覧画面（検索・絞り込み・ページ送り）、作品の情報とページ、
検索候補、必要ならお気に入りです。タブや画面、ブックマーク、シリーズ、ダウンロードと cbz、ビューア、ページ画像の取得と
キャッシュはすべてアプリがするので、プラグインは JSON で呼び出しに答えるだけです。
完成した例は hitomi プラグイン（`Poruneko.Hitomi`、非公開）、いちばん小さい例は `internal/plugin/testdata/testsite` です。

## 1. プロジェクトを作る

プラグインは独立した Go モジュールです。アプリのモジュールにある `pluginsdk` は import できないので、`pluginsdk` フォルダを
プラグインにコピーして import パスを書き換えます（hitomi プラグインもこうしています）。

```
myplugin/
  go.mod          module myplugin  (go 1.26)
  main.go         ハンドラ（//go:build wasip1）
  browse.go       browse の定義（任意）
  icon.svg        タブのアイコン（任意。埋め込む）
  pluginsdk/      アプリの pluginsdk のコピー
```

ビルドは次のとおりです。

```sh
GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -ldflags="-s -w" -o myplugin.wasm .
# PowerShell: $env:GOOS='wasip1'; $env:GOARCH='wasm'; go build -buildmode=c-shared -ldflags="-s -w" -o myplugin.wasm .
```

できた `.wasm` を `Poruneko.exe` と同じ場所の `plugins`（または `%AppData%\Poruneko\plugins`）に置いて、アプリを
再起動します。読み込みは起動時だけです。同じ id のプラグインが 2 つあると、先に見つかった方（exe の隣が先）が使われます。
読み込まれたプラグインは設定画面に出ます。読み込めなかった理由はデータフォルダの `poruneko.log` に出ます。

## 2. ハンドラ

`init` で `pluginsdk.Serve(handle)` を呼び、`handle(method, params)` でメソッド名ごとに結果を返します。

```go
//go:build wasip1

package main

import (
	"encoding/json"

	"myplugin/pluginsdk"
)

func init() { pluginsdk.Serve(handle) }

func main() {}

func handle(method string, params json.RawMessage) (any, error) {
	switch method {
	case "info":
		return map[string]any{
			"abi": 1, "kind": "site", "id": "example", "name": "Example", "version": "0.1.0",
			"hosts":        []string{"example.com"},
			"capabilities": []string{"webURL"},
		}, nil
	case "list":
		var q struct {
			Query   string
			Filters map[string]string
			Page    int
		}
		if err := json.Unmarshal(params, &q); err != nil {
			return nil, err
		}
		return list(q.Query, q.Filters, q.Page) // -> {"items": [...], "total": n, "page": p, "perPage": n}
	// case "gallery", "image", "thumb", "suggest", "webURL": ...
	}
	return nil, &pluginsdk.Error{Code: "plugin.unknownMethod", Message: method}
}
```

- 結果は JSON にして返されます。params は `encoding/json` が大文字小文字を区別せずに読むので、タグなしの構造体で受け取れます。
- `*pluginsdk.Error` を返すとエラーコードが残ります。それ以外のエラーは `plugin.error` になります。エラーはログに出て、
  画面には読み込みに失敗したと出ます。
- `pluginsdk.Setting(id)` で、呼び出し中のプラグインの設定・絞り込みの値が読めます。
- `pluginsdk.Log(msg)` で `poruneko.log` に 1 行書けます。

## 3. info（プラグインの情報）

| 項目 | |
| --- | --- |
| `abi` | `1`（違う版は読み込まれません） |
| `kind` | `"site"` |
| `id` | サイトの id。作品のキー（`id:作品id`）の前半、ブックマークのサイト、ライブラリフォルダの下のフォルダ名になります。ブックマークが参照するので、公開後は変えないでください |
| `name` | タブと設定画面に出る名前 |
| `version` | 設定画面に出るバージョン |
| `hosts` | 接続してよいホスト。`example.com` と書くとサブドメインも許可されます |
| `displayHosts` | 任意。設定画面に `hosts` の代わりに出すホスト（コンテンツ用サーバーを省くときなど） |
| `capabilities` | 答えられる任意のメソッド：`listAny`、`webURL`、`tagNamesJa`、`invalidate`、`fromURL`、`attachment`、`favoriteNames`、`status`、`viewHeader`、`viewAction` |
| `icon` | 任意。タブのアイコン（data URL）。SVG はアプリのアイコンと同じく文字色で描かれます |
| `browse` | 任意。一覧画面のヒント・絞り込み・設定・タグの種類・作品の数値（6 節） |
| `siteCreators` | 任意。`true` にすると作者情報を作品の `artists` / `groups` から取ります（DLsite・FANZA を調べません） |
| `loadMore` | 任意。スクロールで次のページを読み込むタイミング：`near`（既定。最後に近づいたら）、`bottom`（最下部でさらにスクロールしたとき）、`button`（ボタンだけ）。後ろのものほどサイトへの呼び出しが減ります（回数制限のあるサイト向け）。ユーザーは設定で変えられます |
| `fileNameFormat` | 任意。このサイトの作品に勧めるファイル名の書式（`[{creator}] {id} {title}` など）。ユーザーは設定でサイトごとに変えられます |
| `ownFavorites` | 任意。`true` にするとお気に入りはプラグインが選んだ作品（サイト上のユーザーのリストなど）になります。`listAny` に `tags` は来ず、画面にアーティストの一覧は出ません |

## 4. メソッド

必須は `info`、`list`、`gallery`、`image`、`thumb`、`suggest` です。それ以外は任意で、答えるものを `capabilities` に
書きます。型は `internal/model/types.go` と `internal/site/site.go` にあります。

| メソッド | 引数 | 結果 |
| --- | --- | --- |
| `list` | `{query, filters, page, minPages, maxPages}` | `ListResult` |
| `gallery` | `{id}` | `GalleryDetail`（`GallerySummary` と `pages`） |
| `image` | `{id, index, format}` | `{url, headers, ext}` |
| `thumb` | `{id, index, big}` | `{url, headers, ext}` |
| `suggest` | `{term}` | `[{ns, name, count}]` |
| `listAny` | `{tags, filters, page, exclude}` | `ListResult` |
| `webURL` | `{id}` | サイト上の作品ページ（文字列。なければ `""`） |
| `tagNamesJa` | なし | `{"英語名": "日本語名"}` |
| `invalidate` | なし | なし |
| `fromURL` | `{url}` | その URL の作品の id（サイトの作品でなければ `""`） |
| `attachment` | `{id, index}` | 作品の添付の取得先。`image` と同じ `{url, headers, ext}` |
| `favoriteNames` | `{lang}` | `ownFavorites` のとき、お気に入りを絞り込む名前：`[{tag, name, ns, bookmarks, note, parents, open}]`（下の説明） |
| `status` | `{lang}` | サイトのタブに出す状態の行（API の残り回数など）：`[{label, value, max, note, warn}]`（表になり、各項目が列で揃います） |
| `viewHeader` | `{view, query, lang}` | 画面の作品の上に出す見出し：`{title, subtitle, text, image, actions}`（なければ `null`） |
| `viewAction` | `{view, query, action, lang}` | 見出しのボタン（`actions[].id`）を実行します。後で `{message}` が出ます |

- **list**：サイトの一覧画面。`query` は検索欄に打たれたままの文字列で、タグの書き方・除外・単語の解釈はプラグインがします。
  `filters` は絞り込みの値、`page` は 1 から始まります。`minPages` / `maxPages`（0 は制限なし）はページ数の絞り込みで、
  範囲外の作品をそのページから除いて `hidden` に数えるのはアプリがします（プラグインがしても問題ありません）。結果は次の形です。

  ```json
  {
    "items": [{ "id": "123", "title": "Title", "japaneseTitle": "タイトル", "type": "doujinshi",
                "language": "japanese", "languageLocal": "日本語", "date": "2026-01-02",
                "artists": ["artist name"], "groups": ["group name"], "parodies": [], "characters": [],
                "tags": [{ "ns": "female", "name": "tag name" }], "pageCount": 24 }],
    "failed": [], "total": 1000, "page": 1, "perPage": 25, "hidden": 0
  }
  ```

  - `id` はサイト上の作品 id です。変わらないものにしてください。`key` と `site` はアプリが付け、空のリストも補います。
  - `failed` は、このページで情報を取れなかった作品の id です（画面に、一部の作品が欠けていると出ます）。
  - `artists` / `groups` はサイトでの綴りのままにします。お気に入りはこれを `artist:名前` / `group:名前`
    （小文字、空白は `_`）にしてサイトを検索するので、サイトの検索が受け付ける形で返してください。
  - `type` は、id が `type` の絞り込みの値のどれかにします（そのラベル・色・`spread` が作品に使われます）。
  - `tags[].ns` は browse の namespaces のどれかです。タグは `ns:name` の検索リンクになります。
  - 任意：`owner` は作品の持ち主のアカウント（ユーザーの数値 ID など、名前が変わっても変わらないもの）です。ユーザーは
    `stat` 付きの絞り込みの値を持ち主ごとに保存でき（`owner` 付きの画面の見出しから）、その持ち主の作品にはどこでも共通の
    値の代わりにそれが使われます。保存先は `bookmarks.db` の `owner_settings` 表です。
  - 任意：`description` は作品自身の文章（ポストの本文など）で、作品ページに出て、ComicInfo.xml の Summary にも入ります。
    `stats` は作品の数値（`{"likes": 120}`。id は browse の `stats` のもの）です。
  - 件数が分からない一覧（タイムラインなど）は `"total": -1` にし、次のページがある間は `"more": true` を返します。
- **gallery**：作品とページの一覧。`pages[]` は `{index, name, width, height}` を、読む順に 0 から並べます。
  サイトから大きさが分かるなら入れてください。見開き（横長のページは単独で表示）や、画像が届く前のレイアウトに使います。
  分からなければ 0 にします。動画のページは `"video": true` にします（`image` は `mp4` / `webm` を返します）。
  ビューアは再生し、見開きでは単独で表示し、スライドショーは再生が終わるまで待ちます。動画も cbz に入り、そこから再生されます。
- **image** / **thumb**：画像そのものではなく、取得先を返します。`url`、送るべき `headers`（`Referer` など）、
  拡張子の `ext`（`webp` など）です。取得・タイムアウト・リトライ・同時接続数・キャッシュ・cbz への保存はアプリがします。
  取得が 403 / 404 になると、アプリは `invalidate` を呼び（あれば）、もう一度 `image` を聞きます。期限付きの URL や鍵を
  使うサイトでは、`invalidate` でそれを捨ててください。`format` は空です（画像形式はプラグインの設定に任せています）。
  `thumb` の `big: true` は作品ページ用の大きい表紙です。なければ小さいものを返してください。
- **suggest**：検索欄の補完。`term` は入力中の語です。候補を、名前空間と作品数（分からなければ 0）付きで返します。
- **favoriteNames**：`ownFavorites` のとき、お気に入りの左に出す絞り込みの名前。各名前の `parents`（リストなど属する名前の
  tag）に出てくる名前は上の枠に分かれ、それを選ぶと、その名前に属するものだけが下の枠に出ます。選んだものの `tag` が
  `listAny` の唯一の tag として来ます。`open: {view, query}` を付けると、その入力でプラグインの画面（ユーザーの画面など）を
  開くボタンが出ます。
- **status** / **viewHeader** / **viewAction**：上の表のとおりです。`viewHeader` と `viewAction` は 6 節の `views` で使います。
- **listAny**：お気に入り（これを `capabilities` に書いたサイトにだけタブが出ます）。`tags`（`"artist:x"`、`"group:y"`）の
  どれかを持つ作品を新しい順に返します。`filters` は `"in": ["favorites"]` の絞り込みです。キー（`id:作品id`）が
  `exclude` にある作品は除きます。ページ数の絞り込みはアプリがします。
- **webURL**：サイト上の作品ページ（なければ `""`）。
- **添付**：ページではない作品のファイル（書庫・PSD・PDF など）は、`gallery` の `attachments`（`[{index, name, kind, size}]`。
  `kind` は archive / document / audio / other で、省くと名前から決めます）に入れます。作品ページに一覧が出て、開くときに
  `attachment`（`image` と同じ形）で取得先を聞くので、期限付きの URL でも構いません。添付は作品情報に残り、将来アプリが
  ダウンロード・書庫の展開・中の画像の表示をするのに使います。
- **fromURL**：ユーザーがコピーした URL（ブックマーク → URL から追加、またはブックマーク画面での貼り付け）を読みます。
  その作品の id を、サイトの作品でなければ `""` を返します。
- **tagNamesJa**：1 回だけ聞かれます。英語のタグ名 → 日本語名で、`translated` の名前空間に使われます。
  JSON ファイルを `//go:embed` して `json.RawMessage` で返せば十分です。

## 5. 通信

- `pluginsdk.Fetch(Request{URL, Headers})` でアプリを通して GET を 1 つ、`pluginsdk.FetchMany` で複数を並列に
  （同時に 8 つまで）送れます。プラグインは取得を 1 つずつ待つので、まとめられるものはまとめてください。
- 使えるのは GET と、`Method: "POST"` と `Body` を付けた POST、`http(s)` だけ、`hosts` のホストだけです。User-Agent、
  リトライ、2 分のタイムアウトはアプリが付けます。`NoRetry: true` でリトライを止められます（回数制限のある API など、
  リクエストがすべて数えられるサイト向け）。失敗した応答にもヘッダーは付いてきます。
- 失敗すると `*pluginsdk.HTTPError` にステータス（応答がなければ 0）と、サイトのエラー応答の先頭（`Body`）が入るので、
  404 などを見分けられます。
- ユーザーに読ませたいエラー（「設定でログイン情報を入れてください」など）は、`*pluginsdk.Error` の `Text` に UI 言語ごとの
  文言を入れて返します。画面にはコードの代わりにそれが出ます。
- プラグインには独自のファイル・ネットワーク・タイマーはありません。キャッシュはメモリに持ちます。
- アプリは 1 つのプラグインを最大 4 インスタンス動かし、各インスタンスは一度に 1 つの呼び出しだけを処理します。
  グローバル変数はインスタンスごとにあり、インスタンス間で共有されず、インスタンスが捨てられることもあります。
  キャッシュは高速化のためだけに使ってください。
- `pluginsdk.StoreSet(key, value)` / `pluginsdk.StoreGet(key)` で、全インスタンスから見える値を置けます（アプリのメモリ上。
  12 時間で消え、20,000 件を超えると古いものから消えます）。一覧で分かった作品の情報を、後の `gallery` / `thumb` で使うときなどに。
  `pluginsdk.Cached(key, maxAge, fetch)` は、そうして置いた値を読み、`maxAge` より古ければ `fetch` で作り直します。
- `pluginsdk.UserError(code, message, ja, en)` で、画面に出す文言付きのエラーを作れます。

## 6. browse（絞り込み・設定・タグ）

info に `browse`（`pluginsdk.BrowseSpec`、`pluginsdk/spec.go`）を書くと、アプリがサイトの画面を描きます。
文言はすべて `{"ja": ..., "en": ...}` の形で書きます。

- `placeholder`：検索欄のヒント。
- `filters`：一覧の上の選択肢。`in` で出す場所を指定します：`browse`（省略時）、`favorites`、または絞り込みではない設定なら
  `settings`（アプリの設定画面に出て、`pluginsdk.Setting` で読みます）。`default` はユーザーが選ぶまでの値、`multi` は複数選択
  （`,` でつなぎます。何も選ばなければすべて）、`onSearch` は検索中に使う値（検索中は新着順にする、など）です。
  ユーザーの選択はプラグインの設定として保存され、毎回の呼び出しに付いてきます。
- id が `type` の絞り込みは、作品の種別の名前と色にも使われます。`spread: true` の選択肢は漫画として扱われ、
  ビューアの設定に従って見開きで開きます。
- `namespaces`：タグの種類（`female`、`artist` など）。ラベル、♀ のような `suffix`、CSS の `color`、`tagNamesJa` に
  名前があるなら `translated` を付けます。
- `stats`：作品が持つ数値（`{id, label, icon}`。`icon` は `heart`、`repost`、`eye` などアプリのアイコン名）。作品に表示されます。
- `views`：プラグイン独自の画面。サイトのタブに加わります（`{id, label, icon, placeholder, hint}`）。画面には入力欄があり
  （クリップボードから貼れます）、`list` には `view`（画面の id）と、入力値が `query` として来ます。`in` にその id を
  含む絞り込みがその画面に出ます。`namespaces` に挙げた種類（`artist` など）のリンクは、その名前でこの画面を開きます。`aliases` に挙げた種類
  （表示名の `group` など）のリンクは、その作品の `namespaces` の最初の種類の名前（ユーザー ID）で開きます。
  `viewHeader` があると入力に応じた見出し（ユーザーの名前や画像など）と、`actions` のボタンが出ます（`active` でオン表示、
  `items` でメニュー、`confirm` で確認）。
- `favoritesLabel` / `favoritesIcon`：サイトのタブでのお気に入り画面の名前とアイコン（お気に入りがプラグイン独自の
  内容のとき。「リスト」など）。
- `creatorLabels`：アプリが「サークル」（`group`）と「作者」（`artist`）と呼ぶものを、このサイトで何と呼ぶか（アカウントの
  表示名と ID など）。画面の「サークル」「作者」がこの名前になります。
- `stat` を付けた絞り込みは、その数値の下限です。選択肢の値は数値（`"0"` で制限なし）で、選んだ値より小さい作品はアプリが
  隠します（`hidden` に数えます）。
- 設定（`"in": ["settings"]`）に `kind: "text"` を付けると 1 行のテキスト、`kind: "secret"` だと伏せ字の欄
  （ログイン用の Cookie など）になります。`hint` は欄の下に出ます。

## 7. 確認すること

- 一覧画面で検索・絞り込み・ページ送りができる。ページの多い作品を開いて、ページが読み込める。
- ブックマークしてダウンロードすると、サイトのフォルダ（設定 → 保存先）に cbz ができる。
- しばらく経っても画像が読み込める（期限切れになる URL には `invalidate` が要る）。
- `listAny` があるなら、お気に入りにブックマークした作者の作品が出て、`exclude` でブックマーク済みが隠れる。
- `PORUNEKO_DEBUG=1` で画像のリクエストがすべてログに出ます。プラグインのエラーと `pluginsdk.Log` の行は `poruneko.log` に出ます。
