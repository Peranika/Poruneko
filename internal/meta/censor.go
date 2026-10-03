package meta

import (
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// Censored words: shops write some words with a mark in place of a character (FANZA titles say 催● and メス○キ,
// and DLsite searches return nothing for some words written in full). Titles are compared with the marks read as
// any one character, and searches also try the word with its last character replaced by a mark.

// censorMarks are the characters used in place of a censored character
const censorMarks = "○●〇◯◎×✕＊*□■◆◇"

// wildcard stands for a censor mark in normalized titles
const wildcard = '�'

// censoredWords are words shops often censor (as written in titles)
var censoredWords = []string{
	"催眠", "洗脳", "睡眠", "昏睡", "媚薬", "強姦", "輪姦", "獣姦", "凌辱", "陵辱", "調教", "監禁", "拘束", "奴隷",
	"痴漢", "盗撮", "鬼畜", "中出し", "孕ませ", "種付け", "近親", "相姦", "レイプ", "メスガキ", "ロリ", "ショタ",
	"幼女", "女子校生", "女子高生", "小学生", "中学生", "犯され", "犯す",
}

// censoredPatterns match a censored word in a normalized title, with any of its characters (but not all) replaced
// by the wildcard. The replacement is the word in normalized form
var censoredPatterns = func() []struct {
	re   *regexp.Regexp
	word string
} {
	var out []struct {
		re   *regexp.Regexp
		word string
	}
	for _, w := range censoredWords {
		nw := []rune(Normalize(w))
		if len(nw) < 2 {
			continue
		}
		// one alternative per position that may be censored: the other characters must be there
		var alts []string
		for i := range nw {
			var b strings.Builder
			for j, r := range nw {
				if j == i {
					b.WriteString(regexp.QuoteMeta(string(wildcard)))
				} else {
					b.WriteString(regexp.QuoteMeta(string(r)))
				}
			}
			alts = append(alts, b.String())
		}
		out = append(out, struct {
			re   *regexp.Regexp
			word string
		}{regexp.MustCompile(strings.Join(alts, "|")), string(nw)})
	}
	return out
}()

// normalizeTitle is Normalize for comparing titles: censor marks become the wildcard (instead of being dropped),
// censored words are written in full, and other wildcards are dropped
func normalizeTitle(t string) string {
	t = strings.ToLower(norm.NFKC.String(t))
	var b strings.Builder
	for _, r := range t {
		switch {
		case strings.ContainsRune(censorMarks, r):
			b.WriteRune(wildcard)
		case r >= 0x30a1 && r <= 0x30f6: // katakana to hiragana, as Normalize does
			b.WriteRune(r - 0x60)
		case unicode.IsLetter(r) || unicode.IsNumber(r):
			b.WriteRune(r)
		}
	}
	n := b.String()
	if strings.ContainsRune(n, wildcard) {
		for _, p := range censoredPatterns {
			n = p.re.ReplaceAllString(n, p.word)
		}
		n = strings.ReplaceAll(n, string(wildcard), "")
	}
	return n
}

// censoredQuery returns the query with the censored words in it written as shops do (last character replaced
// by ○), or "" if it has none
func censoredQuery(q string) string {
	out := q
	for _, w := range censoredWords {
		r := []rune(w)
		out = strings.ReplaceAll(out, w, string(r[:len(r)-1])+"○")
	}
	if out == q {
		return ""
	}
	return out
}
