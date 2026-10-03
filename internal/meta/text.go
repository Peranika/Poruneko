// Package meta fetches the creator and circle info of works from DLsite / FANZA.
package meta

import (
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

var (
	reBrackets = regexp.MustCompile(`[\[［【(（{｛〔<＜][^\[［【(（{｛〔<＜\]］】)）}｝〕>＞]*[\]］】)）}｝〕>＞]`)
	reNoise    = regexp.MustCompile(`(?i)(DL版|デジタル版|中国翻訳|無修正|English|Digital)`)
	reSpaces   = regexp.MustCompile(`\s+`)
)

// CleanTitle removes bracketed parts (event names, circle names, translation notes, etc.) for searching
func CleanTitle(t string) string {
	// remove from the inside repeatedly to handle nested brackets
	c := t
	for {
		n := reBrackets.ReplaceAllString(c, " ")
		if n == c {
			break
		}
		c = n
	}
	c = reNoise.ReplaceAllString(c, " ")
	c = strings.TrimSpace(reSpaces.ReplaceAllString(c, " "))
	if c == "" {
		return strings.TrimSpace(t)
	}
	return c
}

// Normalize applies NFKC, lowercasing, katakana to hiragana and removal of symbols and spaces for comparison
func Normalize(t string) string {
	t = strings.ToLower(norm.NFKC.String(t))
	var b strings.Builder
	for _, r := range t {
		if r >= 0x30a1 && r <= 0x30f6 {
			r -= 0x60
		}
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func bigrams(s []rune) map[string]int {
	m := map[string]int{}
	if len(s) < 2 {
		if len(s) == 1 {
			m[string(s)] = 1
		}
		return m
	}
	for i := 0; i < len(s)-1; i++ {
		m[string(s[i:i+2])]++
	}
	return m
}

// Similarity is the title similarity 0..1 (bigram Dice coefficient + containment bonus)
func Similarity(a, b string) float64 {
	// censored words (催● / メス○キ) compare equal to the words in full
	na, nb := normalizeTitle(CleanTitle(a)), normalizeTitle(CleanTitle(b))
	if na == "" || nb == "" {
		return 0
	}
	if na == nb {
		return 1
	}
	ra, rb := []rune(na), []rune(nb)
	ga, gb := bigrams(ra), bigrams(rb)
	inter, total := 0, 0
	for g, c := range ga {
		inter += min(c, gb[g])
		total += c
	}
	for _, c := range gb {
		total += c
	}
	score := 0.0
	if total > 0 {
		score = 2 * float64(inter) / float64(total)
	}
	short, long := na, nb
	if len(ra) > len(rb) {
		short, long = nb, na
	}
	ls, ll := len([]rune(short)), len([]rune(long))
	if ls >= 3 && strings.Contains(long, short) {
		score = max(score, 0.6+0.4*float64(ls)/float64(ll))
	}
	return score
}

// SameName reports whether two names are the same after normalization
func SameName(a, b string) bool {
	na := Normalize(a)
	return na != "" && na == Normalize(b)
}

// nameVariants makes ID candidates such as "foo bar" -> foobar, foo-bar, foo_bar
func nameVariants(name string) []string {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil
	}
	parts := strings.Fields(name)
	out := []string{strings.Join(parts, "")}
	if len(parts) > 1 {
		out = append(out, strings.Join(parts, "-"), strings.Join(parts, "_"))
	}
	return out
}

// sameID reports whether an ID or display name can be treated as the queried name (ignoring symbols, spaces and case)
func sameID(query, s string) bool {
	return s != "" && Normalize(query) != "" && Normalize(query) == Normalize(s)
}

// cleanCreatorName strips notices such as "なまえ@依頼募集中" (commissions open)
func cleanCreatorName(name string) string {
	for _, sep := range []string{"@", "＠"} {
		if i := strings.Index(name, sep); i > 0 {
			name = name[:i]
		}
	}
	return strings.TrimSpace(name)
}
