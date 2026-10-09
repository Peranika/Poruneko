# Poruneko

English / [日本語](#japanese)

A viewer for the comic archives (cbz / zip / rar / 7z) on your computer, made mainly with Claude Code.

## Getting started

1. Download `Poruneko-x.y.z-windows-amd64.zip` from [Releases](https://github.com/Peranika/Poruneko/releases)
2. Extract it anywhere and run `Poruneko.exe` (requires Windows 10/11 with WebView2)
3. Press + in the sidebar (or add a folder in Settings): each folder becomes a tab listing its cbz / zip / rar / 7z files (subfolders included)
4. When a new version is released, a notice appears at the bottom right and you can update from it

macOS and Linux are not distributed as builds, but you can build the app yourself (untested; see [DEVELOPMENT.md](DEVELOPMENT.md#building-on-each-platform)).

## Features

### Library
- Each folder you add becomes a tab, with the name and icon you choose (built-in icons, or images you put in the icons folder)
- Every cbz / zip / rar / 7z (cbr / cb7) in it becomes a work: the title and creators come from ComicInfo.xml or the file name (`[Group (Artist)] Title`)
- Each subfolder becomes a series automatically (works in file name order; new files join it)
- Local tags, series and creator info can be set on every work (bookmarks are for works from site plugins)
- Site plugins (.wasm) add a tab for each site below the folders: hovering shows its list, bookmarks and Favorites, and clicking opens the one used last. Each site has its own bookmarks and save location
- Archives with any page names or nested folders are read in natural order
- More archive formats (lzh, etc.) with Susie 64-bit archive plug-ins (.sph) put in a `plugins` folder next to `Poruneko.exe`
- Your files are only read: Poruneko never renames, rewrites or deletes them. Removing a work only takes it out of the library
- Rescan at any time; works whose file is gone leave the library (with series left empty). When a whole folder cannot be read (a disconnected drive), its works are only marked and recover when it is back

### Read
- Single page / two-page spread / vertical scroll, right-to-left and left-to-right, full screen
- The mode is remembered for each work; optionally open manga and doujinshi in spreads
- Shift a spread by one page, turn pages with the mouse wheel
- Slideshow, optionally adjusting the time to how much is on each page, with the time left as a clock or a progress bar
- Go to the next / previous work without returning to the list
- Custom key bindings and mouse gestures

### Organize
- Group works by group or artist
- Add your own tags and filter by them
- Group sequels into series and order them freely
- Look up artist and group names on DLsite and FANZA Doujin for a work
- Choose the page and area used as a work's thumbnail, or give it your own title
- Shuffle play and a history of the works you opened

## Data locations

- Settings: `%AppData%\Poruneko\settings.json`
- Library records (tags, series, etc.): `%AppData%\Poruneko\bookmarks.db`
- Site plugins' downloads: `%AppData%\Poruneko\library\<site>\` by default (changeable for each site in Settings)
- Tab icons you add: `%AppData%\Poruneko\icons\`
- Thumbnails: `%AppData%\Poruneko\thumbs\`
- Browser data (WebView2): `%AppData%\Poruneko\EBWebView\`
- Log: `%AppData%\Poruneko\poruneko.log`

## Development

Building from source, the project layout and the release process are described in [DEVELOPMENT.md](DEVELOPMENT.md); how to write a site plugin is in [PLUGINS.md](PLUGINS.md).

---

<a id="japanese"></a>

パソコンにある漫画のアーカイブ（cbz / zip / rar / 7z）を読むためのビューア。主に Claude Code で作成

## 使い始める

1. [Releases](https://github.com/Peranika/Poruneko/releases) から `Poruneko-x.y.z-windows-amd64.zip` をダウンロード
2. 好きな場所に展開して `Poruneko.exe` を実行（Windows 10/11、WebView2 が必要）
3. サイドバーの ＋（または設定画面）でフォルダを追加すると、フォルダごとにタブができ、中の cbz / zip / rar / 7z（サブフォルダも含む）が並ぶ
4. 新しい版が出ると右下に通知が出て、そこから更新できる

macOS・Linux 向けのビルド済みファイルは配布していないが、自分でビルドすれば使える（動作未確認。[DEVELOPMENT.md](DEVELOPMENT.md#building-on-each-platform) を参照）。

## できること

### ライブラリ
- 追加したフォルダはそれぞれタブになり、名前とアイコンを選べる（用意したアイコンのほか、アイコンのフォルダに置いた画像も使える）
- フォルダの中の cbz / zip / rar / 7z（cbr / cb7）が、そのまま作品になる。タイトルと作者は ComicInfo.xml かファイル名（`[サークル (作者)] タイトル`）から読む
- サブフォルダは自動でシリーズになる（ファイル名順。あとから増えたファイルも加わる）
- ローカルタグ・シリーズ・作者情報はどの作品にも付けられる（ブックマークはサイトプラグインの作品用）
- サイトプラグイン（.wasm）を入れると、フォルダのタブの下にサイトごとのタブが加わる。カーソルを乗せると一覧・ブックマーク・お気に入りが出て、押すと前回開いていたものが開く。ブックマークと保存先はサイトごと
- ページの名前やフォルダ分けが自由なアーカイブも、自然な順番で読める
- Susie 64bit 書庫プラグイン（.sph）を `Poruneko.exe` の横の `plugins` フォルダに置くと、lzh などほかの形式も読める
- 自分のファイルは読むだけで、名前の変更・書き換え・削除は一切しない。作品を外してもライブラリから外れるだけ
- いつでも読み込み直せる。ファイルが無くなった作品はライブラリから消え、作品が無くなったシリーズも消える。フォルダごと読めないとき（外付けドライブを外したときなど）は印が付くだけで、戻すと元に戻る

### 読む
- 単ページ／見開き／縦スクロール、右綴じ・左綴じ、全画面表示
- 表示の仕方は作品ごとに記憶。漫画・同人誌を見開きで開く設定もある
- 見開きの 1 枚ずらし、ホイールでのページ送り
- スライドショー（ページの情報量に合わせて秒数を調節することもできる。残り時間は時計か進行バーで表示）
- 一覧に戻らずに次／前の作品へ移れる
- キー割り当ての変更とマウスジェスチャ

### 整理する
- サークル別・作者別に分類
- 自分でタグを付け、タグで絞り込める
- 連番作品などをシリーズにまとめ、好きな順に並べる
- 作者・サークル名を DLsite や FANZA 同人で調べられる
- サムネイルにするページと範囲や、自分で付けたタイトルを設定できる
- シャッフル再生と、開いた作品の履歴

## データの保存先

- 設定: `%AppData%\Poruneko\settings.json`
- ライブラリの記録（タグ・シリーズなど）: `%AppData%\Poruneko\bookmarks.db`
- サイトプラグインのダウンロード: 既定は `%AppData%\Poruneko\library\<サイト>\`（設定でサイトごとに変更できる）
- 追加したタブのアイコン: `%AppData%\Poruneko\icons\`
- サムネイル: `%AppData%\Poruneko\thumbs\`
- ブラウザのデータ（WebView2）: `%AppData%\Poruneko\EBWebView\`
- ログ: `%AppData%\Poruneko\poruneko.log`

## 開発

ソースからのビルド方法、ソースの構成、リリースの手順は [DEVELOPMENT.md](DEVELOPMENT.md) にまとめている（英語）。サイトプラグインの作り方は [PLUGINS.md](PLUGINS.md#japanese) にある（日本語あり）。
