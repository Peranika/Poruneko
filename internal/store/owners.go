package store

import (
	"maps"
	"time"

	"poruneko/internal/model"
)

// Settings kept per owner of works (an account on a site, such as an X user): the values of the site's filters that
// override the common ones for that owner's works. They are data like bookmarks (there can be many), so they are in
// the DB, not the settings file

// ownerKey is the row key of an owner's settings
func ownerKey(site model.SiteID, owner string) string { return site + "\x1f" + owner }

func (s *Store) loadOwners() {
	rows, err := loadTable[model.OwnerSettings](s.db, ownersTable)
	if err != nil {
		return
	}
	s.owners = rows
}

// OwnerValues are the values kept for an owner of a site's works (filter id -> value; empty when none)
func (s *Store) OwnerValues(site model.SiteID, owner string) map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if o := s.owners[ownerKey(site, owner)]; o != nil {
		return maps.Clone(o.Values)
	}
	return map[string]string{}
}

// OwnersOf are the values kept for every owner of a site's works (owner -> filter id -> value)
func (s *Store) OwnersOf(site model.SiteID) map[string]map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := map[string]map[string]string{}
	for _, o := range s.owners {
		if o.Site == site && len(o.Values) > 0 {
			out[o.Owner] = maps.Clone(o.Values)
		}
	}
	return out
}

// SetOwnerValue keeps a value for an owner ("" removes it, and the owner's row with its last value)
func (s *Store) SetOwnerValue(site model.SiteID, owner, id, value string) map[string]string {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := ownerKey(site, owner)
	o := s.owners[k]
	if o == nil {
		o = &model.OwnerSettings{Site: site, Owner: owner, Values: map[string]string{}}
	}
	if value == "" {
		delete(o.Values, id)
	} else {
		o.Values[id] = value
	}
	o.UpdatedAt = time.Now().UnixMilli()
	if len(o.Values) == 0 {
		delete(s.owners, k)
	} else {
		s.owners[k] = o
	}
	s.changedO[k] = true
	s.scheduleFlush()
	return maps.Clone(o.Values)
}
