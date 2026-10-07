package main

import (
	"context"
	"errors"
	"log"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/devsync"
	"poruneko/internal/model"
	"poruneko/internal/store"
)

// API for syncing the bookmarks, series and tags with the user's other devices on the same network
// (internal/devsync). It syncs at startup and every few minutes while there are paired devices, and when asked

// syncEvery is how often the app syncs by itself with the paired devices it finds
const syncEvery = 10 * time.Minute

// startSync loads the paired devices and starts syncing with them in the background
func (a *App) startSync() {
	a.sync = devsync.New(store.DataDir(), a.st.SyncState, a.applySync, func() { a.sh.emit("sync:changed", nil) })
	go func() {
		time.Sleep(5 * time.Second)
		for {
			if len(a.sync.Status().Peers) > 0 {
				a.sync.SyncNow(a.ctx)
			}
			select {
			case <-a.ctx.Done():
				return
			case <-time.After(syncEvery):
			}
		}
	}()
}

// applySync merges another device's shared data into this one's, and does what the changes call for: removing the
// works it deleted, downloading the ones it added (with automatic downloads on), renaming files for new info
func (a *App) applySync(remote model.SyncState) error {
	c := a.st.ApplySync(devsync.Merge(a.st.SyncState(), remote, time.Now()))
	for _, k := range c.Removed {
		if err := a.RemoveBookmark(k); err != nil {
			log.Printf("[sync] remove %s: %v", k, err)
		}
	}
	auto := a.st.Settings().AutoDownload
	for _, k := range c.Added {
		if b, ok := a.st.Bookmark(k); ok && b.Creator.Status == model.CreatorPending {
			go a.resolve(k)
		}
		if auto {
			a.dl.Enqueue(k)
		}
	}
	for _, k := range c.Edited {
		a.refreshArchiveMeta(k)
	}
	if c.Bookmarks || len(c.Removed) > 0 {
		a.notifyBookmarks()
	}
	if c.Series {
		a.seriesChanged(c.SeriesKeys)
	}
	if len(c.Added)+len(c.Edited)+len(c.Removed) > 0 || c.Series {
		log.Printf("[sync] %d added, %d changed, %d removed", len(c.Added), len(c.Edited), len(c.Removed))
	}
	return nil
}

// SyncStatus is this device's name, the paired devices and the pairing in progress
func (a *App) SyncStatus() devsync.Status { return a.sync.Status() }

// SetSyncDeviceName names this device as the others show it ("" for the default)
func (a *App) SetSyncDeviceName(name string) { a.sync.SetDeviceName(name) }

// StartSyncPairing shows a code for another device to pair with this one (for a few minutes)
func (a *App) StartSyncPairing() (devsync.PairingStatus, error) {
	st, err := a.sync.StartPairing()
	if err != nil {
		return st, apperr.Wrap(err, "sync.listenFailed", "could not wait for other devices")
	}
	return st, nil
}

func (a *App) StopSyncPairing() { a.sync.StopPairing() }

// FindSyncDevices looks for devices on the network that are waiting to be paired
func (a *App) FindSyncDevices() []devsync.Found {
	out := []devsync.Found{}
	for _, f := range a.sync.Find(2 * time.Second) {
		if f.Pairing {
			out = append(out, f)
		}
	}
	return out
}

// PairSyncDevice pairs with the device at addr ("host" or "host:port") showing code, then syncs with it
func (a *App) PairSyncDevice(addr, code string) error {
	ctx, cancel := context.WithTimeout(a.ctx, time.Minute)
	defer cancel()
	p, err := a.sync.Pair(ctx, addr, code)
	switch {
	case errors.Is(err, devsync.ErrWrongCode):
		return apperr.New("sync.wrongCode", "the code is not the one the other device shows")
	case errors.Is(err, devsync.ErrNotPairing):
		return apperr.New("sync.notPairing", "the other device is not showing a code")
	case err != nil:
		return apperr.Wrap(err, "sync.pairFailed", "pairing failed")
	}
	go a.sync.SyncNow(a.ctx)
	log.Printf("[sync] paired with %s", p.Name)
	return nil
}

// RemoveSyncDevice unpairs a device
func (a *App) RemoveSyncDevice(id string) { a.sync.RemovePeer(id) }

// SyncNow syncs with every paired device found on the network; the results are for the devices not reached
func (a *App) SyncNow() []devsync.SyncResult {
	out := []devsync.SyncResult{}
	for _, r := range a.sync.SyncNow(a.ctx) {
		if r.Error != "" {
			out = append(out, r)
		}
	}
	return out
}
