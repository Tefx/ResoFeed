package resofeed

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io/fs"
	"net/http"
	"strings"
	"sync"
)

const failClosedContentSecurityPolicy = "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none';"

var embeddedUISecurityPolicy struct {
	once   sync.Once
	policy string
	err    error
}

func embeddedUIContentSecurityPolicy() (string, error) {
	embeddedUISecurityPolicy.once.Do(func() {
		root, err := embeddedUIRoot()
		if err != nil {
			embeddedUISecurityPolicy.err = err
			return
		}
		index, err := fs.ReadFile(root, "index.html")
		if err != nil {
			embeddedUISecurityPolicy.err = fmt.Errorf("read embedded UI index for CSP: %w", err)
			return
		}
		embeddedUISecurityPolicy.policy = contentSecurityPolicyForDocument(string(index))
	})
	return embeddedUISecurityPolicy.policy, embeddedUISecurityPolicy.err
}

func contentSecurityPolicyForDocument(document string) string {
	hashes := make([]string, 0)
	seen := make(map[string]struct{})
	for _, script := range scriptElementPattern.FindAllStringSubmatch(document, -1) {
		attrs, body := script[1], script[2]
		if htmlAttribute(attrs, "src") != "" || !browserScriptTypeExecutable(htmlAttribute(attrs, "type")) {
			continue
		}
		normalized := normalizeBrowserScriptText(body)
		if strings.TrimSpace(normalized) == "" {
			continue
		}
		sum := sha256.Sum256([]byte(normalized))
		hash := "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
		if _, exists := seen[hash]; exists {
			continue
		}
		seen[hash] = struct{}{}
		hashes = append(hashes, hash)
	}

	scriptSources := append([]string{"'self'"}, hashes...)
	return strings.Join([]string{
		"default-src 'self'",
		"base-uri 'none'",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"form-action 'self'",
		"script-src " + strings.Join(scriptSources, " "),
		"style-src 'self'",
		"img-src 'self' data:",
		"font-src 'self' data:",
		"connect-src 'self'",
	}, "; ") + ";"
}

func newHTTPSecurityHandler(next http.Handler) http.Handler {
	policy, err := embeddedUIContentSecurityPolicy()
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			setHTTPSecurityHeaders(w.Header(), failClosedContentSecurityPolicy)
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		})
	}
	return httpSecurityMiddleware(policy, next)
}

func httpSecurityMiddleware(policy string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		setHTTPSecurityHeaders(w.Header(), policy)
		next.ServeHTTP(w, r)
	})
}

func setHTTPSecurityHeaders(header http.Header, policy string) {
	header.Set("Content-Security-Policy", policy)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Referrer-Policy", "no-referrer")
	header.Set("X-Frame-Options", "DENY")
}
