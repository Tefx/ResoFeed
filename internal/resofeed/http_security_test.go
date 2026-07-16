package resofeed

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestContentSecurityPolicyForDocumentHashesExecutableInlineScripts(t *testing.T) {
	fixture := `<script>first()
second()</script>
<script type="application/json">{"ignored":true}</script>
<script type="module">module()</script>
<script src="/external.js"></script>
<script>first()
second()</script>`

	first := testCSPHash("first()\nsecond()")
	module := testCSPHash("module()")
	want := "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' " + first + " " + module + "; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self';"
	got := contentSecurityPolicyForDocument(fixture)
	if got != want {
		t.Fatalf("CSP = %q, want %q", got, want)
	}
	if strings.Contains(got, "unsafe-inline") {
		t.Fatal("CSP permits unsafe inline scripts")
	}
	if strings.Count(got, first) != 1 {
		t.Fatalf("duplicate executable body hash count = %d, want 1", strings.Count(got, first))
	}
}

func TestHTTPSecurityMiddlewareOwnsSingleHeaderValues(t *testing.T) {
	const policy = "default-src 'self'; script-src 'self';"
	recorder := httptest.NewRecorder()
	for _, name := range []string{"Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options"} {
		recorder.Header()[name] = []string{"stale", "duplicate"}
	}

	handler := httpSecurityMiddleware(policy, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

	want := map[string]string{
		"Content-Security-Policy": policy,
		"X-Content-Type-Options":  "nosniff",
		"Referrer-Policy":         "no-referrer",
		"X-Frame-Options":         "DENY",
	}
	for name, value := range want {
		if got := recorder.Header().Values(name); len(got) != 1 || got[0] != value {
			t.Errorf("%s values = %q, want [%q]", name, got, value)
		}
	}
}

func TestHTTPSecurityMiddlewarePreservesWriterStreamingAndCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	writer := &securityStreamingWriter{header: make(http.Header)}
	request := httptest.NewRequest(http.MethodGet, "/stream", nil).WithContext(ctx)

	handler := httpSecurityMiddleware("default-src 'self';", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if w != writer {
			t.Error("middleware wrapped the response writer")
		}
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("middleware removed http.Flusher")
		}
		_, _ = w.Write([]byte("first"))
		flusher.Flush()
		cancel()
		<-r.Context().Done()
		_, _ = w.Write([]byte("second"))
		flusher.Flush()
	}))
	handler.ServeHTTP(writer, request)

	if writer.writes != 2 || writer.flushes != 2 {
		t.Fatalf("writes/flushes = %d/%d, want 2/2", writer.writes, writer.flushes)
	}
	if request.Context().Err() != context.Canceled {
		t.Fatalf("request context error = %v, want context canceled", request.Context().Err())
	}
}

func TestEmbeddedUIContentSecurityPolicyMatchesServedDocument(t *testing.T) {
	policy, err := embeddedUIContentSecurityPolicy()
	if err != nil {
		t.Fatalf("derive embedded UI CSP: %v", err)
	}
	recorder := httptest.NewRecorder()
	NewRouter(HTTPServerConfig{}).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET / status = %d, want 200", recorder.Code)
	}
	if got := contentSecurityPolicyForDocument(recorder.Body.String()); got != policy {
		t.Fatalf("served document CSP = %q, precomputed policy = %q", got, policy)
	}
	if got := recorder.Header().Get("Content-Security-Policy"); got != policy {
		t.Fatalf("response CSP = %q, want %q", got, policy)
	}
}

func TestEmbeddedUIAvoidsInlineStyleMutationCalls(t *testing.T) {
	root, err := embeddedUIRoot()
	if err != nil {
		t.Fatalf("open embedded UI: %v", err)
	}
	forbidden := []string{".style.", `setAttribute("style"`, `setAttribute('style'`, `id="svelte-announcer" aria-live="assertive" aria-atomic="true" style=`}
	if err := fs.WalkDir(root, ".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".js") {
			return nil
		}
		body, err := fs.ReadFile(root, path)
		if err != nil {
			return err
		}
		for _, fragment := range forbidden {
			if strings.Contains(string(body), fragment) {
				t.Errorf("embedded executable %s contains inline style mutation %q", path, fragment)
			}
		}
		return nil
	}); err != nil {
		t.Fatalf("scan embedded UI scripts: %v", err)
	}
}

func testCSPHash(body string) string {
	sum := sha256.Sum256([]byte(body))
	return "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
}

type securityStreamingWriter struct {
	header  http.Header
	writes  int
	flushes int
}

func (w *securityStreamingWriter) Header() http.Header         { return w.header }
func (w *securityStreamingWriter) WriteHeader(int)             {}
func (w *securityStreamingWriter) Write(p []byte) (int, error) { w.writes++; return len(p), nil }
func (w *securityStreamingWriter) Flush()                      { w.flushes++ }

var _ http.Flusher = (*securityStreamingWriter)(nil)
