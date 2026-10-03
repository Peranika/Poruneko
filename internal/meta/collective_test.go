package meta

import (
	"testing"

	"poruneko/internal/model"
)

func TestCollectiveCircle(t *testing.T) {
	four := []string{"A", "B", "C", "D"}
	cases := []struct {
		name string
		info model.CreatorInfo
		s    model.GallerySummary
		want string
	}{
		{"3 or fewer are kept", model.CreatorInfo{Artists: []string{"A", "B", "C"}}, model.GallerySummary{JapaneseTitle: "合同誌"}, ""},
		{"DLsite commercial product is a magazine", model.CreatorInfo{Artists: four, ProductID: "BJ325709"}, model.GallerySummary{JapaneseTitle: "コミックホットミルク2021年10月号"}, CircleMagazine},
		{"monthly issue is a magazine", model.CreatorInfo{Artists: four}, model.GallerySummary{JapaneseTitle: "COMIC 快楽天 2024年5月号", Type: "doujinshi"}, CircleMagazine},
		{"Vol. means a magazine", model.CreatorInfo{Artists: four}, model.GallerySummary{Title: "Comic Bavel Vol. 12", Type: "doujinshi"}, CircleMagazine},
		{"site manga is a magazine", model.CreatorInfo{Artists: four}, model.GallerySummary{JapaneseTitle: "とある本", Type: "manga"}, CircleMagazine},
		{"says anthology so it is an anthology", model.CreatorInfo{Artists: four, ProductID: "BJ1"}, model.GallerySummary{JapaneseTitle: "二次元コミックマガジン 百合アンソロジー"}, CircleAnthology},
		{"anthology tag is an anthology", model.CreatorInfo{Artists: four}, model.GallerySummary{Title: "Something", Type: "manga", Tags: []model.TagInfo{{NS: "tag", Name: "anthology"}}}, CircleAnthology},
		{"doujin joint book is an anthology", model.CreatorInfo{Artists: four}, model.GallerySummary{JapaneseTitle: "夏の本", Type: "doujinshi"}, CircleAnthology},
		{"Comic Market does not make a magazine", model.CreatorInfo{Artists: four}, model.GallerySummary{JapaneseTitle: "コミックマーケット 104 新刊", Type: "doujinshi"}, CircleAnthology},
	}
	for _, c := range cases {
		if got := CollectiveCircle(c.info, &c.s); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
