package library

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/model"
	"poruneko/internal/netx"
	"poruneko/internal/site"
)

// Attachments of a work (archives) downloaded with it: their images and videos are added after its pages, so the
// saved work shows them. An attachment is kept in the work dir until the cbz is built, so a resumed download does
// not fetch it again

// attachmentStall is how long an attachment's download may go without data before it is given up
const attachmentStall = 2 * time.Minute

// attachmentsDir is the folder in the work dir with the attachments being downloaded
const attachmentsDir = "attachments"

// CanOpenArchive reports whether the app reads an archive of this name (zip / cbz itself, others through a format
// plugin such as a Susie archive plug-in)
func CanOpenArchive(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return ext == ".zip" || ext == ArchiveExt || formatFor(name) != nil
}

// attachmentPath is where an attachment of a work is kept while its download runs
func (l *Library) attachmentPath(key string, a model.Attachment) string {
	return filepath.Join(l.WorkDir(key), attachmentsDir, strconv.Itoa(a.Index)+strings.ToLower(filepath.Ext(a.Name)))
}

// media are the images and videos of an attachment, in reading order: their names, a reader of each, and what to
// do once they are read (close the archive)
type media struct {
	names []string
	read  func(i int) ([]byte, error)
	done  func()
}

// archiveMedia lists the images and videos in an archive
func archiveMedia(path string) (media, error) {
	if f := formatFor(path); f != nil {
		a, err := openPlugin(path, f)
		if err != nil {
			return media{}, err
		}
		m := media{
			read: func(i int) ([]byte, error) { return f.Read(path, a.pages[i]) },
			// closed after (the work dir is removed once the cbz is built)
			done: func() { closeHeld(path) },
		}
		for _, e := range a.pages {
			m.names = append(m.names, e.Name)
		}
		return m, nil
	}
	rc, err := zip.OpenReader(path)
	if err != nil {
		return media{}, err
	}
	var files []*zip.File
	for _, f := range rc.File {
		if isPageEntry(f.Name) {
			files = append(files, f)
		}
	}
	slices.SortStableFunc(files, func(a, b *zip.File) int { return naturalCompare(a.Name, b.Name) })
	m := media{read: func(i int) ([]byte, error) { return readFile(files[i]) }, done: func() { rc.Close() }}
	for _, f := range files {
		m.names = append(m.names, f.Name)
	}
	return m, nil
}

// keptDir is where the pages an attachment gave a saved work wait while the work is rebuilt with another choice
// (so the attachment is not downloaded again); files are named "<order>_<page name>"
func (l *Library) keptDir(key string, index int) string {
	return filepath.Join(l.WorkDir(key), attachmentsDir, strconv.Itoa(index)+".pages")
}

// keptMedia lists the pages kept for an attachment (keptDir); ok is false when there are none
func keptMedia(dir string) (m media, ok bool) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return media{}, false
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && !strings.HasSuffix(e.Name(), ".part") {
			files = append(files, e.Name())
		}
	}
	slices.Sort(files)
	m = media{read: func(i int) ([]byte, error) { return os.ReadFile(filepath.Join(dir, files[i])) }, done: func() {}}
	for _, f := range files {
		_, name, _ := strings.Cut(f, "_")
		m.names = append(m.names, name)
	}
	return m, true
}

// attachmentMedia are the images and videos of an attachment of a work: the pages it gave the work before it was
// chosen again, else those in the archive (downloaded if it is not there yet)
func (l *Library) attachmentMedia(ctx context.Context, p site.Provider, id, key string, a model.Attachment) (media, error) {
	if m, ok := keptMedia(l.keptDir(key, a.Index)); ok {
		return m, nil
	}
	path := l.attachmentPath(key, a)
	if err := fetchAttachment(ctx, p, id, a.Index, path); err != nil {
		return media{}, apperr.Wrap(err, "download.attachmentFailed", fmt.Sprintf("failed to download %s", a.Name), "name", a.Name)
	}
	m, err := archiveMedia(path)
	if err != nil {
		return media{}, unreadable(a, err)
	}
	return m, nil
}

func unreadable(a model.Attachment, err error) error {
	return apperr.Wrap(err, "download.attachmentUnreadable", fmt.Sprintf("cannot read %s", a.Name), "name", a.Name)
}

// addAttachments lays out the pages of a work downloaded with attachments: its own pages (when chosen), then the
// images and videos of each chosen archive, which are saved in the work dir as pages. Returns the work with those
// pages, and the choice with where they are (Planned: how many at its head are the site's, how many each attachment
// gave)
func (l *Library) addAttachments(ctx context.Context, p site.Provider, id, key string, d *model.GalleryDetail, c model.DownloadChoice) (*model.GalleryDetail, *model.DownloadChoice, error) {
	out := *d
	out.Pages = nil
	if c.Pages {
		out.Pages = slices.Clone(d.Pages)
	}
	c.Planned, c.SitePages, c.Counts = true, len(out.Pages), make([]int, len(c.Attachments))
	for k, index := range c.Attachments {
		i := slices.IndexFunc(d.Attachments, func(a model.Attachment) bool { return a.Index == index })
		if i < 0 {
			continue // no longer on the site
		}
		a := d.Attachments[i]
		m, err := l.attachmentMedia(ctx, p, id, key, a)
		if err != nil {
			return nil, nil, err
		}
		c.Counts[k] = len(m.names)
		for j, name := range m.names {
			at := len(out.Pages)
			ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
			// written every time: a page saved while viewing the site's pages may be in this place (in any format)
			b, err := m.read(j)
			if err == nil {
				l.removeWorkPage(key, at)
				err = l.SavePage(key, at, ext, b)
			}
			if err != nil {
				m.done()
				return nil, nil, unreadable(a, err)
			}
			out.Pages = append(out.Pages, model.PageInfo{Index: at, Name: filepath.Base(name), Video: IsVideoExt(ext)})
		}
		m.done()
	}
	if len(out.Pages) == 0 {
		return nil, nil, apperr.New("download.nothingChosen", "nothing to download")
	}
	out.PageCount = len(out.Pages)
	return &out, &c, nil
}

// Rechoose prepares a saved work to be built again with another choice of what to keep: the pages the new choice
// keeps are taken out of its cbz into the work dir (the site's pages to their places, an attachment's to keptDir),
// then the cbz is removed. The download that follows builds the new cbz, fetching only what was not kept. A nil
// choice is the work's pages alone
func (l *Library) Rechoose(key string, old, next *model.DownloadChoice) error {
	if l.ArchivePath(key) == "" || !Owned(key) {
		return apperr.New("download.notDownloaded", "not downloaded yet")
	}
	info := l.LocalInfo(key)
	if info == nil {
		return apperr.New("library.noInfo", "gallery info is missing")
	}
	if old == nil || !old.Planned {
		old = &model.DownloadChoice{Pages: true, SitePages: len(info.Pages)}
	}
	// takeOut copies page i of the saved work to the file named by path (given the page's format)
	takeOut := func(i int, path func(ext string) string) error {
		b, ext, ok := l.ReadPage(key, i)
		if !ok {
			return fmt.Errorf("page %d is missing", i+1)
		}
		return writeAtomic(path(ext), b)
	}
	work := l.WorkDir(key)
	if next.WithPages() && old.Pages {
		for i := range old.SitePages {
			if err := takeOut(i, func(ext string) string { return filepath.Join(work, pageBase(i)+"."+ext) }); err != nil {
				return err
			}
		}
	}
	// the attachments' pages follow the site's, each attachment's together (known only when their counts were kept)
	if len(old.Counts) == len(old.Attachments) {
		at := old.SitePages
		for k, index := range old.Attachments {
			n := old.Counts[k]
			if next.Takes(index) {
				dir := l.keptDir(key, index)
				for j := range n {
					name := ""
					if at+j < len(info.Pages) {
						name = info.Pages[at+j].Name
					}
					err := takeOut(at+j, func(ext string) string {
						if !strings.EqualFold(strings.TrimPrefix(filepath.Ext(name), "."), ext) {
							name += "." + ext
						}
						return filepath.Join(dir, pageBase(j)+"_"+name)
					})
					if err != nil {
						return err
					}
				}
			}
			at += n
		}
	}
	return l.removeArchive(key)
}

// removeWorkPage deletes a page from the work dir, in whatever format it is there
func (l *Library) removeWorkPage(key string, index int) {
	for p := l.workPage(key, index); p != ""; p = l.workPage(key, index) {
		if os.Remove(p) != nil {
			return
		}
	}
}

// fetchAttachment saves an attachment of a work at path (nothing to do when it is there). It is written as it comes
// (an archive can be large), and fetched again from the start after a failure
func fetchAttachment(ctx context.Context, p site.Provider, id string, index int, path string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	src, ok := p.(site.AttachmentSource)
	if !ok {
		return errors.New("the site has no attachments")
	}
	var last error
	for attempt := range 3 {
		if attempt > 0 {
			select {
			case <-time.After(time.Duration(5*attempt) * time.Second):
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		// asked each time: the site's URL may expire
		at, err := src.Attachment(ctx, id, index)
		if err == nil {
			err = saveURL(ctx, at.URL, at.Headers, path)
		}
		if err == nil || ctx.Err() != nil {
			return err
		}
		last = err
		if he, ok := err.(*netx.HTTPError); ok && he.Status < 500 && he.Status != http.StatusTooManyRequests {
			p.Invalidate()
		}
	}
	return last
}

// saveURL writes what is at url to path (through a temporary file, so a broken transfer leaves nothing)
func saveURL(ctx context.Context, url string, headers map[string]string, path string) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	req, err := netx.NewRequest(ctx, url)
	if err != nil {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	// a server that does not answer is given up too
	answer := time.AfterFunc(attachmentStall, cancel)
	res, err := netx.Client().Do(req)
	answer.Stop()
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return &netx.HTTPError{Status: res.StatusCode, URL: url}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	// as long as it takes while data comes; given up when nothing comes for a while
	body, stop := netx.StallReader(res.Body, attachmentStall, cancel)
	_, err = io.Copy(f, body)
	stop()
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Rename(tmp, path)
	}
	if err != nil {
		os.Remove(tmp)
	}
	return err
}
