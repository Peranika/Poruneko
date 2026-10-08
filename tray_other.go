//go:build !windows

package main

// The task tray is on Windows only: elsewhere closing the window quits the app

func (a *App) startTray() {}
func stopTray()           {}
func bringToFront()       {}

// handOffToRunning: Wails' SingleInstanceLock does it (later, in wails.Run)
func handOffToRunning(string) {}
