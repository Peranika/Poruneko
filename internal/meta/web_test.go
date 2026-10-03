package meta

import "testing"

func TestParseDuckDuckGo(t *testing.T) {
	row := func(link, title string) string {
		return `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=` + link + `&amp;rut=x">` + title + `</a>`
	}
	body := row("https%3A%2F%2Fx.com%2Fmihontarou", "見本太郎 (@MihonTarou) / X") +
		row("https%3A%2F%2Fwww.pixiv.net%2Fusers%2F1", "見本太郎 - pixiv") +
		row("https%3A%2F%2Fexample.com", "Something unrelated") +
		row("https%3A%2F%2Fskeb.jp%2F%40a", "別の人@依頼募集中 | Skeb")
	got := parseDuckDuckGo(body, "mihon tarou")
	if len(got) != 2 {
		t.Fatalf("candidates: %+v", got)
	}
	// the one whose X ID matches the name and whose name was read from 2 pages comes first
	if got[0].Artists[0] != "見本太郎" || got[0].Score < 0.7 || got[0].URL != "https://x.com/mihontarou" {
		t.Errorf("top: %+v", got[0])
	}
	// notices like "@依頼募集中" are removed
	if got[1].Artists[0] != "別の人" {
		t.Errorf("second: %+v", got[1])
	}
}
