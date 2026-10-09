package library

import (
	"bytes"
	"encoding/binary"
	"hash/crc32"
	"os"
	"path/filepath"
	"testing"
)

// rar4 makes a RAR 4 archive with the files stored (not compressed), in the given order
func rar4(files [][2]string) []byte {
	var b bytes.Buffer
	b.WriteString("Rar!\x1a\x07\x00") // marker
	block := func(head []byte) {
		// a header's CRC is the low 16 bits of the CRC32 of the header after the CRC field
		crc := crc32.ChecksumIEEE(head)
		b.Write(binary.LittleEndian.AppendUint16(nil, uint16(crc)))
		b.Write(head)
	}
	// archive header: type, flags, size, 6 reserved bytes
	block(append([]byte{0x73, 0, 0, 13, 0}, make([]byte, 6)...))
	for _, f := range files {
		name, data := f[0], f[1]
		h := []byte{0x74}
		h = binary.LittleEndian.AppendUint16(h, 0x8000)               // flags: long block
		h = binary.LittleEndian.AppendUint16(h, uint16(32+len(name))) // header size
		h = binary.LittleEndian.AppendUint32(h, uint32(len(data)))    // packed size
		h = binary.LittleEndian.AppendUint32(h, uint32(len(data)))    // unpacked size
		h = append(h, 2)                                              // host OS: Windows
		h = binary.LittleEndian.AppendUint32(h, crc32.ChecksumIEEE([]byte(data)))
		h = binary.LittleEndian.AppendUint32(h, 0x5a210000) // time
		h = append(h, 20, 0x30)                             // version, method: store
		h = binary.LittleEndian.AppendUint16(h, uint16(len(name)))
		h = binary.LittleEndian.AppendUint32(h, 0x20) // attributes
		h = append(h, name...)
		block(h)
		b.WriteString(data)
	}
	block([]byte{0x7b, 0x00, 0x40, 7, 0}) // end of archive
	return b.Bytes()
}

func readAllPages(t *testing.T, path string) map[string]string {
	t.Helper()
	f := formatFor(path)
	if f == nil {
		t.Fatalf("no format for %s", path)
	}
	if !f.Supports(path) {
		t.Fatalf("%s: not supported", path)
	}
	a, err := openPlugin(path, f)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]string{}
	var order []string
	for i := range a.pages {
		b, ext, err := readPluginPage(path, f, i)
		if err != nil {
			t.Fatalf("page %d: %v", i, err)
		}
		out[a.pages[i].Name] = string(b) + "." + ext
		order = append(order, filepath.Base(a.pages[i].Name))
	}
	out["order"] = filepath.Join(order...)
	return out
}

func TestRarPages(t *testing.T) {
	path := filepath.Join(t.TempDir(), "work.rar")
	if err := os.WriteFile(path, rar4([][2]string{{"set\\img10.png", "ten"}, {"set\\img2.png", "two"}, {"readme.txt", "text"}}), 0o644); err != nil {
		t.Fatal(err)
	}
	got := readAllPages(t, path)
	// images only, in natural order, read in any order
	if got["order"] != filepath.Join("img2.png", "img10.png") || got["set/img2.png"] != "two.png" || got["set/img10.png"] != "ten.png" {
		t.Fatalf("pages: %v", got)
	}
	closeHeld(path)
	if err := os.Remove(path); err != nil {
		t.Fatalf("the archive should be closed: %v", err)
	}
}

func TestSolid7zPages(t *testing.T) {
	// made with 7-Zip as a solid archive: set/img2.png ("two"), set/img10.png ("ten"), readme.txt
	src, err := os.ReadFile(filepath.Join("testdata", "solid.7z"))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "work.cb7")
	if err := os.WriteFile(path, src, 0o644); err != nil {
		t.Fatal(err)
	}
	got := readAllPages(t, path)
	if got["order"] != filepath.Join("img2.png", "img10.png") || got["set/img2.png"] != "two.png" || got["set/img10.png"] != "ten.png" {
		t.Fatalf("pages: %v", got)
	}
	closeHeld(path)
	if err := os.Remove(path); err != nil {
		t.Fatalf("the archive should be closed: %v", err)
	}
}

func TestBuiltinFormatChecksSignature(t *testing.T) {
	path := filepath.Join(t.TempDir(), "not.rar")
	if err := os.WriteFile(path, []byte("PK\x03\x04 not a rar"), 0o644); err != nil {
		t.Fatal(err)
	}
	if formatFor(path).Supports(path) {
		t.Fatal("a file that is not a RAR archive should not be read as one")
	}
	if !CanOpenArchive("a.rar") || !CanOpenArchive("b.7z") {
		t.Fatal("rar and 7z attachments should be importable")
	}
}
