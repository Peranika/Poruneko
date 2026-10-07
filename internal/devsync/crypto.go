package devsync

import (
	"bytes"
	"compress/gzip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"io"
	"strings"
)

// The pairing code: 8 characters of an alphabet without look-alikes (40 bits), shown as XXXX-XXXX
const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

func newCode() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = codeAlphabet[int(b[i])%len(codeAlphabet)]
	}
	return string(b[:4]) + "-" + string(b[4:])
}

// normalizeCode is a code as typed: upper case, without the dash and spaces
func normalizeCode(s string) string {
	return strings.NewReplacer("-", "", " ", "").Replace(strings.ToUpper(s))
}

// pairKey is the key both sides make from the code during pairing. It is slow to make, so trying codes against a
// pairing someone overheard takes long
func pairKey(code, hostID, clientID string, clientNonce []byte) ([]byte, error) {
	salt := append([]byte("poruneko pair\x00"+hostID+"\x00"+clientID+"\x00"), clientNonce...)
	return pbkdf2.Key(sha256.New, normalizeCode(code), salt, 300_000, 32)
}

// proof shows the other side knows the key
func proof(key []byte, parts ...string) []byte {
	m := hmac.New(sha256.New, key)
	for _, p := range parts {
		m.Write([]byte(p))
		m.Write([]byte{0})
	}
	return m.Sum(nil)
}

// syncKey is the key a pair of devices encrypts its syncs with
func syncKey(secret []byte) ([]byte, error) {
	return hkdf.Key(sha256.New, secret, nil, "poruneko sync", 32)
}

// seal encrypts and authenticates data (AES-GCM, the nonce first)
func seal(key, data []byte) ([]byte, error) {
	gcm, err := newGCM(key)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, data, nil), nil
}

var errOpen = errors.New("the data could not be decrypted (the devices are not paired with each other)")

func open(key, box []byte) ([]byte, error) {
	gcm, err := newGCM(key)
	if err != nil {
		return nil, err
	}
	if len(box) < gcm.NonceSize() {
		return nil, errOpen
	}
	out, err := gcm.Open(nil, box[:gcm.NonceSize()], box[gcm.NonceSize():], nil)
	if err != nil {
		return nil, errOpen
	}
	return out, nil
}

func newGCM(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func gzipBytes(b []byte) []byte {
	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	_, _ = w.Write(b)
	_ = w.Close()
	return buf.Bytes()
}

// maxState is the most a synced state may be once unpacked
const maxState = 256 << 20

func gunzipBytes(b []byte) ([]byte, error) {
	r, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	out, err := io.ReadAll(io.LimitReader(r, maxState+1))
	if err != nil {
		return nil, err
	}
	if len(out) > maxState {
		return nil, errors.New("the synced data is too large")
	}
	return out, nil
}

func randomBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}
