package main

import (
	"errors"

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

// setupRemote prepares remote access (it listens from startup once it is on)
func (a *App) setupRemote() {
	a.remoteAPI = webapi.New(a, apperr.Format)
	a.remoteAPI.Deny(remoteDenied...)
	a.remote = remote.New(store.DataDir(), a.webHandler(a.remoteAPI))
}

// errNoRemote is remote access asked for before it is set up
var errNoRemote = apperr.New("platform.unsupported", "not supported on this platform")

func (a *App) RemoteStatus() remote.Status {
	if a.remote == nil {
		return remote.Status{URLs: []string{}}
	}
	return a.remote.Status()
}

// SetRemotePassword sets the password browsers sign in with (the ones signed in are signed out)
func (a *App) SetRemotePassword(pw string) error {
	if a.remote == nil {
		return errNoRemote
	}
	err := a.remote.SetPassword(pw)
	if errors.Is(err, remote.ErrShortPassword) {
		return apperr.New("remote.shortPassword", err.Error(), "min", 8)
	}
	return err
}

// SetRemoteEnabled turns remote access on or off
func (a *App) SetRemoteEnabled(on bool) error {
	if a.remote == nil {
		return errNoRemote
	}
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
func (a *App) RemoteSignOutAll() {
	if a.remote != nil {
		a.remote.SignOutAll()
	}
}
