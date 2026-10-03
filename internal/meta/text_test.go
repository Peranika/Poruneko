package meta

import (
	"testing"

	"poruneko/internal/model"
)

func TestCleanTitle(t *testing.T) {
	cases := map[string]string{
		"(C102) [サークル (作者)] タイトル (オリジナル) [DL版]": "タイトル",
		"[中国翻訳] 本題 [無修正]":                       "本題",
		"【完全版】":                                 "【完全版】",
	}
	for in, want := range cases {
		if got := CleanTitle(in); got != want {
			t.Errorf("CleanTitle(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSimilarity(t *testing.T) {
	if s := Similarity("あさのひかり", "アサノヒカリ"); s != 1 {
		t.Errorf("kana normalize: %v", s)
	}
	if s := Similarity("あさのひかり", "あさのひかりの悪いこと"); s < 0.6 || s >= 1 {
		t.Errorf("containment: %v", s)
	}
	if s := Similarity("全然違う作品", "あさのひかり"); s > 0.2 {
		t.Errorf("unrelated: %v", s)
	}
}

func TestBoostShortTitle(t *testing.T) {
	s := &model.GallerySummary{JapaneseTitle: "約束", Artists: []string{"mihon"}}
	c := model.CreatorCandidate{Circle: "別のサークル", Score: 1}
	if got := boost(c, s); got >= thMatched {
		t.Errorf("short title without creator match should be uncertain, got %v", got)
	}
	c.Artists = []string{"Mihon"}
	if got := boost(c, s); got < thMatched {
		t.Errorf("short title with creator match should be matched, got %v", got)
	}
}

func TestSimilarityCensored(t *testing.T) {
	for _, c := range [][2]string{
		{"催眠アプリNTR 男たちの精液処理係", "催●アプリNTR 男たちの精液処理係"},
		{"メスガキちゃんず びぎんず", "メス〇キちゃんず-びぎんず-"},
		{"放課後レイプ教室", "放課後レ○プ教室"},
	} {
		if s := Similarity(c[0], c[1]); s < 0.95 {
			t.Errorf("Similarity(%q, %q) = %v", c[0], c[1], s)
		}
	}
	// a censored title still differs from an unrelated one
	if s := Similarity("催眠アプリNTR", "全然違う作品"); s > 0.2 {
		t.Errorf("unrelated: %v", s)
	}
	if q := censoredQuery("生意気なメスガキに催眠を"); q != "生意気なメスガ○に催○を" {
		t.Errorf("censoredQuery = %q", q)
	}
	if q := censoredQuery("普通のタイトル"); q != "" {
		t.Errorf("censoredQuery = %q", q)
	}
}
