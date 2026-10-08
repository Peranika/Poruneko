//go:build windows

package main

import (
	_ "embed"
	"log"
	goruntime "runtime"

	"fyne.io/systray"

	"poruneko/internal/model"
)

// The app's icon in the task tray. Closing the window hides it there (the app keeps running, remote access too);
// clicking the icon brings it back, and its menu restarts or quits the app

//go:embed build/windows/icon.ico
var trayIcon []byte

// startTray puts the icon in the task tray (at startup)
func (a *App) startTray() {
	go func() {
		// the tray's window gets its messages on the thread that made it
		goruntime.LockOSThread()
		systray.Run(a.trayReady, nil)
	}()
}

func (a *App) trayReady() {
	label := func(ja, en string) string {
		if model.English() {
			return en
		}
		return ja
	}
	systray.SetIcon(trayIcon)
	systray.SetTooltip("Poruneko")
	systray.SetOnTapped(a.sh.show)
	show := systray.AddMenuItem(label("表示", "Show"), "")
	restart := systray.AddMenuItem(label("再起動", "Restart"), "")
	systray.AddSeparator()
	quit := systray.AddMenuItem(label("終了", "Quit"), "")
	a.inTray.Store(true)
	go func() {
		for {
			select {
			case <-show.ClickedCh:
				a.sh.show()
			case <-restart.ClickedCh:
				if err := a.sh.restart(); err != nil {
					log.Println("[tray] restart:", err)
				}
			case <-quit.ClickedCh:
				a.sh.quit()
			}
		}
	}()
}

// stopTray takes the icon away (when the app quits)
func stopTray() { systray.Quit() }
