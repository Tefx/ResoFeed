package resofeed

import (
	"bytes"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"
)

// embeddedUI contains the validated production Svelte build. The build script
// replaces webui atomically before compiling the binary.
//
//go:embed webui webui/_app
var embeddedUI embed.FS

var (
	scriptElementPattern = regexp.MustCompile(`(?is)<script\b([^>]*)>(.*?)</script\s*>`)
	linkElementPattern   = regexp.MustCompile(`(?is)<link\b([^>]*)>`)
	moduleImportPattern  = regexp.MustCompile(`(?is)\bimport\s*\(\s*["']([^"']+)["']\s*\)`)

	embeddedUIValidation struct {
		once sync.Once
		err  error
	}
)

func validateEmbeddedUI() error {
	embeddedUIValidation.once.Do(func() {
		root, err := embeddedUIRoot()
		if err != nil {
			embeddedUIValidation.err = err
			return
		}
		index, err := fs.ReadFile(root, "index.html")
		if err != nil {
			embeddedUIValidation.err = fmt.Errorf("read embedded UI index: %w", err)
			return
		}
		embeddedUIValidation.err = validateUIBootstrap(root, string(index))
	})
	return embeddedUIValidation.err
}

func embeddedUIRoot() (fs.FS, error) {
	root, err := fs.Sub(embeddedUI, "webui")
	if err != nil {
		return nil, fmt.Errorf("open embedded UI: %w", err)
	}
	return root, nil
}

func validateUIBootstrap(root fs.FS, document string) error {
	if root == nil {
		return errors.New("validate embedded UI: filesystem required")
	}
	scripts := scriptElementPattern.FindAllStringSubmatch(document, -1)
	if len(scripts) == 0 {
		return errors.New("validate embedded UI: executable bootstrap missing")
	}

	bootstrapReady := false
	for _, script := range scripts {
		attrs, body := script[1], script[2]
		if ref := htmlAttribute(attrs, "src"); ref != "" {
			if err := validateUIReference(root, ref); err != nil {
				return fmt.Errorf("validate embedded UI script reference: %w", err)
			}
			bootstrapReady = true
			continue
		}
		if !browserScriptTypeExecutable(htmlAttribute(attrs, "type")) {
			continue
		}
		normalized := normalizeBrowserScriptText(body)
		if strings.TrimSpace(normalized) == "" {
			return errors.New("validate embedded UI: executable script body empty")
		}
		bootstrapReady = true
		for _, imported := range moduleImportPattern.FindAllStringSubmatch(normalized, -1) {
			if err := validateUIReference(root, imported[1]); err != nil {
				return fmt.Errorf("validate embedded UI module import: %w", err)
			}
		}
	}
	if !bootstrapReady {
		return errors.New("validate embedded UI: executable bootstrap missing")
	}

	for _, link := range linkElementPattern.FindAllStringSubmatch(document, -1) {
		if ref := htmlAttribute(link[1], "href"); ref != "" {
			if err := validateUIReference(root, ref); err != nil {
				return fmt.Errorf("validate embedded UI link reference: %w", err)
			}
		}
	}
	return nil
}

func validateUIReference(root fs.FS, reference string) error {
	parsed, err := url.Parse(reference)
	if err != nil {
		return fmt.Errorf("parse %q: %w", reference, err)
	}
	if parsed.Scheme != "" || parsed.Host != "" || parsed.Path == "" {
		return fmt.Errorf("reference %q must be package-local", reference)
	}
	cleaned := path.Clean(strings.TrimPrefix(parsed.Path, "/"))
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") || !fs.ValidPath(cleaned) {
		return fmt.Errorf("reference %q has invalid path", reference)
	}
	info, err := fs.Stat(root, cleaned)
	if err != nil {
		return fmt.Errorf("reference %q: %w", reference, err)
	}
	if info.IsDir() {
		return fmt.Errorf("reference %q resolves to a directory", reference)
	}
	return nil
}

func browserScriptTypeExecutable(scriptType string) bool {
	switch strings.ToLower(strings.TrimSpace(scriptType)) {
	case "", "module", "text/javascript", "application/javascript", "importmap":
		return true
	default:
		return false
	}
}

func normalizeBrowserScriptText(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "\r\n", "\n"), "\r", "\n")
}

func htmlAttribute(attrs, name string) string {
	pattern := regexp.MustCompile(`(?is)\b` + regexp.QuoteMeta(name) + `\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`)
	match := pattern.FindStringSubmatch(attrs)
	if match == nil {
		return ""
	}
	for _, value := range match[1:] {
		if value != "" {
			return value
		}
	}
	return ""
}

func staticUIHandler() http.Handler {
	if err := validateEmbeddedUI(); err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			writeStaticStatus(w, r, http.StatusInternalServerError)
		})
	}
	root, err := embeddedUIRoot()
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			writeStaticStatus(w, r, http.StatusInternalServerError)
		})
	}
	index, err := fs.ReadFile(root, "index.html")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			writeStaticStatus(w, r, http.StatusInternalServerError)
		})
	}
	fileServer := http.FileServer(http.FS(root))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			writeStaticStatus(w, r, http.StatusMethodNotAllowed)
			return
		}

		if escapedPath := r.URL.EscapedPath(); strings.HasPrefix(escapedPath, "/items/") && escapedPath != "/items/" {
			serveEmbeddedIndex(w, r, index)
			return
		}

		requestPath := path.Clean(r.URL.Path)
		if requestPath != r.URL.Path && !(r.URL.Path == "" && requestPath == ".") {
			writeStaticStatus(w, r, http.StatusNotFound)
			return
		}
		assetPath := strings.TrimPrefix(requestPath, "/")
		if assetPath == "" || assetPath == "." {
			serveEmbeddedIndex(w, r, index)
			return
		}
		if info, statErr := fs.Stat(root, assetPath); statErr == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		if validEmbeddedSPARoute(requestPath) {
			serveEmbeddedIndex(w, r, index)
			return
		}
		writeStaticStatus(w, r, http.StatusNotFound)
	})
}

func validEmbeddedSPARoute(requestPath string) bool {
	switch requestPath {
	case "/today", "/source-ledger", "/source", "/sources", "/search", "/doctor":
		return true
	}
	if !strings.HasPrefix(requestPath, "/items/") {
		return false
	}
	itemID := strings.TrimPrefix(requestPath, "/items/")
	return itemID != "" && !strings.Contains(itemID, "/")
}

func serveEmbeddedIndex(w http.ResponseWriter, r *http.Request, index []byte) {
	http.ServeContent(w, r, "index.html", time.Time{}, bytes.NewReader(index))
}

func writeStaticStatus(w http.ResponseWriter, r *http.Request, status int) {
	if r.Method == http.MethodHead {
		w.WriteHeader(status)
		return
	}
	http.Error(w, http.StatusText(status), status)
}
