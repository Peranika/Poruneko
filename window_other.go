//go:build !windows

package main

import "poruneko/internal/model"

// the window position is not saved outside Windows
const windowClass = ""

func getWindowState() (model.WindowState, bool) { return model.WindowState{}, false }
func placeWindow(model.WindowState) bool        { return false }
