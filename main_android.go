//go:build android

package main

// On Android the screen is a WebView of the Android app (android/). This program runs beside it, started by the
// Android app as a child process, and serves the frontend, the API (internal/webapi) and the images on 127.0.0.1.
//
// The Android app passes in the environment PORUNEKO_DATA_DIR (the data folder) and PORUNEKO_TOKEN (the secret
// every request carries: other apps can reach 127.0.0.1 too). The first line of the output is
// "PORUNEKO_LISTEN <port>". The program ends when its stdin closes (the Android app ended) or on SIGTERM.

import (
	"context"
	"crypto/subtle"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"poruneko/internal/apperr"
	"poruneko/internal/webapi"
)

func main() {
	setupLog()
	token := os.Getenv("PORUNEKO_TOKEN")
	if token == "" {
		log.Fatal("PORUNEKO_TOKEN is not set")
	}
	ctx, stop := context.WithCancel(context.Background())
	defer stop()

	app := newApp()
	api := webapi.New(app, apperr.Format)
	app.sh = &androidShell{ctx: ctx, api: api}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	dist, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", api)
	mux.Handle("/native/", api)
	mux.Handle("/", app.img.Middleware(http.FileServerFS(dist)))
	srv := &http.Server{Handler: guard(token, port, mux), ReadHeaderTimeout: 10 * time.Second}

	app.startup(ctx)
	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("[server] %v", err)
			stop()
		}
	}()
	fmt.Printf("PORUNEKO_LISTEN %d\n", port)
	log.Printf("[server] listening on 127.0.0.1:%d", port)

	go func() {
		_, _ = io.Copy(io.Discard, os.Stdin)
		stop()
	}()
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, os.Interrupt)
	select {
	case <-ctx.Done():
	case <-sig:
	}
	log.Print("[server] stopping")
	api.Close()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	app.shutdown(shutdownCtx)
}

// tokenCookie keeps the token in the WebView once its first page was opened with ?token=
const tokenCookie = "poruneko_token"

// guard lets through only requests carrying the token (in the cookie, or the header for the Android app's own
// requests) and addressed to 127.0.0.1:port (a web page cannot reach the server through a name of its own)
func guard(token string, port int, next http.Handler) http.Handler {
	host := "127.0.0.1:" + strconv.Itoa(port)
	valid := func(t string) bool { return subtle.ConstantTimeCompare([]byte(t), []byte(token)) == 1 }
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != host {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if t := r.URL.Query().Get("token"); t != "" && valid(t) {
			http.SetCookie(w, &http.Cookie{Name: tokenCookie, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
			http.Redirect(w, r, r.URL.Path, http.StatusFound)
			return
		}
		if c, err := r.Cookie(tokenCookie); (err == nil && valid(c.Value)) || valid(r.Header.Get("X-Poruneko-Token")) {
			next.ServeHTTP(w, r)
			return
		}
		http.Error(w, "forbidden", http.StatusForbidden)
	})
}
