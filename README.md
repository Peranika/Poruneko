# Poruneko

English / [日本語](#japanese)

A viewer for the comic archives (cbz / zip) on your computer, made mainly with Claude Code.

## Getting started

1. Download `Poruneko-x.y.z-windows-amd64.zip` from [Releases](https://github.com/Peranika/Poruneko/releases)
2. Extract it anywhere and run `Poruneko.exe` (requires Windows 10/11 with WebView2)
3. Choose your library folder in Settings; the cbz / zip files in it (subfolders included) appear as works
4. When a new version is released, a notice appears at the bottom right and you can update from it

macOS and Linux are not distributed as builds, but you can build the app yourself (untested; see [DEVELOPMENT.md](DEVELOPMENT.md#building-on-each-platform)).

## Features

### Library
- Every cbz / zip in the library folder becomes a work: the title and creators come from ComicInfo.xml or the file name (`[Circle (Artist)] Title`)
- Archives with any page names or nested folders are read in natural order
- More archive formats (rar, 7z, etc.) with Susie 64-bit archive plug-ins (.sph) put in a `plugins` folder next to `Poruneko.exe`
- Your files are only read: Poruneko never renames, rewrites or deletes them. Removing a work only takes it out of the library
- Rescan at any time; missing files are marked and recover when they are back

### Read
- Single page / two-page spread / vertical scroll, right-to-left and left-to-right, full screen
- The mode is remembered for each work; optionally open manga and doujinshi in spreads
- Shift a spread by one page, turn pages with the mouse wheel
- Slideshow, optionally adjusting the time to how much is on each page, with the time left as a clock or a progress bar
- Go to the next / previous work without returning to the list
- Custom key bindings and mouse gestures

### Organize
- Group works by circle or artist
- Add your own tags and filter by them
- Group sequels into series and order them freely
- Look up artist and circle names on DLsite and FANZA Doujin for a work
- Choose the page and area used as a work's thumbnail, or give it your own title
- Shuffle play and a history of the works you opened

## Data locations

- Settings: `%AppData%\Poruneko\settings.json`
- Library records (tags, series, etc.): `%AppData%\Poruneko\bookmarks.db`
- Library folder: `%AppData%\Poruneko\library\` by default (changeable in Settings)
- Thumbnails: `%AppData%\Poruneko\thumbs\`
- Browser data (WebView2): `%AppData%\Poruneko\EBWebView\`
- Log: `%AppData%\Poruneko\poruneko.log`

## Development

Building from source, the project layout and the release process are described in [DEVELOPMENT.md](DEVELOPMENT.md).

---

<a id="japanese"></a>

パソコンにある漫画のアーカイブ（cbz / zip）を読むためのビューア。主に Claude Code で作成

## 使い始める

1. [Releases](https://github.com/Peranika/Poruneko/releases) から `Poruneko-x.y.z-windows-amd64.zip` をダウンロード
2. 好きな場所に展開して `Poruneko.exe` を実行（Windows 10/11、WebView2 が必要）
3. 設定画面でライブラリのフォルダを選ぶと、中の cbz / zip（サブフォルダも含む）が作品として並ぶ
4. 新しい版が出ると右下に通知が出て、そこから更新できる

macOS・Linux 向けのビルド済みファイルは配布していないが、自分でビルドすれば使える（動作未確認。[DEVELOPMENT.md](DEVELOPMENT.md#building-on-each-platform) を参照）。

## できること

### ライブラリ
- ライブラリのフォルダにある cbz / zip が、そのまま作品になる。タイトルと作者は ComicInfo.xml かファイル名（`[サークル (作者)] タイトル`）から読む
- ページの名前やフォルダ分けが自由なアーカイブも、自然な順番で読める
- Susie 64bit 書庫プラグイン（.sph）を `Poruneko.exe` の横の `plugins` フォルダに置くと、rar・7z などの形式も読める
- 自分のファイルは読むだけで、名前の変更・書き換え・削除は一切しない。作品を外してもライブラリから外れるだけ
- いつでも読み込み直せる。無くなったファイルには印が付き、戻すと元に戻る

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
- ライブラリのフォルダ: 既定は `%AppData%\Poruneko\library\`（設定で変更できる）
- サムネイル: `%AppData%\Poruneko\thumbs\`
- ブラウザのデータ（WebView2）: `%AppData%\Poruneko\EBWebView\`
- ログ: `%AppData%\Poruneko\poruneko.log`

## 開発

ソースからのビルド方法、ソースの構成、リリースの手順は [DEVELOPMENT.md](DEVELOPMENT.md) にまとめている（英語）。
