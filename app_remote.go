package main

import (
	"errors"
	"io/fs"
	"log"
	"net/http"

	"poruneko/internal/apperr"
	"poruneko/internal/remote"
	"poruneko/internal/store"
	"poruneko/internal/webapi"
)

// Remote access: the desktop app serves its screen to browsers on the user's other devices, on the home network or
// through a mesh VPN (internal/remote)

// remoteDenied are the methods a browser of remote access cannot call: they would open dialogs and windows on this
// machine, change remote access itself, or the browser does them on its own (opening links, full screen, clipboard)
var remoteDenied = []string{
	"ChooseSiteDir", "AddLocalDir", "AddPlugin", "RestartApp", "InstallUpdate", "SiteLogin",
	"OpenFolder", "OpenIconsFolder", "OpenExternal", "OpenAttachment", "ClipboardText",
	"SetFullscreen", "ToggleFullscreen", "WindowMinimise", "WindowToggleMaximise", "WindowClose",
	"RemoteStatus", "SetRemotePassword", "SetRemoteEnabled", "RemoteSignOutAll",
}

// webHandler serves the screen, the API and the images over HTTP (remote access)
func (a *App) webHandler(api *webapi.Server) http.Handler {
	dist, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", api)
	mux.Handle("/", a.img.Middleware(http.FileServerFS(dist)))
	return mux
}

// setupRemote prepares remote access (it listens from startup once it is on)
func (a *App) setupRemote() {
	a.remoteAPI = webapi.New(a, apperr.Format)
	a.remoteAPI.Deny(remoteDenied...)
	a.remote = remote.New(store.DataDir(), a.webHandler(a.remoteAPI))
}

func (a *App) RemoteStatus() remote.Status { return a.remote.Status() }

// SetRemotePassword sets the password browsers sign in with (the ones signed in are signed out)
func (a *App) SetRemotePassword(pw string) error {
	err := a.remote.SetPassword(pw)
	if errors.Is(err, remote.ErrShortPassword) {
		return apperr.New("remote.shortPassword", err.Error(), "min", remote.MinPassword)
	}
	return err
}

// SetRemoteEnabled turns remote access on or off
func (a *App) SetRemoteEnabled(on bool) error {
	err := a.remote.SetEnabled(on)
	switch {
	case errors.Is(err, remote.ErrNoPassword):
		return apperr.New("remote.noPassword", err.Error())
	case err != nil:
		return apperr.Wrap(err, "remote.listenFailed", "could not start remote access")
	}
	return nil
}

// RemoteSignOutAll signs out every browser
func (a *App) RemoteSignOutAll() { a.remote.SignOutAll() }
