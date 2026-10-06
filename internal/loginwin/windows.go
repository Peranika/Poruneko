//go:build windows

package loginwin

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"runtime"
	"sync"
	"syscall"
	"unsafe"

	"github.com/wailsapp/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

// The window runs on a thread of its own with its own message loop: WebView2 calls back on the thread that made it.
// The cookies are read every second (GetCookies answers through a callback on that thread) and the window closes
// itself once they have been there in their signed-in form twice in a row, so a login still being written is not
// taken half done.

var (
	user32               = windows.NewLazySystemDLL("user32.dll")
	procRegisterClassEx  = user32.NewProc("RegisterClassExW")
	procCreateWindowEx   = user32.NewProc("CreateWindowExW")
	procDefWindowProc    = user32.NewProc("DefWindowProcW")
	procDestroyWindow    = user32.NewProc("DestroyWindow")
	procShowWindow       = user32.NewProc("ShowWindow")
	procSetForeground    = user32.NewProc("SetForegroundWindow")
	procPostQuitMessage  = user32.NewProc("PostQuitMessage")
	procGetMessage       = user32.NewProc("GetMessageW")
	procTranslateMessage = user32.NewProc("TranslateMessage")
	procDispatchMessage  = user32.NewProc("DispatchMessageW")
	procSetTimer         = user32.NewProc("SetTimer")
	procKillTimer        = user32.NewProc("KillTimer")
	procLoadCursor       = user32.NewProc("LoadCursorW")
	procLoadIcon         = user32.NewProc("LoadIconW")
	procGetDpiForSystem  = user32.NewProc("GetDpiForSystem")
)

const (
	wmDestroy = 0x0002
	wmSize    = 0x0005
	wmClose   = 0x0010
	wmTimer   = 0x0113

	wsOverlappedWindow = 0x00CF0000
	cwUseDefault       = 0x80000000
	swShow             = 5
	idcArrow           = 32512
	timerID            = 1
)

type wndClassEx struct {
	size       uint32
	style      uint32
	wndProc    uintptr
	clsExtra   int32
	wndExtra   int32
	instance   windows.Handle
	icon       windows.Handle
	cursor     windows.Handle
	background windows.Handle
	menuName   *uint16
	className  *uint16
	iconSm     windows.Handle
}

type msg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      struct{ x, y int32 }
	private uint32
}

// session is the login window that is open (one at a time)
type session struct {
	ctx      context.Context
	opts     Options
	hwnd     uintptr
	chromium *edge.Chromium
	cookies  *edge.ICoreWebView2CookieManager
	ready    bool
	pending  bool // a GetCookies has not answered yet
	seen     bool // the last answer had every cookie
	result   map[string]string
}

var (
	mu        sync.Mutex
	current   *session
	setupOnce sync.Once
	className *uint16
	wndProc   uintptr
	handler   *cookiesHandler
)

// Supported reports whether login windows can be opened here
func Supported() bool { return true }

// Run opens the login window and waits until the user has signed in (the cookies, by name) or closed it
func Run(ctx context.Context, o Options) (map[string]string, error) {
	if u, err := url.Parse(o.URL); err != nil || u.Scheme != "https" {
		return nil, fmt.Errorf("not an https URL: %q", o.URL)
	}
	if o.CookieURL == "" {
		o.CookieURL = o.URL
	}
	mu.Lock()
	if current != nil {
		mu.Unlock()
		return nil, ErrBusy
	}
	s := &session{ctx: ctx, opts: o}
	current = s
	mu.Unlock()
	defer func() {
		mu.Lock()
		current = nil
		mu.Unlock()
	}()

	done := make(chan error, 1)
	go func() { done <- s.run() }()
	if err := <-done; err != nil {
		return nil, err
	}
	if s.result == nil {
		return nil, ErrClosed
	}
	return s.result, nil
}

// run makes the window and runs its message loop until it is destroyed
func (s *session) run() error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if err := windows.CoInitializeEx(0, windows.COINIT_APARTMENTTHREADED); err != nil {
		return fmt.Errorf("COM: %w", err)
	}
	defer windows.CoUninitialize()
	setupOnce.Do(setup)

	var instance windows.Handle
	_ = windows.GetModuleHandleEx(0, nil, &instance)
	title, _ := windows.UTF16PtrFromString(s.opts.Title)
	w, h := scaled(560), scaled(760)
	hwnd, _, err := procCreateWindowEx.Call(0, uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(title)),
		wsOverlappedWindow, cwUseDefault, cwUseDefault, uintptr(w), uintptr(h), 0, 0, uintptr(instance), 0)
	if hwnd == 0 {
		return fmt.Errorf("CreateWindowEx: %w", err)
	}
	s.hwnd = hwnd
	procShowWindow.Call(hwnd, swShow)
	procSetForeground.Call(hwnd)

	c := edge.NewChromium()
	c.DataPath = s.opts.DataPath
	c.SetErrorCallback(func(err error) { log.Printf("[login] webview: %v", err) })
	c.Embed(hwnd)
	s.chromium = c
	s.ready = true
	c.Resize()
	if cm, err := c.GetCookieManager(); err == nil {
		s.cookies = cm
		defer cm.Release()
		if s.opts.Fresh {
			for _, k := range s.opts.Cookies {
				if err := cm.DeleteCookies(k.Name, s.opts.CookieURL); err != nil {
					log.Printf("[login] delete cookie %s: %v", k.Name, err)
				}
			}
		}
	} else {
		log.Printf("[login] cookie manager: %v", err)
	}
	c.Navigate(s.opts.URL)
	procSetTimer.Call(hwnd, timerID, 1000, 0)

	var m msg
	for {
		r, _, _ := procGetMessage.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessage.Call(uintptr(unsafe.Pointer(&m)))
	}
	// close the browser so its processes end and the profile is not held
	if ctl := c.GetController(); ctl != nil {
		vtbl := *(**[25]edge.ComProc)(unsafe.Pointer(ctl))
		vtbl[24].Call(uintptr(unsafe.Pointer(ctl)))
	}
	if s.cookies == nil {
		return fmt.Errorf("the browser's cookies could not be read")
	}
	return nil
}

// tick asks for the cookies (or closes the window when the app is quitting)
func (s *session) tick() {
	if s.ctx.Err() != nil {
		procDestroyWindow.Call(s.hwnd)
		return
	}
	if s.cookies == nil || s.pending {
		return
	}
	u, _ := windows.UTF16PtrFromString(s.opts.CookieURL)
	vtbl := *(**[6]edge.ComProc)(unsafe.Pointer(s.cookies))
	// ICoreWebView2CookieManager::GetCookies(uri, handler); go-webview2's own wrapper takes it as synchronous
	hr, _, _ := vtbl[5].Call(uintptr(unsafe.Pointer(s.cookies)), uintptr(unsafe.Pointer(u)), uintptr(unsafe.Pointer(handler)))
	if hr != 0 {
		log.Printf("[login] GetCookies: %v", syscall.Errno(hr))
		return
	}
	s.pending = true
}

// gotCookies is the answer of GetCookies
func (s *session) gotCookies(list *edge.ICoreWebView2CookieList) {
	s.pending = false
	got := map[string]string{}
	if list != nil {
		n, _ := list.GetCount()
		for i := uint32(0); i < n; i++ {
			c, err := list.GetItem(i)
			if err != nil || c == nil {
				continue
			}
			name, _ := c.GetName()
			value, _ := c.GetValue()
			c.Release()
			for _, k := range s.opts.Cookies {
				if k.Name == name {
					got[name] = value
				}
			}
		}
	}
	if !complete(s.opts.Cookies, got) {
		s.seen = false
		return
	}
	if !s.seen {
		s.seen = true
		return
	}
	s.result = got
	procKillTimer.Call(s.hwnd, timerID)
	procDestroyWindow.Call(s.hwnd)
}

// setup registers the window class and makes the callbacks (they are never freed, so only once)
func setup() {
	wndProc = windows.NewCallback(windowProc)
	className, _ = windows.UTF16PtrFromString("PorunekoLogin")
	var instance windows.Handle
	_ = windows.GetModuleHandleEx(0, nil, &instance)
	cursor, _, _ := procLoadCursor.Call(0, idcArrow)
	icon, _, _ := procLoadIcon.Call(uintptr(instance), 3) // the exe's icon (Wails puts it at resource 3)
	wc := wndClassEx{
		wndProc:   wndProc,
		instance:  instance,
		cursor:    windows.Handle(cursor),
		icon:      windows.Handle(icon),
		iconSm:    windows.Handle(icon),
		className: className,
	}
	wc.size = uint32(unsafe.Sizeof(wc))
	procRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))
	handler = &cookiesHandler{vtbl: &[4]uintptr{
		windows.NewCallback(func(this, riid uintptr, out *uintptr) uintptr {
			*out = this
			return 0
		}),
		windows.NewCallback(func(this uintptr) uintptr { return 1 }),
		windows.NewCallback(func(this uintptr) uintptr { return 1 }),
		windows.NewCallback(func(this, hr uintptr, list *edge.ICoreWebView2CookieList) uintptr {
			if s := current; s != nil {
				if hr != 0 {
					list = nil
				}
				s.gotCookies(list)
			}
			return 0
		}),
	}}
}

// cookiesHandler is the ICoreWebView2GetCookiesCompletedHandler given to GetCookies (one for every call: there is
// one window at a time and one call at a time)
type cookiesHandler struct {
	vtbl *[4]uintptr
}

func windowProc(hwnd, message, wParam, lParam uintptr) uintptr {
	s := current
	switch message {
	case wmSize:
		if s != nil && s.ready {
			s.chromium.Resize()
		}
		return 0
	case wmTimer:
		if s != nil && s.ready {
			s.tick()
		}
		return 0
	case wmClose:
		procDestroyWindow.Call(hwnd)
		return 0
	case wmDestroy:
		procPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := procDefWindowProc.Call(hwnd, message, wParam, lParam)
	return r
}

// scaled is a size in pixels at the screen's scale (the app is DPI aware)
func scaled(px int) int {
	if procGetDpiForSystem.Find() != nil {
		return px
	}
	dpi, _, _ := procGetDpiForSystem.Call()
	if dpi == 0 {
		return px
	}
	return px * int(dpi) / 96
}
