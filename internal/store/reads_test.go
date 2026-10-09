package store

import "testing"

func TestReadStatesPersist(t *testing.T) {
	t.Setenv("PORUNEKO_DATA_DIR", t.TempDir())
	st := Open()
	st.SetReadPage("site:1", 4, 10, false)
	if r, _ := st.ReadState("site:1"); r.Page != 4 || r.Pages != 10 || r.Read {
		t.Fatalf("in the middle: %+v", r)
	}
	// its last page makes it read; reading it again from the start leaves it read
	st.SetReadPage("site:1", 9, 10, true)
	st.SetReadPage("site:1", 0, 10, false)
	st.SetReadPage("site:2", 2, 5, false)
	st.SetRead("site:2", true)
	st.SetRead("site:3", true)
	st.SetRead("site:3", false)
	st.Flush()

	again := Open()
	got := again.ReadStates()
	if r := got["site:1"]; r.Page != 0 || !r.Read {
		t.Fatalf("read again from the start: %+v", r)
	}
	if !got["site:2"].Read || got["site:3"].Read || len(got) != 3 {
		t.Fatalf("marked by the user: %+v", got)
	}
	if _, ok := again.ReadState("site:4"); ok {
		t.Fatal("a work never opened has no state")
	}
}
