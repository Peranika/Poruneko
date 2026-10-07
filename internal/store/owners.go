package store

import (
	"maps"
	"time"

	"poruneko/internal/model"
)

// Settings kept per owner of works (an account on a site, such as an X user): the values of the site's filters that
// override the common ones for that owner's works. They are data like bookmarks (there can be many), so they are in
// the DB, not the settings file. A value is kept as a share of the common value (model.OwnerSettings)

// ownerKey is the row key of an owner's settings
func ownerKey(site model.SiteID, owner string) string { return site + "\x1f" + owner }

func (s *Store) loadOwners() {
	rows, err := loadTable[model.OwnerSettings](s.db, ownersTable)
	if err != nil {
		return
	}
	s.owners = rows
}

func cloneOwner(o *model.OwnerSettings) model.OwnerSettings {
	c := *o
	c.Values, c.Scales = maps.Clone(o.Values), maps.Clone(o.Scales)
	return c
}

// Owner is what is kept for an owner of a site's works (empty when nothing is)
func (s *Store) Owner(site model.SiteID, owner string) model.OwnerSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if o := s.owners[ownerKey(site, owner)]; o != nil {
		return cloneOwner(o)
	}
	return model.OwnerSettings{Site: site, Owner: owner}
}

// OwnersOf is what is kept for every owner of a site's works (owner -> settings)
func (s *Store) OwnersOf(site model.SiteID) map[string]model.OwnerSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := map[string]model.OwnerSettings{}
	for _, o := range s.owners {
		if o.Site == site && !o.Empty() {
			out[o.Owner] = cloneOwner(o)
		}
	}
	return out
}

// SetOwnerValue keeps a value for an owner given the filter's common value at the time ("" removes it, and the
// owner's row with its last value), and returns what is kept for the owner
func (s *Store) SetOwnerValue(site model.SiteID, owner, id, value, common string) model.OwnerSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := ownerKey(site, owner)
	o := s.owners[k]
	if o == nil {
		o = &model.OwnerSettings{Site: site, Owner: owner}
	}
	o.Set(id, value, common)
	s.putOwner(k, o)
	return cloneOwner(o)
}

// putOwner stores a changed row, or removes it once empty (call with the lock held)
func (s *Store) putOwner(k string, o *model.OwnerSettings) {
	o.UpdatedAt = time.Now().UnixMilli()
	if o.Empty() {
		delete(s.owners, k)
	} else {
		s.owners[k] = o
	}
	s.changedO[k] = true
	s.scheduleFlush()
}

// ScaleOwnerValues turns the values kept as they are into shares of the common values, for the filters common gives
// a value above 0 (site -> filter id -> its common value). Older versions kept every value as it was; this keeps
// what they show now. Running it again changes nothing
func (s *Store) ScaleOwnerValues(common func(site model.SiteID) map[string]string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, o := range s.owners {
		c := common(o.Site)
		changed := false
		for id, v := range maps.Clone(o.Values) {
			if cv, ok := c[id]; ok {
				before := len(o.Scales)
				o.Set(id, v, cv)
				changed = changed || len(o.Scales) != before
			}
		}
		if changed {
			s.putOwner(k, o)
		}
	}
}
