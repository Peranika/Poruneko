# Writing a Poruneko site plugin

English / [日本語](#japanese)

A site plugin adds one site to the app. It is a WebAssembly module written in Go with the `pluginsdk` module, and it
only answers the app's calls: it never draws a screen, keeps no files and fetches only through the app.

| The plugin | The app |
| --- | --- |
| reads the site: lists of works, a work and its pages, where each file is | tabs and screens, search box, filters and paging as the plugin describes them |
| describes the site: its filters, tags, numbers, own views | bookmarks, series, tags, history, read works |
| optionally: suggestions, Favorites, URLs, a view's header and buttons, the site's state | downloading, cbz files, the viewer, fetching, caching and saving the files |

The plugins of the app's sites (`Poruneko.Hitomi`, `Poruneko.Pawchive`...) are complete examples;
`internal/plugin/testdata/testsite` is the smallest one.

## 1. Set up a project

A plugin is a Go module that requires `github.com/Peranika/Poruneko/pluginsdk` (with a `replace` to a checkout of
the app until it is published):

```
myplugin/
  go.mod     module myplugin
             require github.com/Peranika/Poruneko/pluginsdk v0.0.0
             replace github.com/Peranika/Poruneko/pluginsdk => ../Poruneko/pluginsdk
  main.go    the site (//go:build wasip1)
  icon.svg   the tab icon (optional, embedded)
```

Build it and put `myplugin.wasm` in `%AppData%\Poruneko\plugins` (or a `plugins` folder next to `Poruneko.exe`, which
comes first when two plugins have the same id), then restart the app: plugins are loaded at startup only.

```sh
GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -ldflags="-s -w" -o myplugin.wasm .
# PowerShell: $env:GOOS='wasip1'; $env:GOARCH='wasm'; go build -buildmode=c-shared -ldflags="-s -w" -o myplugin.wasm .
```

The settings screen lists the loaded plugins; `poruneko.log` in the data folder says why one was not loaded.

## 2. The site

A plugin is a value with four methods, run from `init`:

```go
//go:build wasip1

package main

import "github.com/Peranika/Poruneko/pluginsdk"

type site struct{}

func (site) Info() pluginsdk.Info {
	return pluginsdk.Info{ID: "example", Name: "Example", Version: "0.1.0", Hosts: []string{"example.com"}}
}
func (site) List(q pluginsdk.ListQuery) (*pluginsdk.ListResult, error)  { ... }
func (site) Work(id string) (*pluginsdk.Work, error)                    { ... }
func (site) Source(q pluginsdk.SourceQuery) (*pluginsdk.Source, error)  { ... }

// optional: one method each (section 5)
func (site) WebURL(id string) string { return "https://example.com/w/" + id }

func init() { pluginsdk.Run(site{}) }

func main() {}
```

- The SDK reads the calls, tells the app which optional methods the plugin has, and writes the answers.
- Return a `*pluginsdk.Error` to keep an error code; other errors become `plugin.error`. `pluginsdk.UserError(code,
  message, ja, en)` is an error whose text the screen shows (such as "enter your login in the settings").
- During a call, `pluginsdk.Setting(id)` is the value of one of the plugin's settings or filters, and
  `pluginsdk.Lang()` the UI language (`ja` / `en`) for texts the plugin makes.
- A plugin whose code keeps its own types of the same JSON shape (or maps) can turn them into the SDK's with
  `pluginsdk.As[T](value, err)`.
- The types and `pluginsdk.Handle` build without WebAssembly too, so the plugin's code can be tested with `go test`.

## 3. Info

| Field | |
| --- | --- |
| `ID` | the site id: the first part of the works' keys (`id:workid`), the bookmarks' site and the folder name under the library folder. Never change it after release |
| `Name`, `Version` | shown on the tab and in the settings |
| `Icon` | the tab icon as a data URL; an SVG is drawn in the text color like the app's icons |
| `Hosts` | the hosts the plugin may fetch from (`example.com` also allows its subdomains). `DisplayHosts` are shown in the settings instead (such as the site without its content servers) |
| `Pace` | the least time between the plugin's requests to a host, in ms (`{"example.com": 1000}`), for a site that bans quick page loads. It applies to the plugin's own fetches, not to the files the app fetches |
| `Login` | sign-in in a window of the app (Windows): `{URL, CookieURL, Cookies: [{Name, Setting, Match}]}`. The site's settings get a button that opens `URL`; once every cookie is there (and matches `Match`, for a cookie the site also sets for visitors), each `Setting` gets its cookie's value. Keep the settings so the user can still paste them |
| `LoadMore` | when the lists load their next page while scrolling: `near` (the default), `bottom` (only when scrolling on at the bottom) or `button`. The later ones call the site less; the user can choose another |
| `FileNameFormat` | the file name format suggested for the site's works (such as `[{creator}] {id} {title}`) |
| `Creators` | `FromSite`: the works' own `Artists` / `Groups` are their creators (no lookup on DLsite / FANZA). `Labels`: what the site calls the creators the app calls circle (`group`) and artist (`artist`), such as an account's display name and id |
| `Favorites` | how the Favorites screen works (with `Favorites`, section 5). `Own`: it is the plugin's own choice of works (such as the user's lists), narrowed by `FavoriteNames`, and shows no artists. `Label` / `Icon` name the screen. `Scoped`: one of the names above (lists) is always chosen, the first at first |
| `Browse` | the site's screens (section 6) |

## 4. Lists, works and files

**List** is a page of the site's list screen, or of one of the plugin's views. `Query` is the search box as typed (the
plugin parses it: tag syntax, exclusions, words) or the view's input (`View` is then the view's id); `Filters` are
the values of the filters on that screen; `Page` starts at 1. `MinPages` / `MaxPages` (0 for no limit) are the page
count filter: the app takes works outside it off the page itself, so a plugin can leave them alone.

The result has `Items`, `Total` (-1 when it is not known, such as a timeline: `More` then says there is a next page),
`Page`, `PerPage`, `Failed` (ids on the page whose info could not be read) and `Hidden` (works the plugin left out).
In each `Summary`:

- `ID` is the work's id on the site; keep it stable. The app sets the key (`site:id`) and turns missing lists into
  empty ones.
- `Artists` / `Groups` are the site's own spellings: Favorites searches the site with them as `artist:<name>` /
  `group:<name>` (lowercase, spaces as `_`).
- `Type` is one of the values of the filter with id `type` (its labels, colors and `Spread` apply).
- `Tags[].NS` is one of the browse spec's namespaces; tags are shown as search links `ns:name`.
- Optional: `Description` (the work's own text, saved in ComicInfo.xml), `Stats` (its numbers, by the ids of the
  browse spec's `Stats`), `Owner` (the account the work belongs to, stable when the name changes: the user can keep
  their own values of the filters with a `Stat` for an owner), `TitleCreators` (the creators the title names,
  taken as they are).

**Work** is a work with its `Pages` in reading order from index 0, and its `Attachments` (files that are not pages).
Give a page's `Width` / `Height` when the site tells them (0 when unknown): the viewer lays out spreads with them
before the image arrives, and measures the others once they load. A page with `Video` is played; when every page has
a `Delay` (ms), the pages are the frames of an animation played as one page. When a work with archives the app reads
(zip / cbz / rar / 7z) is downloaded, the user chooses which to take in: their images and videos are added after the
pages.

**Source** says where the app fetches a file of a work: a page (`Kind` `page`), a thumbnail (`thumb`; `Big` asks for
a larger cover for the work's page, give the small one if there is none) or an attachment (`attachment`; `Index` is
its `Attachment.Index`). It returns the `URL`, the `Headers` to send (such as `Referer`) and `Ext`; the app fetches,
caches and saves the file itself, with its own timeouts, retries and concurrency limit. When fetching what it
returned fails, the app asks once more with `Retry`: drop what may be stale (an expired URL or key) and answer afresh.
A source can also have `Fallback` (fetched when `URL` is not there, 404 / 410), `Entry` (the page is that file in the
zip at `URL`, fetched once for every page) or `Crop` (the thumbnail is that rectangle of the picture at `URL`).

## 5. What a plugin does more

Each is one method; the app uses it when the plugin has it.

| Interface | Method | What the app does with it |
| --- | --- | --- |
| `Suggester` | `Suggest(term)` | completes the search box (`[{NS, Name, Count}]`) |
| `FavoritesLister` | `Favorites(q)` | the Favorites screen: works having any of `q.Tags` (`artist:x`, `group:y`), newest first; leave out the keys in `q.Exclude`. With `Info.Favorites.Own`, `q.Tags` is the one name chosen (none for all, or the first with `Scoped`) |
| `FavoriteNamer` | `FavoriteNames()` | with `Own`: what Favorites is narrowed by (`[{Tag, Name, NS, Bookmarks, Note, Parents, Parent, Open}]`). Names that are some name's `Parents` (lists), or have `Parent`, are shown apart above; `Open` adds a button opening a view with an input |
| `WebURLer` | `WebURL(id)` | the work's page on the site ("Open on the site") |
| `URLReader` | `FromURL(url)` | adds a work from a URL the user copied: the work's id, or `""` |
| `TagNamer` | `TagNamesJa()` | Japanese names of the tags of the namespaces marked `Translated` (`{"english": "日本語"}` as JSON; an embedded file is enough), asked once |
| `StatusTeller` | `Status()` | lines of the site's state on its tab, such as the API calls left (`[{Label, Value, Max, Note, Warn}]`) |
| `ViewHeaderer` | `ViewHeader(view, query)` | the header above a view's works: `{Owner, Title, Subtitle, Text, Image, Actions}` (nil for none) |
| `ViewActioner` | `ViewAction(view, query, action)` | does a header button (`Actions[].ID`); the message returned is shown after it |

## 6. The screens (BrowseSpec)

`Info.Browse` makes the app draw the site's screens. Every text is given per UI language (`{"ja": ..., "en": ...}`).

- `Placeholder`: the search box's hint.
- `Filters`: drop-downs above the list. `In` says where: `browse` (the default), `favorites`, a view's id, or
  `settings` for a setting that is not a filter (in the app's settings, read with `pluginsdk.Setting`). `Default` is
  the value until the user chooses one; `Multi` allows several (joined with `,`; none chosen means all); `OnSearch`
  is the value used while there is a query. A filter with id `type` also names and colors the works' types (its
  options with `Spread` are manga, opened in spreads when the viewer setting asks for it). A filter with `Stat` is a
  minimum of that number: the app hides the works below it. A setting with `Kind` `text` is a line of text, `secret`
  a hidden one (a login cookie); `Hint` is shown under it.
- `Namespaces`: the kinds of tags (`female`, `artist`...) with a label, a `Suffix` such as ♀, a CSS `Color`, and
  `Translated` when `TagNamesJa` has names for them.
- `Stats`: the numbers works have (`{ID, Label, Icon}`; `Icon` is one of the app's icons such as `heart`).
- `Views`: the plugin's own screens on the site's tab (`{ID, Label, Icon, Placeholder, Hint}`), each with an input.
  Links of the kinds in its `Namespaces` (such as `artist`) open the view with the name; links of the kinds in its
  `Aliases` (such as `group` for a display name) open it with the work's name of the first of `Namespaces` (its id).

## 7. Fetching and keeping values

- `pluginsdk.Fetch(Request{URL, Headers})` makes one request through the app; `pluginsdk.FetchMany` makes several in
  parallel (up to 8 at a time). Batch requests where you can: a plugin waits for each fetch.
- GET, or POST with `Method: "POST"` and a `Body`; only `http(s)`, and only to `Hosts`. The app adds its User-Agent,
  retries and a 2 minute timeout; `NoRetry` turns the retries off (for a site that counts every request).
- A failed fetch returns a `*pluginsdk.HTTPError` with the status (0 when there was no response) and the start of the
  site's error response in `Body`.
- A plugin has no file system, network or timers of its own. The app runs up to 4 instances of a plugin, each
  handling one call at a time: globals are per instance, so treat them as a speed-up only.
- `pluginsdk.StoreSet` / `StoreGet` keep values every instance sees (in the app's memory: entries expire after 12
  hours and the oldest go past 20,000); `pluginsdk.Cached(key, maxAge, fetch)` reads one or makes it again.
- `pluginsdk.Log(msg)` writes a line to `poruneko.log`.

## 8. Checking a plugin

- `go test` the plugin's own code; `pluginsdk.Handle(site, method, params)` calls it as the app would.
- In the app's checkout, `PORUNEKO_PLUGIN_DIR=<folder of .wasm> go test ./internal/plugin -run Installed` loads the
  plugins and shows what they tell; with `PORUNEKO_PLUGIN_LIVE=<ids>` it also reads each site's first list page,
  work, page and thumbnail.
- In the app: search, filters and paging work; a work with many pages opens and its pages load; bookmark a work and
  download it (the cbz is made under the site's folder); images still load after a while (`Retry`).
- `PORUNEKO_DEBUG=1` logs every image request; plugin errors and `pluginsdk.Log` lines are in `poruneko.log`.

---

<a id="japanese"></a>

# Poruneko のサイトプラグインの作り方

[English](#writing-a-poruneko-site-plugin) / 日本語

サイトプラグインは、アプリにサイトを 1 つ追加します。Go と `pluginsdk` モジュールで書く WebAssembly で、アプリの呼び出しに
答えるだけです。画面は描かず、ファイルも持たず、通信はアプリを通してだけ行います。

| プラグイン | アプリ |
| --- | --- |
| サイトを読む：作品の一覧、作品とそのページ、各ファイルの取得先 | タブと画面、検索欄・絞り込み・ページ送り（プラグインの定義どおりに描く） |
| サイトを定義する：絞り込み・タグ・数値・独自の画面 | ブックマーク・シリーズ・タグ・履歴・既読 |
| 任意：検索候補・お気に入り・URL・画面のヘッダーとボタン・サイトの状態 | ダウンロード・cbz・ビューア・ファイルの取得とキャッシュと保存 |

アプリのサイトのプラグイン（`Poruneko.Hitomi`・`Poruneko.Pawchive` など）が完成した例、
`internal/plugin/testdata/testsite` がいちばん小さい例です。

## 1. プロジェクトを作る

プラグインは、`github.com/Peranika/Poruneko/pluginsdk` を使う Go のモジュールです（公開されるまでは、アプリの
チェックアウトを `replace` で参照します）。

```
myplugin/
  go.mod     module myplugin
             require github.com/Peranika/Poruneko/pluginsdk v0.0.0
             replace github.com/Peranika/Poruneko/pluginsdk => ../Poruneko/pluginsdk
  main.go    サイト（//go:build wasip1）
  icon.svg   タブのアイコン（任意、埋め込み）
```

ビルドして、`myplugin.wasm` を `%AppData%\Poruneko\plugins`（または `Poruneko.exe` の横の `plugins` フォルダ。同じ id の
プラグインが両方にあるとこちらが優先）に置き、アプリを再起動します。プラグインは起動時にだけ読み込まれます。

```sh
GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -ldflags="-s -w" -o myplugin.wasm .
# PowerShell: $env:GOOS='wasip1'; $env:GOARCH='wasm'; go build -buildmode=c-shared -ldflags="-s -w" -o myplugin.wasm .
```

設定画面に読み込まれたプラグインが並びます。読み込めなかった理由は、データフォルダの `poruneko.log` に出ます。

## 2. サイト

プラグインは 4 つのメソッドを持つ値で、`init` で動かします。

```go
//go:build wasip1

package main

import "github.com/Peranika/Poruneko/pluginsdk"

type site struct{}

func (site) Info() pluginsdk.Info {
	return pluginsdk.Info{ID: "example", Name: "Example", Version: "0.1.0", Hosts: []string{"example.com"}}
}
func (site) List(q pluginsdk.ListQuery) (*pluginsdk.ListResult, error)  { ... }
func (site) Work(id string) (*pluginsdk.Work, error)                    { ... }
func (site) Source(q pluginsdk.SourceQuery) (*pluginsdk.Source, error)  { ... }

// 任意：1 つずつメソッドを書く（5 章）
func (site) WebURL(id string) string { return "https://example.com/w/" + id }

func init() { pluginsdk.Run(site{}) }

func main() {}
```

- 呼び出しの読み取り、どの任意メソッドを持つかのアプリへの申告、答えの書き出しは SDK がします。
- エラーのコードを残すには `*pluginsdk.Error` を返します（ほかのエラーは `plugin.error`）。`pluginsdk.UserError(code,
  message, ja, en)` は、画面にその文を出すエラーです（「設定でログインしてください」など）。
- 呼び出しの間、`pluginsdk.Setting(id)` でプラグインの設定や絞り込みの値を、`pluginsdk.Lang()` で画面の言語
  （`ja` / `en`）を読めます。
- 自前の型（同じ形の JSON になるもの）や map を使っているプラグインは、`pluginsdk.As[T](値, err)` で SDK の型に
  変換できます。
- 型と `pluginsdk.Handle` は WebAssembly なしでもビルドできるので、プラグインのコードは `go test` で試せます。

## 3. Info

| 欄 | |
| --- | --- |
| `ID` | サイトの id。作品のキー（`id:作品id`）の前半、ブックマークのサイト、ライブラリのフォルダ名になります。公開後は変えないこと |
| `Name`・`Version` | タブと設定に出ます |
| `Icon` | タブのアイコン（data URL）。SVG はアプリのアイコンと同じく文字色で描かれます |
| `Hosts` | 通信してよいホスト（`example.com` はサブドメインも含む）。`DisplayHosts` は設定に代わりに出すもの（配信サーバーを除いたサイト名など） |
| `Pace` | ホストごとの通信の最小間隔（ミリ秒、`{"example.com": 1000}`）。速い読み込みを禁止するサイト向け。プラグイン自身の通信だけで、アプリが取るファイルには効きません |
| `Login` | アプリのウインドウでのログイン（Windows）：`{URL, CookieURL, Cookies: [{Name, Setting, Match}]}`。サイトの設定に `URL` を開くボタンが付き、すべての Cookie がそろうと（訪問者にも付く Cookie は `Match` に合うと）、それぞれの `Setting` に値が入ります。貼り付けでも入れられるよう、設定は残しておくこと |
| `LoadMore` | 一覧を下へスクロールしたときに次のページを読むタイミング：`near`（既定）・`bottom`（一番下でさらにスクロールしたときだけ）・`button`。後ろのものほどサイトへのアクセスが減ります。ユーザーが変えられます |
| `FileNameFormat` | このサイトの作品に勧めるファイル名の形式（`[{creator}] {id} {title}` など） |
| `Creators` | `FromSite`：作品の `Artists` / `Groups` をそのまま作者にする（DLsite・FANZA で調べない）。`Labels`：アプリがサークル（`group`）・作者（`artist`）と呼ぶものをサイトで何と呼ぶか（アカウントの表示名と ID など） |
| `Favorites` | お気に入り画面の動き（5 章の `Favorites` と組で使う）。`Own`：プラグイン独自の作品の選び方（ユーザーのリストなど）で、`FavoriteNames` で絞り込み、作者は並べない。`Label`・`Icon`：画面の名前とアイコン。`Scoped`：上の名前（リスト）のどれかが常に選ばれた状態（最初は先頭） |
| `Browse` | サイトの画面（6 章） |

## 4. 一覧・作品・ファイル

**List** は、サイトの一覧画面（またはプラグイン独自の画面）の 1 ページです。`Query` は入力されたままの検索欄
（タグの書き方・除外・単語の読み取りはプラグインが行う）か、独自の画面の入力（`View` はその画面の id）です。
`Filters` はその画面の絞り込みの値、`Page` は 1 から始まります。`MinPages` / `MaxPages`（0 で制限なし）はページ数の
絞り込みで、範囲外の作品はアプリが外すので、プラグインは何もしなくて構いません。

結果は `Items`・`Total`（タイムラインなど件数が分からないときは -1。次のページがあるかは `More`）・`Page`・`PerPage`・
`Failed`（情報を読めなかった作品の id）・`Hidden`（プラグインが外した作品の数）です。`Summary` について：

- `ID` はサイトでの作品の id で、変えないこと。キー（`site:id`）はアプリが付け、空のリストもアプリが補います。
- `Artists` / `Groups` はサイトでの表記のまま。お気に入りは `artist:<名前>` / `group:<名前>`（小文字、空白は `_`）で
  サイトを検索します。
- `Type` は id が `type` の絞り込みの値のどれか（その表示名・色・`Spread` が使われます）。
- `Tags[].NS` は画面の定義の namespaces のどれか。タグは検索リンク `ns:name` になります。
- 任意：`Description`（作品の本文。ComicInfo.xml にも保存）、`Stats`（画面の定義の `Stats` の id ごとの数値）、
  `Owner`（作品の持ち主のアカウント。名前が変わっても変わらないもの。`Stat` のある絞り込みの値を持ち主ごとに
  残せます）、`TitleCreators`（タイトルに書かれた作者。そのまま使われます）。

**Work** は作品で、`Pages`（読む順、index 0 から）と `Attachments`（ページではないファイル）を持ちます。ページの
`Width` / `Height` はサイトが教えるなら入れてください（分からなければ 0）。画像が届く前の見開きの組み方に使い、
分からないページは読み込んだあとに測ります。`Video` のページは再生されます。すべてのページに `Delay`（ミリ秒）が
あると、アニメーションのコマとして 1 ページで再生されます。アプリが読める書庫（zip / cbz / rar / 7z）の添付がある
作品をダウンロードするときは、取り込むものをユーザーが選び、中の画像と動画がページの後ろに加わります。

**Source** は、作品のファイルの取得先を答えます。ページ（`Kind` が `page`）、サムネイル（`thumb`。`Big` は作品ページ
用の大きい表紙。なければ小さいもの）、添付（`attachment`。`Index` は `Attachment.Index`）。`URL`・送る `Headers`
（`Referer` など）・`Ext` を返すと、取得・キャッシュ・保存はアプリが自分のタイムアウト・再試行・同時接続数で行います。
返したものの取得に失敗すると、アプリは `Retry` を付けてもう一度聞くので、古くなったかもしれないもの（期限切れの URL や
鍵）を捨てて答え直してください。ほかに `Fallback`（`URL` が 404 / 410 のときに取るもの）、`Entry`（`URL` の zip の中の
そのファイルがページ。zip は一度だけ取得）、`Crop`（`URL` の画像のその矩形がサムネイル）も返せます。

## 5. 任意の機能

どれもメソッド 1 つで、プラグインが持っていればアプリが使います。

| インターフェース | メソッド | アプリでの使われ方 |
| --- | --- | --- |
| `Suggester` | `Suggest(term)` | 検索欄の候補（`[{NS, Name, Count}]`） |
| `FavoritesLister` | `Favorites(q)` | お気に入り画面：`q.Tags`（`artist:x`・`group:y`）のどれかを持つ作品を新しい順に。`q.Exclude` のキーの作品は外す。`Info.Favorites.Own` のときは、`q.Tags` は選ばれた名前 1 つ（なしはすべて。`Scoped` なら先頭） |
| `FavoriteNamer` | `FavoriteNames()` | `Own` のとき、お気に入りの絞り込みに使う名前（`[{Tag, Name, NS, Bookmarks, Note, Parents, Parent, Open}]`）。ほかの名前の `Parents` になっているもの（リスト）や `Parent` のものは上に分けて並び、`Open` は独自の画面を開くボタンを付けます |
| `WebURLer` | `WebURL(id)` | サイトでの作品のページ（「サイトで開く」） |
| `URLReader` | `FromURL(url)` | コピーした URL から作品を追加：作品の id（作品でなければ `""`） |
| `TagNamer` | `TagNamesJa()` | `Translated` の namespace のタグの和名（`{"english": "日本語"}` の JSON。埋め込みファイルで十分）。1 度だけ聞かれます |
| `StatusTeller` | `Status()` | タブに出すサイトの状態（API の残り回数など、`[{Label, Value, Max, Note, Warn}]`） |
| `ViewHeaderer` | `ViewHeader(view, query)` | 独自の画面の作品の上に出すヘッダー：`{Owner, Title, Subtitle, Text, Image, Actions}`（なしは nil） |
| `ViewActioner` | `ViewAction(view, query, action)` | ヘッダーのボタン（`Actions[].ID`）を実行。返したメッセージが表示されます |

## 6. 画面の定義（BrowseSpec）

`Info.Browse` をもとに、アプリがサイトの画面を描きます。文はすべて言語ごとに（`{"ja": ..., "en": ...}`）。

- `Placeholder`：検索欄のヒント。
- `Filters`：一覧の上のドロップダウン。`In` は置き場所で、`browse`（既定）・`favorites`・独自の画面の id、または
  絞り込みではない設定の `settings`（アプリの設定画面に出て、`pluginsdk.Setting` で読む）。`Default` はユーザーが
  選ぶまでの値、`Multi` は複数選択（`,` 区切り。何も選ばないとすべて）、`OnSearch` は検索中に使う値。id が `type` の
  絞り込みは作品の種別の表示名と色も兼ねます（`Spread` の選択肢は漫画で、設定により見開きで開く）。`Stat` のある
  絞り込みはその数値の下限で、下回る作品はアプリが隠します。`Kind` が `text` の設定は 1 行の文字、`secret` は伏せ字
  （ログインの Cookie など）で、`Hint` が下に出ます。
- `Namespaces`：タグの種類（`female`・`artist` など）。表示名、♀ などの `Suffix`、CSS の `Color`、和名があるなら
  `Translated`。
- `Stats`：作品の数値（`{ID, Label, Icon}`。`Icon` は `heart` などアプリのアイコン名）。
- `Views`：サイトのタブに加わる独自の画面（`{ID, Label, Icon, Placeholder, Hint}`）。それぞれ入力欄を持ちます。
  `Namespaces` の種類（`artist` など）のリンクはその名前でこの画面を開き、`Aliases` の種類（表示名の `group` など）の
  リンクは、作品の `Namespaces` の先頭の種類の名前（id）で開きます。

## 7. 通信と値の保存

- `pluginsdk.Fetch(Request{URL, Headers})` はアプリを通して 1 回通信し、`pluginsdk.FetchMany` は複数をまとめて並行に
  （同時に 8 つまで）行います。プラグインは通信ごとに待つので、まとめられるものはまとめてください。
- GET、または `Method: "POST"` と `Body` の POST。`http(s)` の `Hosts` だけ。アプリが User-Agent・再試行・2 分の
  タイムアウトを付けます。`NoRetry` で再試行をなくせます（1 回ごとに数えるサイト向け）。
- 失敗した通信は、ステータス（応答がなければ 0）と、サイトのエラー応答の先頭（`Body`）を持つ `*pluginsdk.HTTPError` を
  返します。
- プラグインは自前のファイル・通信・タイマーを持ちません。アプリはプラグインを最大 4 つ同時に動かし、それぞれ 1 度に
  1 つの呼び出しを処理するので、グローバル変数はそれぞれ別で、高速化のためだけに使ってください。
- `pluginsdk.StoreSet` / `StoreGet` は、すべての同時実行から見える値を保存します（アプリのメモリ内。12 時間で期限切れ、
  20,000 件を超えると古いものから消える）。`pluginsdk.Cached(key, maxAge, fetch)` はその値を読むか、作り直します。
- `pluginsdk.Log(msg)` は `poruneko.log` に 1 行書きます。

## 8. 確かめ方

- プラグイン自身のコードは `go test` で。`pluginsdk.Handle(site, method, params)` で、アプリと同じように呼べます。
- アプリのチェックアウトで `PORUNEKO_PLUGIN_DIR=<.wasm のフォルダ> go test ./internal/plugin -run Installed` を実行すると、
  プラグインを読み込んで申告内容を表示します。`PORUNEKO_PLUGIN_LIVE=<id,...>` も付けると、サイトの一覧の 1 ページ目・
  作品・ページ・サムネイルも実際に取得します。
- アプリで：検索・絞り込み・ページ送りが動く、ページの多い作品が開いてページが読み込まれる、ブックマークして
  ダウンロードすると cbz ができる（サイトのフォルダの下）、しばらく経っても画像が読み込める（`Retry`）。
- `PORUNEKO_DEBUG=1` で画像の取得をすべてログに出します。プラグインのエラーと `pluginsdk.Log` の行は `poruneko.log` に
  出ます。
