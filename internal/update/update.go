// Package update finds a newer version in the GitHub releases and updates by replacing the exe.
//
// A running exe cannot be overwritten but can be renamed, so the current exe is renamed to .old,
// the new exe is put in its place and started, and the current app quits. .old is removed on the next start.
//
// Only Windows builds are released, so other platforms are only told that a new version exists.
package update

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/netx"
)

// Repo is the GitHub repository that hosts the releases
const Repo = "Peranika/Poruneko"

// assetSuffix is the end of the released zip's name (Poruneko-x.y.z-windows-amd64.zip)
const assetSuffix = "-windows-amd64.zip"

// Release describes a newer version
type Release struct {
	Version string `json:"version"` // "0.4.0" (without the leading v)
	Notes   string `json:"notes"`   // release notes (Markdown)
	URL     string `json:"url"`     // the GitHub release page
	// CanInstall reports whether it can be installed from the app (Windows only; elsewhere the user builds it)
	CanInstall bool `json:"canInstall"`
	// asset is the released zip (download URL and SHA256)
	assetURL string
	sha256   string
}

type ghRelease struct {
	TagName    string `json:"tag_name"`
	Body       string `json:"body"`
	HTMLURL    string `json:"html_url"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
	Assets     []struct {
		Name   string `json:"name"`
		URL    string `json:"browser_download_url"`
		Digest string `json:"digest"` // "sha256:…"
	} `json:"assets"`
}

var headers = map[string]string{"Accept": "application/vnd.github+json"}

// Latest fetches the latest release. nil if it is not newer than current
func Latest(ctx context.Context, current string) (*Release, error) {
	res, err := netx.Get(ctx, "https://api.github.com/repos/"+Repo+"/releases/latest", &netx.Opts{Headers: headers, Timeout: 20 * time.Second})
	if err != nil {
		return nil, apperr.Wrap(err, "update.checkFailed", "failed to check for updates")
	}
	var r ghRelease
	if err := json.Unmarshal(res.Body, &r); err != nil {
		return nil, apperr.Wrap(err, "update.checkFailed", "failed to check for updates")
	}
	v := strings.TrimPrefix(r.TagName, "v")
	if r.Draft || r.Prerelease || Compare(v, current) <= 0 {
		return nil, nil
	}
	rel := &Release{Version: v, Notes: r.Body, URL: r.HTMLURL}
	for _, a := range r.Assets {
		if strings.HasSuffix(a.Name, assetSuffix) {
			rel.assetURL = a.URL
			rel.sha256 = strings.TrimPrefix(a.Digest, "sha256:")
		}
	}
	if runtime.GOOS != "windows" {
		return rel, nil
	}
	if rel.assetURL == "" {
		return nil, nil // the zip has not been uploaded yet
	}
	rel.CanInstall = true
	return rel, nil
}

// Compare compares versions ("1.2.3") (positive if a is newer). Non-numeric parts count as 0
func Compare(a, b string) int {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < max(len(pa), len(pb)); i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			return x - y
		}
	}
	return 0
}

// Install downloads the newer version, verifies its SHA256 and replaces the current exe.
// On success it starts the new exe (the caller quits the current app afterwards).
func Install(ctx context.Context, rel *Release, progress func(done, total int64)) error {
	exe, err := os.Executable()
	if err != nil {
		return apperr.Wrap(err, "update.failed", "update failed")
	}
	exe, _ = filepath.EvalSymlinks(exe)
	if err := replace(ctx, rel, exe, progress); err != nil {
		return err
	}
	if err := exec.Command(exe).Start(); err != nil {
		return apperr.Wrap(err, "update.restartFailed", "updated, but failed to restart")
	}
	return nil
}

// replace downloads the newer version, verifies its SHA256 and replaces the exe (does not start it)
func replace(ctx context.Context, rel *Release, exe string, progress func(done, total int64)) error {
	if rel == nil || !rel.CanInstall || rel.assetURL == "" {
		return apperr.New("update.noAsset", "the release has no download")
	}
	if rel.sha256 == "" {
		// never use a file that cannot be verified
		return apperr.New("update.noChecksum", "the download has no checksum")
	}
	body, err := download(ctx, rel.assetURL, progress)
	if err != nil {
		return apperr.Wrap(err, "update.downloadFailed", "failed to download the update")
	}
	sum := sha256.Sum256(body)
	if !strings.EqualFold(hex.EncodeToString(sum[:]), rel.sha256) {
		return apperr.New("update.checksumMismatch", "the downloaded file does not match its checksum")
	}
	newExe, err := extractExe(body)
	if err != nil {
		return apperr.Wrap(err, "update.failed", "update failed")
	}

	// write the new exe next to the old one, then swap them (restore the old one on failure)
	next, old := exe+".new", exe+".old"
	_ = os.Remove(old)
	if err := os.WriteFile(next, newExe, 0o755); err != nil {
		return apperr.Wrap(err, "update.writeFailed", "cannot write the new version next to the app")
	}
	if err := os.Rename(exe, old); err != nil {
		_ = os.Remove(next)
		return apperr.Wrap(err, "update.writeFailed", "cannot replace the app")
	}
	if err := os.Rename(next, exe); err != nil {
		_ = os.Rename(old, exe)
		_ = os.Remove(next)
		return apperr.Wrap(err, "update.writeFailed", "cannot replace the app")
	}
	return nil
}

// Cleanup removes files left by the previous update (.old / .new) (at startup)
func Cleanup() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	for _, p := range []string{exe + ".old", exe + ".new"} {
		_ = os.Remove(p)
	}
}

func download(ctx context.Context, url string, progress func(done, total int64)) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	req, err := netx.NewRequest(ctx, url)
	if err != nil {
		return nil, err
	}
	res, err := netx.Client().Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", res.StatusCode)
	}
	var buf bytes.Buffer
	total := res.ContentLength
	chunk := make([]byte, 256<<10)
	for {
		n, err := res.Body.Read(chunk)
		buf.Write(chunk[:n])
		if progress != nil {
			progress(int64(buf.Len()), total)
		}
		if err == io.EOF {
			return buf.Bytes(), nil
		}
		if err != nil {
			return nil, err
		}
	}
}

// extractExe extracts the exe from the zip
func extractExe(zipData []byte) ([]byte, error) {
	zr, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		return nil, err
	}
	for _, f := range zr.File {
		if strings.EqualFold(filepath.Ext(f.Name), ".exe") {
			r, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer r.Close()
			return io.ReadAll(r)
		}
	}
	return nil, errors.New("no exe in the zip")
}
