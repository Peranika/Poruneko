# Poruneko development

Notes for building, testing and releasing Poruneko. For what the app does, see [README.md](README.md).

## Requirements

- Go 1.26+
- Node.js
- [Wails CLI v2](https://wails.io/)

## Commands

```sh
wails dev                                        # dev mode (hot reload)
wails build -platform windows/amd64 -trimpath    # builds build/bin/Poruneko.exe
wails generate module                            # regenerate frontend/wailsjs after changing bound Go APIs
go test ./internal/...                           # unit tests
cd frontend && npx tsc --noEmit                  # type check the frontend
```

- Do not pass `-clean` to `wails build`. It deletes everything in `build/bin`, where the release zips and release notes are kept (the folder is not tracked by git).
- The exe cannot be replaced while the app is running ("Access is denied"). Close the app before building.

## Building on each platform

Only Windows builds are released. macOS and Linux builds work from source but are not tested regularly.
Wails cannot cross-compile, so build on the platform you target. `wails doctor` lists missing dependencies.

### Windows

WebView2 is included in Windows 10/11.

```sh
wails build -platform windows/amd64 -trimpath    # build/bin/Poruneko.exe
```

### macOS

Install the Xcode command line tools (`xcode-select --install`).

```sh
wails build -platform darwin/universal -trimpath  # build/bin/Poruneko.app (Intel and Apple silicon)
```

The app is not signed. A build made on your own Mac opens normally; a copy downloaded from elsewhere is blocked by Gatekeeper until you right-click it and choose Open.

### Linux

Install GTK 3 and WebKitGTK development packages, for example on Debian / Ubuntu:

```sh
sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
wails build -platform linux/amd64 -trimpath -tags webkit2_41   # build/bin/Poruneko
```

On distributions that still ship WebKitGTK 4.0 (`libwebkit2gtk-4.0-dev`), drop `-tags webkit2_41`.

### Differences on macOS / Linux

- **Updates**: the app tells you when a new version is released and links to the release page, but cannot install it (rebuild from source instead).
- **Window position**: not remembered between runs.
- **Data folder**: `~/Library/Application Support/Poruneko` on macOS and `~/.config/Poruneko` on Linux (`%AppData%\Poruneko` on Windows).

### Environment variables

| Variable | Effect |
| --- | --- |
| `PORUNEKO_DATA_DIR` | Use this folder instead of `%AppData%\Poruneko` for app data |
| `PORUNEKO_DEBUG=1` | Log every image request served by imgserver |
| `PORUNEKO_START_HIDDEN=1` | Start without showing the window (to operate it from the browser in dev mode) |

## Project layout

```
main.go                  Wails startup, logging, WebView2 data folder
app*.go                  APIs exposed to the frontend (viewing / bookmarks / series / favorites / settings / updates)
reveal_*.go, window_*.go,
lang_*.go                platform-specific parts (showing files in Explorer / Finder, saving the window position,
                         the OS display language)
internal/
  model/                 data types shared with the frontend (Wails generates the TS types)
  apperr/                errors shown in the UI: a code and parameters; the text comes from the frontend string tables
  netx/                  HTTP fetching with retries, TTL cache, singleflight
  site/                  abstraction of sites (Provider); sites come from plugins, the base app has none
  meta/                  creator info from DLsite / FANZA, fallbacks (pawchive, DuckDuckGo), title matching
  library/               the library folder: the user's archives as works (scan), reading archives (archive),
                         cbz storage for works from sites (locate / naming / comicinfo), page range works (range),
                         download queue (download), concurrency limits for sites (gate)
  imgserver/             serves /poru/img and /poru/thumb (local files first)
  store/                 persistence of settings (JSON) and bookmarks / series (SQLite)
  update/                finding a newer release on GitHub and replacing the exe (Windows only)
frontend/src/            React UI
  components/viewer/     viewer (spreads, page images, prefetching, predecoding)
  state.tsx              app state and routing (history entries)
  bookmarkList.ts        grouping, filtering and sorting of bookmarks (shared by the list and next/previous work)
  bookmarkActions.ts     download box actions (shared by the Bookmarks screen and the gallery page)
  series.ts              series ordering and name suggestions
  workSequence.ts        order of next/previous work
  keybindings.ts         key bindings
  labels.ts / storage.ts display names and choices / localStorage access
  i18n/                  string tables (ja.ts / en.ts) and t()
```

## Conventions

- **Language**: commit messages (subject and body) and code comments are written in English.
- **UI text**: all UI strings live in `frontend/src/i18n/ja.ts` and `en.ts`; `ja.ts` defines the shape and `en.ts` must match it. Go never returns UI text: errors are created with `apperr.New` / `apperr.Wrap` using a code that maps to `errors.<code>` in the string tables, and the English message is used for logs.
- **Logs** are written in English.
- **Line endings**: LF.

## Releasing

1. Update the version in `wails.json` (`info.productVersion`, which becomes the exe version info) and `frontend/package.json` (`npm version x.y.z --no-git-tag-version`).
2. Build and pack the exe as `build/bin/Poruneko-x.y.z-windows-amd64.zip` (the zip contains only `Poruneko.exe`).
3. Write `build/bin/RELEASE_NOTES-x.y.z.md`:
   - the heading `## Poruneko x.y.z` inside an HTML comment (`<!-- ## Poruneko x.y.z -->`), since the release title is already "Poruneko x.y.z"
   - English first, then Japanese (`English / [日本語](#japanese)` at the top, `<a id="japanese"></a>` before the Japanese part)
   - items start with Added / Changed / Fixed (追加 / 変更 / 修正), in that order, and only cover what users notice
4. Commit, tag `vx.y.z` (annotated, "Poruneko x.y.z") and push both.
5. Create the GitHub release from the tag, attach the zip **without renaming it**, and paste the release notes.

The in-app updater looks for an asset whose name ends with `-windows-amd64.zip` in the latest release and verifies it with the SHA256 digest GitHub records for the asset.
