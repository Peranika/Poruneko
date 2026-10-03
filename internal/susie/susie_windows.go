//go:build windows

// Package susie loads Susie 64-bit archive plug-ins (.sph, the "00AM" kind) and reads archives with them.
// It follows TORO's Susie 32bit / 64bit Plug-in specification: stdcall exports, the Unicode (W) functions when the
// plug-in has them and the ANSI ones otherwise, and the packed 64-bit fileInfo records.
//
// Plug-ins are native code running in the app's process: a broken plug-in can crash the app. Calls into one
// plug-in are made one at a time, as many plug-ins are not thread-safe.
package susie

import (
	"encoding/binary"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

var (
	kernel32            = syscall.NewLazyDLL("kernel32.dll")
	procLocalLock       = kernel32.NewProc("LocalLock")
	procLocalUnlock     = kernel32.NewProc("LocalUnlock")
	procLocalFree       = kernel32.NewProc("LocalFree")
	procLocalSize       = kernel32.NewProc("LocalSize")
	procRtlMoveMemory   = kernel32.NewProc("RtlMoveMemory")
	procMultiByteToWide = kernel32.NewProc("MultiByteToWideChar")
	procWideToMultiByte = kernel32.NewProc("WideCharToMultiByte")
)

const (
	pathMax = 200 // SUSIE_PATH_MAX
	// sizes of the packed 64-bit fileInfo records: method[8], position, compsize, filesize, timestamp (8 each),
	// path[200], filename[200], crc (4), dummy[4]
	infoSizeW = 8 + 8*4 + pathMax*2*2 + 4 + 4
	infoSizeA = 8 + 8*4 + pathMax*2 + 4 + 4
	// flag of GetFile: input from a disk file, output to memory (an HLOCAL)
	flagToMemory = 0x0100
)

// Entry is a file in an archive
type Entry struct {
	Name string // "/"-separated
	Pos  int64  // the position GetFile wants
	Size int64
}

// Plugin is a loaded Susie archive plug-in
type Plugin struct {
	Path        string
	Description string
	Extensions  []string // ".rar"

	mu         sync.Mutex
	unicode    bool
	info       *syscall.Proc
	supported  *syscall.Proc
	archive    *syscall.Proc
	getFile    *syscall.Proc
	headerSize int
}

// Load loads a .sph and checks that it is an archive plug-in
func Load(path string) (*Plugin, error) {
	dll, err := syscall.LoadDLL(path)
	if err != nil {
		return nil, err
	}
	p := &Plugin{Path: path, headerSize: 2048}
	find := func(name string) *syscall.Proc {
		if pr, err := dll.FindProc(name); err == nil {
			return pr
		}
		return nil
	}
	if p.info = find("GetPluginInfoW"); p.info != nil {
		p.unicode = true
		p.supported, p.archive, p.getFile = find("IsSupportedW"), find("GetArchiveInfoW"), find("GetFileW")
	}
	if p.info == nil || p.supported == nil || p.archive == nil || p.getFile == nil {
		p.unicode = false
		p.info, p.supported, p.archive, p.getFile = find("GetPluginInfo"), find("IsSupported"), find("GetArchiveInfo"), find("GetFile")
	}
	if p.info == nil || p.supported == nil || p.archive == nil || p.getFile == nil {
		_ = dll.Release()
		return nil, errors.New("not an archive plug-in (GetPluginInfo / IsSupported / GetArchiveInfo / GetFile missing)")
	}
	if kind := p.pluginInfo(0); !strings.HasSuffix(kind, "AM") {
		_ = dll.Release()
		return nil, fmt.Errorf("not an archive plug-in (%q)", kind)
	}
	p.Description = p.pluginInfo(1)
	// infono 2, 4, ...: the extensions ("*.rar;*.r00"), 3, 5, ...: their names
	for i := 2; i < 64; i += 2 {
		s := p.pluginInfo(i)
		if s == "" {
			break
		}
		for _, pat := range strings.Split(s, ";") {
			pat = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(pat), "*"))
			if strings.HasPrefix(pat, ".") && !strings.ContainsAny(pat, "*?") {
				p.Extensions = append(p.Extensions, strings.ToLower(pat))
			}
		}
	}
	if len(p.Extensions) == 0 {
		_ = dll.Release()
		return nil, errors.New("the plug-in lists no file extensions")
	}
	return p, nil
}

// pluginInfo calls GetPluginInfo(infono) ("" when there is no such entry)
func (p *Plugin) pluginInfo(n int) string {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.unicode {
		buf := make([]uint16, 512)
		r, _, _ := p.info.Call(uintptr(n), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
		if int(r) <= 0 {
			return ""
		}
		return syscall.UTF16ToString(buf[:min(int(r), len(buf))])
	}
	buf := make([]byte, 512)
	r, _, _ := p.info.Call(uintptr(n), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	if int(r) <= 0 {
		return ""
	}
	return fromANSI(buf[:min(int(r), len(buf))])
}

// Supports asks the plug-in whether it reads this file (from its name and the first bytes)
func (p *Plugin) Supports(path string) bool {
	head := make([]byte, p.headerSize+16) // zero-padded beyond the file's end, as the specification asks
	if f, err := os.Open(path); err == nil {
		_, _ = f.Read(head[:p.headerSize])
		f.Close()
	} else {
		return false
	}
	name, keep, err := p.name(path)
	if err != nil {
		return false
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	r, _, _ := p.supported.Call(name, uintptr(unsafe.Pointer(&head[0])))
	_ = keep
	return r != 0
}

// Entries lists the files in an archive
func (p *Plugin) Entries(path string) ([]Entry, error) {
	name, keep, err := p.name(path)
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	var h uintptr
	r, _, _ := p.archive.Call(name, 0, 0, uintptr(unsafe.Pointer(&h)))
	_ = keep
	if int32(r) != 0 || h == 0 {
		return nil, fmt.Errorf("GetArchiveInfo: error %d", int32(r))
	}
	defer procLocalFree.Call(h)
	data, err := readLocal(h)
	if err != nil {
		return nil, err
	}
	size := infoSizeA
	if p.unicode {
		size = infoSizeW
	}
	var out []Entry
	for off := 0; off < len(data) && data[off] != 0; off += size {
		if off+size > len(data) {
			break
		}
		rec := data[off : off+size]
		e := Entry{
			Pos:  int64(binary.LittleEndian.Uint64(rec[8:])),
			Size: int64(binary.LittleEndian.Uint64(rec[24:])),
		}
		var dir, file string
		if p.unicode {
			dir, file = utf16Field(rec[40:40+pathMax*2]), utf16Field(rec[40+pathMax*2:40+pathMax*4])
		} else {
			dir, file = fromANSI(cField(rec[40:40+pathMax])), fromANSI(cField(rec[40+pathMax:40+pathMax*2]))
		}
		full := strings.ReplaceAll(dir, `\`, "/")
		if full != "" && !strings.HasSuffix(full, "/") {
			full += "/"
		}
		e.Name = strings.TrimPrefix(full+strings.ReplaceAll(file, `\`, "/"), "/")
		if e.Name != "" && !strings.HasSuffix(e.Name, "/") {
			out = append(out, e)
		}
	}
	return out, nil
}

// Read extracts one file of an archive into memory
func (p *Plugin) Read(path string, e Entry) ([]byte, error) {
	name, keep, err := p.name(path)
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	var h uintptr
	r, _, _ := p.getFile.Call(name, uintptr(e.Pos), uintptr(unsafe.Pointer(&h)), flagToMemory, 0, 0)
	_ = keep
	if int32(r) != 0 || h == 0 {
		return nil, fmt.Errorf("GetFile %s: error %d", e.Name, int32(r))
	}
	defer procLocalFree.Call(h)
	b, err := readLocal(h)
	if err != nil {
		return nil, err
	}
	if e.Size > 0 && e.Size < int64(len(b)) {
		b = b[:e.Size]
	}
	return b, nil
}

// name makes the path argument (UTF-16 or ANSI); keep must stay referenced until the call returns
func (p *Plugin) name(path string) (uintptr, any, error) {
	if p.unicode {
		w, err := syscall.UTF16PtrFromString(path)
		if err != nil {
			return 0, nil, err
		}
		return uintptr(unsafe.Pointer(w)), w, nil
	}
	a, err := toANSI(path)
	if err != nil {
		return 0, nil, err
	}
	return uintptr(unsafe.Pointer(&a[0])), a, nil
}

// readLocal copies the memory of an HLOCAL
func readLocal(h uintptr) ([]byte, error) {
	size, _, _ := procLocalSize.Call(h)
	ptr, _, _ := procLocalLock.Call(h)
	if ptr == 0 {
		return nil, errors.New("LocalLock failed")
	}
	defer procLocalUnlock.Call(h)
	out := make([]byte, size)
	if size > 0 {
		procRtlMoveMemory.Call(uintptr(unsafe.Pointer(&out[0])), ptr, size)
	}
	return out, nil
}

func utf16Field(b []byte) string {
	u := make([]uint16, len(b)/2)
	for i := range u {
		u[i] = binary.LittleEndian.Uint16(b[i*2:])
		if u[i] == 0 {
			u = u[:i]
			break
		}
	}
	return string(utf16.Decode(u))
}

func cField(b []byte) []byte {
	for i, c := range b {
		if c == 0 {
			return b[:i]
		}
	}
	return b
}

// fromANSI converts text in the system code page
func fromANSI(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	n, _, _ := procMultiByteToWide.Call(0, 0, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)), 0, 0)
	if n == 0 {
		return string(b)
	}
	u := make([]uint16, n)
	procMultiByteToWide.Call(0, 0, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)), uintptr(unsafe.Pointer(&u[0])), n)
	return string(utf16.Decode(u))
}

// toANSI converts a path to the system code page (NUL-terminated); paths it cannot represent fail
func toANSI(s string) ([]byte, error) {
	w, err := syscall.UTF16FromString(s)
	if err != nil {
		return nil, err
	}
	var lossy int32
	n, _, _ := procWideToMultiByte.Call(0, 0, uintptr(unsafe.Pointer(&w[0])), uintptr(len(w)), 0, 0, 0, uintptr(unsafe.Pointer(&lossy)))
	if n == 0 || lossy != 0 {
		return nil, fmt.Errorf("the path cannot be passed to an ANSI plug-in: %s", filepath.Base(s))
	}
	b := make([]byte, n)
	procWideToMultiByte.Call(0, 0, uintptr(unsafe.Pointer(&w[0])), uintptr(len(w)), uintptr(unsafe.Pointer(&b[0])), n, 0, uintptr(unsafe.Pointer(&lossy)))
	return b, nil
}
