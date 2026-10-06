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

### Android

The Android app (`android/`) is a WebView around the same Go backend and frontend. The Go program is built for
Android with `GOOS=android` (`main_android.go` instead of `main.go`): it serves the frontend, the API
(`internal/webapi`) and the images on 127.0.0.1, and the Android app runs it as a child process
(`libporuneko.so`). The frontend calls the backend through `frontend/src/backend.ts`, which uses the Wails
bindings when they are there and HTTP otherwise. What only the Android app can do (choosing a folder, the browser,
the clipboard, full screen, sign-in pages) the backend asks of it through `shell_android.go`.

Requirements: the Android SDK (platform 35) and NDK 29.0.14206865 (`sdkmanager "platforms;android-35"
"ndk;29.0.14206865"`), and JDK 17+ (Android Studio's `jbr` works). Write the SDK's folder in
`android/local.properties` (`sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`) or set `ANDROID_HOME`.

```sh
cd android
./gradlew assembleDebug                      # app/build/outputs/apk/debug/app-debug.apk (arm64 + x86_64)
./gradlew assembleDebug -Pabis=arm64-v8a     # phones only (half the size)
./gradlew assembleRelease                    # release build (signed with the debug key for now)
```

Gradle builds the frontend (`npm run build`) and the Go backend for each ABI itself. Plugins are the desktop's
`.wasm` files, unchanged: add them in Settings → Plugins (the app restarts the backend to load them), or put them
in `Android/data/io.github.peranika.poruneko/files/plugins` on the device (over USB, or
`adb push x.wasm /sdcard/Android/data/io.github.peranika.poruneko/files/plugins/`) and restart the app. The backend's
log goes to logcat (`adb logcat -s poruneko`) and to `poruneko.log` in the app's data. In a debug build the WebView
can be inspected from `chrome://inspect`.

Differences on Android:

- **Storage**: works are saved in `Android/data/io.github.peranika.poruneko/files/library` until another folder is
  chosen. Choosing a folder (a save location or a local folder) asks for access to all files first, as the backend
  opens files by path.
- **Downloads** go on in the background: while there are any, a foreground service with a notification keeps the
  app running (`busy` in `shell_android.go`, `BackgroundService.kt`).
- **SQLite** is the C library's (`mattn/go-sqlite3`, built with the NDK) instead of modernc's, which makes system
  calls that Android forbids (the app is killed with SIGSYS).
- **The back button** goes back in the app (closing a dialog first); with nothing to go back to, the app goes to the
  background.
- **Updates** come as a new APK: the app does not look for them.
- **The screen** is laid out for a phone below 760px wide (`@media (max-width: 760px)` in `style.css`,
  `useCompact`): the tabs are a bar along the bottom, the side panels (a work's info, the lists' groups) slide over the
  content, and the viewer shows one page at a time while the phone is held upright. On a touch screen
  (`<html data-touch>`, `useTouch`) the viewer turns pages by swiping, tapping the middle of the page shows its bar,
  and the buttons that hovering brings out are always shown. To work on it in a browser, run `wails dev` and open
  `http://127.0.0.1:34115` with the browser's device emulation (a phone's size and touch).

### Environment variables

| Variable | Effect |
| --- | --- |
| `PORUNEKO_DATA_DIR` | Use this folder instead of `%AppData%\Poruneko` for app data |
| `PORUNEKO_DEBUG=1` | Log every image request served by imgserver |
| `PORUNEKO_START_HIDDEN=1` | Start without showing the window (to operate it from the browser in dev mode) |
| `PORUNEKO_PLUGIN_DIR` | Look for plugins in this folder first, and add the plugins chosen in the settings there (the Android app sets it) |
| `PORUNEKO_LIBRARY_DIR` | Save works here until the user chooses a folder (the Android app sets it) |

## Project layout

```
main.go                  Wails startup, logging, WebView2 data folder
app*.go                  APIs exposed to the frontend (viewing / local folders / bookmarks / series / favorites / settings / updates;
                         app_sites.go: the sites' lists and screens, what their plugins tell, works from URLs, filter
                         values kept per owner)
reveal_*.go, window_*.go,
lang_*.go                platform-specific parts (showing files in Explorer / Finder, saving the window position,
                         the OS display language)
internal/
  model/                 data types shared with the frontend (Wails generates the TS types)
  apperr/                errors shown in the UI: a code and parameters; the text comes from the frontend string tables
  netx/                  HTTP fetching with retries, TTL cache
  site/                  abstraction of sites (Provider); sites come from plugins, the base app has none
  plugin/                runs plugins (.wasm) with wazero, and makes site plugins sites
  susie/                 Susie 64-bit archive plug-ins (.sph) for more archive formats (Windows)
  loginwin/              a window where the user signs in to a site, whose login cookies fill a plugin's settings
                         (WebView2, Windows; its own browser profile LoginWebView in the data folder)
  meta/                  creator info from DLsite / FANZA, fallbacks (pawchive, DuckDuckGo), title matching
  library/               the local folders' archives as works (scan), the sites' save locations, reading archives (archive),
                         cbz storage for works from sites (locate / naming / comicinfo), page range works (range),
                         download queue (download), concurrency limits for sites (gate)
  imgserver/             serves /poru/img and /poru/thumb (local files first)
  store/                 persistence of settings (JSON) and bookmarks / series / settings per owner of works (SQLite)
  update/                finding a newer release on GitHub and replacing the exe (Windows only)
pluginsdk/               the plugin side of the plugin interface (for plugins written in Go; spec.go: the types of a
                         site plugin's browse spec and login)
frontend/src/            React UI
  components/viewer/     viewer (spreads, page images and videos, prefetching, predecoding, moire reduction)
  state.tsx              app state and routing (history entries)
  bookmarkList.ts        grouping, filtering and sorting of bookmarks (shared by the list and next/previous work)
  bookmarkActions.ts     download box actions (shared by the Bookmarks screen and the gallery page)
  series.ts              series ordering and name suggestions
  workSequence.ts        order of next/previous work
  browseSpec.ts          what the site plugins' screens offer (filters, settings, kinds of tags)
  keybindings.ts         key bindings
  labels.ts / storage.ts display names and choices / localStorage access
  useDragReorder.ts      reordering by drag and drop (the sites and their screens in the sidebar)
  usePaneScroll.ts       the scroll position of the panes beside lists, kept across moves
  i18n/                  string tables (ja.ts / en.ts) and t()
```

## Plugins

Sites (and later more archive formats) come from plugins: WebAssembly modules (`.wasm`, WASI preview 1 reactors)
loaded at startup from a `plugins` folder next to the exe or in the data folder. The interface (exports, host
functions, JSON calls, the methods of a site plugin) is described in `internal/plugin` (plugin.go and site.go).
A plugin can fetch only through the host, and only from the hosts its info lists.

A site plugin's info also says what the app shows for it (its icon, filters, settings, kinds of tags, screens of
its own...), so nothing about a site is built into the app. A plugin written in Go uses `pluginsdk`;
`internal/plugin/testdata/testsite` is a minimal example (the plugin tests build it).

How to write one is in [PLUGINS.md](PLUGINS.md) (English and Japanese).

Archive formats other than cbz / zip come from Susie 64-bit archive plug-ins (`.sph`, Windows only) in the same
`plugins` folders: `internal/susie` calls them (TORO's 32bit / 64bit Plug-in specification) and
`internal/library` (formats.go) uses them through `ArchiveFormat`.

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
