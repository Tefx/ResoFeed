package resofeed

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

const rfBugOwnerToken = "rfeed_rf_bug_contract_owner_token_00000000000000000000"

var (
	rfBugScriptPattern = regexp.MustCompile(`(?is)<script\b([^>]*)>(.*?)</script\s*>`)
	rfBugLinkPattern   = regexp.MustCompile(`(?is)<link\b([^>]*)>`)
)

func TestRFBUG003EmbeddedUIContract(t *testing.T) {
	const exactSubtestCount = 23
	t.Logf("RF-BUG-003_EXACT_SUBTEST_SET=%d", exactSubtestCount)

	root := rfBugServeStatic(t, http.MethodGet, "/", nil)
	scriptRefs := rfBugExecutableResourceRefs(root.Body.String())
	styleRefs := rfBugStyleResourceRefs(root.Body.String())

	tests := []struct {
		name string
		run  func(*testing.T)
	}{
		{name: "browser_script_classification_fixtures", run: func(t *testing.T) {
			fixture := `<script>classic()</script><script type="text/javascript">legacy()</script><script type="module">module()</script><script type="application/json">{"data":true}</script><script src="/assets/app.js"></script>`
			bodies := rfBugInlineExecutableBodies(fixture)
			if len(bodies) != 3 {
				t.Fatalf("browser executable script bodies = %d, want 3", len(bodies))
			}
			t.Log("RF-BUG-003_BROWSER_SCRIPT_CLASSIFICATION_FIXTURES=complete")
		}},
		{name: "csp_crlf_normalization", run: func(t *testing.T) {
			fixture := "line1\r\nline2\rline3\n"
			got := rfBugNormalizeBrowserScriptText(fixture)
			if got != "line1\nline2\nline3\n" {
				t.Fatalf("browser script CR/LF normalization = %q", got)
			}
			if rfBugCSPHash(fixture) != rfBugCSPHash(got) {
				t.Fatalf("CSP hash did not use Chromium-normalized script text")
			}
			t.Log("RF-BUG-003_CSP_CRLF_NORMALIZED=chromium")
		}},
		{name: "root_get_embedded", run: func(t *testing.T) {
			rfBugAssertStatus(t, root, http.StatusOK)
			if err := rfBugValidateBootstrap(root.Body.String()); err != nil {
				t.Errorf("embedded production bootstrap invalid: %v", err)
			}
		}},
		{name: "root_head_embedded", run: func(t *testing.T) {
			head := rfBugServeStatic(t, http.MethodHead, "/", nil)
			rfBugAssertStatus(t, head, http.StatusOK)
			if head.Body.Len() != 0 {
				t.Errorf("HEAD / body length = %d, want 0", head.Body.Len())
			}
			if got := head.Header().Get("Content-Type"); !strings.Contains(got, "text/html") {
				t.Errorf("HEAD / content type = %q, want text/html", got)
			}
		}},
		{name: "generated_script_get", run: func(t *testing.T) {
			ref := rfBugFirstRef(t, scriptRefs, "generated executable script")
			if ref == "" {
				return
			}
			response := rfBugServeStatic(t, http.MethodGet, ref, nil)
			rfBugAssertStatus(t, response, http.StatusOK)
			if response.Body.Len() == 0 {
				t.Errorf("GET %s returned an empty script", ref)
			}
		}},
		{name: "generated_script_head", run: func(t *testing.T) {
			ref := rfBugFirstRef(t, scriptRefs, "generated executable script")
			if ref == "" {
				return
			}
			response := rfBugServeStatic(t, http.MethodHead, ref, nil)
			rfBugAssertStatus(t, response, http.StatusOK)
			if response.Body.Len() != 0 {
				t.Errorf("HEAD %s body length = %d, want 0", ref, response.Body.Len())
			}
		}},
		{name: "generated_style_get", run: func(t *testing.T) {
			ref := rfBugFirstRef(t, styleRefs, "generated stylesheet")
			if ref == "" {
				return
			}
			response := rfBugServeStatic(t, http.MethodGet, ref, nil)
			rfBugAssertStatus(t, response, http.StatusOK)
			if response.Body.Len() == 0 {
				t.Errorf("GET %s returned an empty stylesheet", ref)
			}
		}},
		{name: "generated_style_head", run: func(t *testing.T) {
			ref := rfBugFirstRef(t, styleRefs, "generated stylesheet")
			if ref == "" {
				return
			}
			response := rfBugServeStatic(t, http.MethodHead, ref, nil)
			rfBugAssertStatus(t, response, http.StatusOK)
			if response.Body.Len() != 0 {
				t.Errorf("HEAD %s body length = %d, want 0", ref, response.Body.Len())
			}
		}},
		{name: "source_bytes_stable", run: func(t *testing.T) {
			ref := rfBugFirstRef(t, scriptRefs, "generated executable script")
			if ref == "" {
				return
			}
			first := rfBugServeStatic(t, http.MethodGet, ref, nil)
			second := rfBugServeStatic(t, http.MethodGet, ref, nil)
			if !bytes.Equal(first.Body.Bytes(), second.Body.Bytes()) {
				t.Errorf("embedded source bytes changed between identical GET requests for %s", ref)
			}
		}},
		{name: "range_request_preserves_bytes", run: func(t *testing.T) {
			ref := rfBugFirstRef(t, scriptRefs, "generated executable script")
			if ref == "" {
				return
			}
			full := rfBugServeStatic(t, http.MethodGet, ref, nil)
			if full.Body.Len() < 8 {
				t.Errorf("asset %s has %d bytes, need at least 8 for range proof", ref, full.Body.Len())
				return
			}
			partial := rfBugServeStatic(t, http.MethodGet, ref, map[string]string{"Range": "bytes=1-7"})
			rfBugAssertStatus(t, partial, http.StatusPartialContent)
			if !bytes.Equal(partial.Body.Bytes(), full.Body.Bytes()[1:8]) {
				t.Errorf("range bytes for %s did not preserve embedded source bytes", ref)
			}
		}},
		{name: "deep_link_today", run: func(t *testing.T) { rfBugAssertSPARoute(t, "/today") }},
		{name: "deep_link_source_ledger", run: func(t *testing.T) { rfBugAssertSPARoute(t, "/source-ledger") }},
		{name: "deep_link_search", run: func(t *testing.T) { rfBugAssertSPARoute(t, "/search") }},
		{name: "deep_link_inspector", run: func(t *testing.T) { rfBugAssertSPARoute(t, "/items/opaque-item-id") }},
		{name: "static_miss_get", run: func(t *testing.T) {
			response := rfBugServeStatic(t, http.MethodGet, "/_app/immutable/assets/rf-bug-missing.css", nil)
			rfBugAssertStatus(t, response, http.StatusNotFound)
			if strings.Contains(strings.ToLower(response.Body.String()), "<!doctype html") {
				t.Errorf("static miss returned SPA HTML")
			}
		}},
		{name: "static_miss_head", run: func(t *testing.T) {
			response := rfBugServeStatic(t, http.MethodHead, "/_app/immutable/chunks/rf-bug-missing.js", nil)
			rfBugAssertStatus(t, response, http.StatusNotFound)
			if response.Body.Len() != 0 {
				t.Errorf("HEAD static miss body length = %d, want 0", response.Body.Len())
			}
		}},
		{name: "cwd_repository_root", run: func(t *testing.T) {
			wd, err := os.Getwd()
			if err != nil {
				t.Fatalf("get working directory: %v", err)
			}
			rfBugAssertEmbeddedFromDir(t, filepath.Clean(filepath.Join(wd, "..", "..")))
		}},
		{name: "cwd_temporary_directory", run: func(t *testing.T) { rfBugAssertEmbeddedFromDir(t, t.TempDir()) }},
		{name: "cwd_filesystem_root", run: func(t *testing.T) { rfBugAssertEmbeddedFromDir(t, string(filepath.Separator)) }},
		{name: "invalid_bootstrap_rejected", run: func(t *testing.T) {
			for name, invalid := range map[string]string{
				"missing_script":   `<!doctype html><html><body>RESOFEED</body></html>`,
				"empty_executable": "<!doctype html><script type=\"module\">\r\n\r</script>",
			} {
				if err := rfBugValidateBootstrap(invalid); err == nil {
					t.Errorf("invalid bootstrap fixture %s was accepted", name)
				}
			}
		}},
		{name: "pre_bind_validation_order", run: func(t *testing.T) {
			source, err := os.ReadFile("http.go")
			if err != nil {
				t.Fatalf("read http.go: %v", err)
			}
			body := rfBugFunctionSource(string(source), "ServeHTTPAndIngestRuntime")
			listenAt := strings.Index(body, "net.Listen")
			prefix := strings.ToLower(body)
			validateAt := strings.Index(prefix, "validate")
			if listenAt < 0 || validateAt < 0 || validateAt > listenAt || !(strings.Contains(prefix[:listenAt], "ui") || strings.Contains(prefix[:listenAt], "bootstrap") || strings.Contains(prefix[:listenAt], "static")) {
				t.Errorf("expected listener to remain unbound: embedded bootstrap validation must complete before net.Listen")
			}
		}},
		{name: "production_index_has_no_external_registry", run: func(t *testing.T) {
			httpSource, err := os.ReadFile("http.go")
			if err != nil {
				t.Fatalf("read http.go: %v", err)
			}
			active := string(httpSource)
			if staticSource, err := os.ReadFile("http_static.go"); err == nil {
				active += "\n" + string(staticSource)
			} else if !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("read http_static.go: %v", err)
			}
			if strings.Contains(active, `filepath.Join("web", "build")`) || strings.Contains(active, `http.Dir(root)`) {
				t.Errorf("production UI still depends on an external web/build registry")
			}
		}},
		{name: "binary_only_container_runtime", run: func(t *testing.T) {
			dockerfile, err := os.ReadFile(filepath.Join("..", "..", "Dockerfile"))
			if err != nil {
				t.Fatalf("read Dockerfile: %v", err)
			}
			upper := strings.ToUpper(string(dockerfile))
			lastFrom := strings.LastIndex(upper, "\nFROM ")
			if lastFrom < 0 && strings.HasPrefix(upper, "FROM ") {
				lastFrom = 0
			}
			finalStage := upper[lastFrom:]
			if strings.Contains(finalStage, "NODE") || strings.Contains(finalStage, "NPM ") {
				t.Errorf("final container stage retains a Node runtime dependency")
			}
			if !strings.Contains(finalStage, "RESOFEED") {
				t.Errorf("final container stage does not copy the ResoFeed binary")
			}
		}},
	}

	if len(tests) != exactSubtestCount {
		t.Fatalf("RF-BUG-003 subtest definitions = %d, want %d", len(tests), exactSubtestCount)
	}
	for _, test := range tests {
		t.Run(test.name, test.run)
	}
}

func TestRFBUG003DoctorRedactionContract(t *testing.T) {
	ctx := context.Background()
	db := rfBugContractDB(t, ctx)
	t.Setenv("OPENROUTER_KEY", "rf-bug-doctor-env-secret")

	configuredSecret := "rf-bug-configured-secret\nui_assets=forged"
	resolvedSecret := "rf-bug-resolved-secret\r\nOPENROUTER_KEY=forged"
	var output bytes.Buffer
	if err := WriteDoctorWithConfig(ctx, db, DoctorConfig{
		ConfiguredOpenRouterModel: configuredSecret,
		ResolvedOpenRouterModel:   resolvedSecret,
	}, &output); err != nil {
		t.Fatalf("WriteDoctorWithConfig: %v", err)
	}

	text := output.String()
	for _, line := range []string{"ui_assets=ready", "ui_asset_source=embedded"} {
		if strings.Count(text, line+"\n") != 1 {
			t.Errorf("doctor line %q count = %d, want 1", line, strings.Count(text, line+"\n"))
		}
	}
	for label, forbidden := range map[string]string{
		"configured model line-breaking value": configuredSecret,
		"resolved model line-breaking value":   resolvedSecret,
		"environment secret":                   "rf-bug-doctor-env-secret",
		"forged UI diagnostic":                 "ui_assets=forged",
		"forged secret assignment":             "OPENROUTER_KEY=forged",
	} {
		if strings.Contains(text, forbidden) {
			t.Errorf("doctor leaked %s", label)
		}
	}
}

func TestRFBUG004OPMLImportOnlyContract(t *testing.T) {
	ctx := context.Background()
	db := rfBugContractDB(t, ctx)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: rfBugOwnerToken})

	t.Run("legacy_export_auth_precedence", func(t *testing.T) {
		unauthorized := rfBugRequest(router, http.MethodGet, "/api/sources/export-opml", "", nil, "")
		authorized := rfBugRequest(router, http.MethodGet, "/api/sources/export-opml", rfBugOwnerToken, nil, "")
		if unauthorized.Code != http.StatusUnauthorized || authorized.Code != http.StatusNotFound {
			t.Errorf("expected unauthenticated 401 and authenticated 404 for retired OPML export; got %d and %d", unauthorized.Code, authorized.Code)
		}
	})

	t.Run("import_and_JSON_State_remain_green", func(t *testing.T) {
		opml := []byte(`<?xml version="1.0"?><opml version="2.0"><body><outline text="RF BUG"><outline type="rss" text="RF BUG Feed" xmlUrl="https://rf-bug.example.test/feed.xml"/></outline></body></opml>`)
		imported := rfBugRequest(router, http.MethodPost, "/api/sources/import-opml", rfBugOwnerToken, opml, "application/xml")
		rfBugAssertStatus(t, imported, http.StatusOK)
		if !strings.Contains(imported.Body.String(), `"folders_flattened":true`) {
			t.Errorf("OPML import response did not preserve flattened source intake: %s", imported.Body.String())
		}

		exported := rfBugRequest(router, http.MethodGet, "/api/state/export", rfBugOwnerToken, nil, "")
		rfBugAssertStatus(t, exported, http.StatusOK)
		var bundle map[string]any
		if err := json.Unmarshal(exported.Body.Bytes(), &bundle); err != nil {
			t.Fatalf("decode State export: %v", err)
		}
		if bundle["schema_version"] != "resofeed.state.v1" {
			t.Errorf("State schema version = %v", bundle["schema_version"])
		}
		for _, field := range []string{"sources", "steer_rules", "resonated_items"} {
			if _, ok := bundle[field]; !ok {
				t.Errorf("State export missing portable field %s", field)
			}
		}
		for _, forbidden := range []string{"receipts", "history", "commands", "activities"} {
			if _, ok := bundle[forbidden]; ok {
				t.Errorf("State export included forbidden field %s", forbidden)
			}
		}

		restored := rfBugRequest(router, http.MethodPost, "/api/state/import", rfBugOwnerToken, exported.Body.Bytes(), "application/json")
		rfBugAssertStatus(t, restored, http.StatusOK)
	})
}

func TestRFBUG005SecurityHeadersCSPStreamingCancellationContract(t *testing.T) {
	const exactSubtestCount = 13
	t.Logf("RF-BUG-005_EXACT_SUBTEST_SET=%d", exactSubtestCount)

	ctx := context.Background()
	db := rfBugContractDB(t, ctx)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: rfBugOwnerToken})
	root := rfBugRequest(router, http.MethodGet, "/", "", nil, "")
	expectedCSP := rfBugCanonicalCSP(root.Body.String())

	tests := []struct {
		name string
		run  func(*testing.T)
	}{
		{name: "csp_exact_executable_hashes", run: func(t *testing.T) {
			rfBugAssertSecurityHeaders(t, root, expectedCSP, "static root")
			if strings.Contains(expectedCSP, "unsafe-inline") {
				t.Errorf("canonical CSP weakened inline script protection")
			}
		}},
		{name: "static_root_success", run: func(t *testing.T) {
			rfBugAssertStatus(t, root, http.StatusOK)
			rfBugAssertSecurityHeaders(t, root, expectedCSP, "static root success")
		}},
		{name: "static_deep_link_success", run: func(t *testing.T) {
			response := rfBugRequest(router, http.MethodGet, "/source-ledger", "", nil, "")
			rfBugAssertStatus(t, response, http.StatusOK)
			rfBugAssertSecurityHeaders(t, response, expectedCSP, "static deep link")
		}},
		{name: "static_not_found", run: func(t *testing.T) {
			response := rfBugRequest(router, http.MethodGet, "/_app/immutable/rf-bug-missing.js", "", nil, "")
			rfBugAssertStatus(t, response, http.StatusNotFound)
			rfBugAssertSecurityHeaders(t, response, expectedCSP, "static not found")
		}},
		{name: "api_success", run: func(t *testing.T) {
			response := rfBugRequest(router, http.MethodGet, "/api/sources", rfBugOwnerToken, nil, "")
			rfBugAssertStatus(t, response, http.StatusOK)
			rfBugAssertSecurityHeaders(t, response, expectedCSP, "API success")
		}},
		{name: "api_unauthorized", run: func(t *testing.T) {
			response := rfBugRequest(router, http.MethodGet, "/api/sources", "", nil, "")
			rfBugAssertStatus(t, response, http.StatusUnauthorized)
			rfBugAssertSecurityHeaders(t, response, expectedCSP, "API unauthorized")
		}},
		{name: "api_not_found", run: func(t *testing.T) {
			response := rfBugRequest(router, http.MethodGet, "/api/retired-rf-bug-route", rfBugOwnerToken, nil, "")
			rfBugAssertStatus(t, response, http.StatusNotFound)
			rfBugAssertSecurityHeaders(t, response, expectedCSP, "API not found")
		}},
		{name: "api_internal_error", run: func(t *testing.T) {
			broken := rfBugContractDB(t, ctx)
			if err := broken.Close(); err != nil {
				t.Fatalf("close internal-error fixture DB: %v", err)
			}
			brokenRouter := NewRouter(HTTPServerConfig{DB: broken, OwnerToken: rfBugOwnerToken})
			response := rfBugRequest(brokenRouter, http.MethodGet, "/api/sources", rfBugOwnerToken, nil, "")
			rfBugAssertStatus(t, response, http.StatusInternalServerError)
			rfBugAssertSecurityHeaders(t, response, expectedCSP, "API internal error")
		}},
		{name: "mcp_unauthorized", run: func(t *testing.T) {
			response := rfBugRequest(router, http.MethodPost, "/mcp", "", []byte(`{"jsonrpc":"2.0","id":1,"method":"initialize"}`), "application/json")
			rfBugAssertStatus(t, response, http.StatusUnauthorized)
			rfBugAssertSecurityHeaders(t, response, expectedCSP, "MCP unauthorized")
		}},
		{name: "mcp_method_error", run: func(t *testing.T) {
			response := rfBugRequest(router, http.MethodGet, "/mcp", rfBugOwnerToken, nil, "")
			rfBugAssertStatus(t, response, http.StatusBadRequest)
			rfBugAssertSecurityHeaders(t, response, expectedCSP, "MCP method error")
		}},
		{name: "headers_single_effective_values", run: func(t *testing.T) {
			for _, response := range []*httptest.ResponseRecorder{
				root,
				rfBugRequest(router, http.MethodGet, "/api/doctor", "", nil, ""),
				rfBugRequest(router, http.MethodPost, "/mcp", "", nil, "application/json"),
			} {
				for _, name := range []string{"Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options"} {
					if values := response.Header().Values(name); len(values) != 1 {
						t.Errorf("%s values = %d, want exactly one", name, len(values))
					}
				}
			}
		}},
		{name: "multi_flush_streaming", run: func(t *testing.T) {
			rfBugAssertMultiWriteStreaming(t, router, rfBugExecutableResourceRefs(root.Body.String()))
		}},
		{name: "request_cancellation", run: func(t *testing.T) {
			rfBugAssertRequestCancellation(t, db)
		}},
	}

	if len(tests) != exactSubtestCount {
		t.Fatalf("RF-BUG-005 subtest definitions = %d, want %d", len(tests), exactSubtestCount)
	}
	for _, test := range tests {
		t.Run(test.name, test.run)
	}
}

func rfBugContractDB(t *testing.T, ctx context.Context) *sqlDBAlias {
	t.Helper()
	db, err := OpenDB(ctx, filepath.Join(t.TempDir(), "resofeed.sqlite3"))
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := RunMigrations(ctx, db); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}
	return db
}

// sqlDBAlias keeps the acceptance helpers explicit without introducing a product abstraction.
type sqlDBAlias = sql.DB

func rfBugServeStatic(t *testing.T, method, target string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(method, target, nil)
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	staticUIHandler().ServeHTTP(recorder, request)
	return recorder
}

func rfBugRequest(handler http.Handler, method, target, token string, body []byte, contentType string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(method, target, bytes.NewReader(body))
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	handler.ServeHTTP(recorder, request)
	return recorder
}

func rfBugAssertStatus(t *testing.T, recorder *httptest.ResponseRecorder, want int) {
	t.Helper()
	if recorder.Code != want {
		t.Errorf("status = %d, want %d; body=%s", recorder.Code, want, strings.TrimSpace(recorder.Body.String()))
	}
}

func rfBugAssertSPARoute(t *testing.T, target string) {
	t.Helper()
	response := rfBugServeStatic(t, http.MethodGet, target, nil)
	rfBugAssertStatus(t, response, http.StatusOK)
	if err := rfBugValidateBootstrap(response.Body.String()); err != nil {
		t.Errorf("SPA route %s did not return the embedded bootstrap: %v", target, err)
	}
}

func rfBugAssertEmbeddedFromDir(t *testing.T, dir string) {
	t.Helper()
	original, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir %s: %v", dir, err)
	}
	defer func() {
		if err := os.Chdir(original); err != nil {
			t.Errorf("restore working directory: %v", err)
		}
	}()
	response := rfBugServeStatic(t, http.MethodGet, "/", nil)
	rfBugAssertStatus(t, response, http.StatusOK)
	if err := rfBugValidateBootstrap(response.Body.String()); err != nil {
		t.Errorf("embedded UI from cwd %s: %v", dir, err)
	}
}

func rfBugValidateBootstrap(document string) error {
	matches := rfBugScriptPattern.FindAllStringSubmatch(document, -1)
	if len(matches) == 0 {
		return errors.New("required script bootstrap missing")
	}
	for _, match := range matches {
		attrs, body := match[1], match[2]
		if rfBugAttribute(attrs, "src") != "" {
			return nil
		}
		if rfBugScriptTypeExecutable(rfBugAttribute(attrs, "type")) && strings.TrimSpace(rfBugNormalizeBrowserScriptText(body)) != "" {
			return nil
		}
	}
	return errors.New("required executable bootstrap body missing")
}

func rfBugInlineExecutableBodies(document string) []string {
	var bodies []string
	for _, match := range rfBugScriptPattern.FindAllStringSubmatch(document, -1) {
		attrs, body := match[1], match[2]
		if rfBugAttribute(attrs, "src") != "" || !rfBugScriptTypeExecutable(rfBugAttribute(attrs, "type")) {
			continue
		}
		normalized := rfBugNormalizeBrowserScriptText(body)
		if strings.TrimSpace(normalized) != "" {
			bodies = append(bodies, normalized)
		}
	}
	return bodies
}

func rfBugScriptTypeExecutable(scriptType string) bool {
	switch strings.ToLower(strings.TrimSpace(scriptType)) {
	case "", "module", "text/javascript", "application/javascript", "importmap":
		return true
	default:
		return false
	}
}

func rfBugAttribute(attrs, name string) string {
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

func rfBugExecutableResourceRefs(document string) []string {
	var refs []string
	for _, match := range rfBugScriptPattern.FindAllStringSubmatch(document, -1) {
		if src := rfBugAttribute(match[1], "src"); src != "" {
			refs = append(refs, rfBugURLPath(src))
		}
	}
	for _, match := range rfBugLinkPattern.FindAllStringSubmatch(document, -1) {
		href := rfBugAttribute(match[1], "href")
		rel := strings.ToLower(rfBugAttribute(match[1], "rel"))
		if href != "" && (strings.HasSuffix(strings.Split(href, "?")[0], ".js") || strings.Contains(rel, "modulepreload")) {
			refs = append(refs, rfBugURLPath(href))
		}
	}
	return rfBugUniqueSorted(refs)
}

func rfBugStyleResourceRefs(document string) []string {
	var refs []string
	for _, match := range rfBugLinkPattern.FindAllStringSubmatch(document, -1) {
		href := rfBugAttribute(match[1], "href")
		rel := strings.ToLower(rfBugAttribute(match[1], "rel"))
		if href != "" && (strings.Contains(rel, "stylesheet") || strings.HasSuffix(strings.Split(href, "?")[0], ".css")) {
			refs = append(refs, rfBugURLPath(href))
		}
	}
	return rfBugUniqueSorted(refs)
}

func rfBugURLPath(ref string) string {
	ref = strings.TrimPrefix(ref, ".")
	if !strings.HasPrefix(ref, "/") {
		ref = "/" + ref
	}
	if before, _, ok := strings.Cut(ref, "?"); ok {
		return before
	}
	return ref
}

func rfBugUniqueSorted(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if value != "" {
			seen[value] = struct{}{}
		}
	}
	result := make([]string, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func rfBugFirstRef(t *testing.T, refs []string, label string) string {
	t.Helper()
	if len(refs) == 0 {
		t.Errorf("embedded production %s reference missing", label)
		return ""
	}
	return refs[0]
}

func rfBugNormalizeBrowserScriptText(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "\r\n", "\n"), "\r", "\n")
}

func rfBugCSPHash(body string) string {
	sum := sha256.Sum256([]byte(rfBugNormalizeBrowserScriptText(body)))
	return "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
}

func rfBugCanonicalCSP(document string) string {
	hashes := make([]string, 0)
	seen := map[string]struct{}{}
	for _, body := range rfBugInlineExecutableBodies(document) {
		hash := rfBugCSPHash(body)
		if _, exists := seen[hash]; !exists {
			seen[hash] = struct{}{}
			hashes = append(hashes, hash)
		}
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

func rfBugAssertSecurityHeaders(t *testing.T, recorder *httptest.ResponseRecorder, expectedCSP, surface string) {
	t.Helper()
	if got := recorder.Header().Get("Content-Security-Policy"); got != expectedCSP {
		t.Errorf("expected byte-exact canonical CSP for %s; got %q want %q", surface, got, expectedCSP)
	}
	for name, want := range map[string]string{
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy":        "no-referrer",
		"X-Frame-Options":        "DENY",
	} {
		if got := recorder.Header().Get(name); got != want {
			t.Errorf("%s %s = %q, want %q", surface, name, got, want)
		}
	}
}

func rfBugFunctionSource(source, name string) string {
	start := strings.Index(source, "func "+name+"(")
	if start < 0 {
		return ""
	}
	end := strings.Index(source[start+1:], "\nfunc ")
	if end < 0 {
		return source[start:]
	}
	return source[start : start+1+end]
}

type rfBugStreamingWriter struct {
	header   http.Header
	status   int
	writes   int
	observed chan int
	release  chan struct{}
}

func (w *rfBugStreamingWriter) Header() http.Header    { return w.header }
func (w *rfBugStreamingWriter) WriteHeader(status int) { w.status = status }
func (w *rfBugStreamingWriter) Write(p []byte) (int, error) {
	w.writes++
	if w.writes <= 2 {
		w.observed <- w.writes
		<-w.release
	}
	return len(p), nil
}
func (w *rfBugStreamingWriter) Flush() {}

func rfBugAssertMultiWriteStreaming(t *testing.T, handler http.Handler, refs []string) {
	t.Helper()
	ref := rfBugFirstRef(t, refs, "executable asset for streaming")
	if ref == "" {
		return
	}
	writer := &rfBugStreamingWriter{header: make(http.Header), observed: make(chan int, 2), release: make(chan struct{}, 2)}
	done := make(chan struct{})
	go func() {
		handler.ServeHTTP(writer, httptest.NewRequest(http.MethodGet, ref, nil))
		close(done)
	}()

	select {
	case <-writer.observed:
	case <-done:
		t.Errorf("asset response completed without an observable streaming write")
		return
	case <-time.After(2 * time.Second):
		t.Errorf("timed out waiting for first streaming write")
		return
	}
	writer.release <- struct{}{}
	select {
	case <-writer.observed:
		writer.release <- struct{}{}
	case <-done:
		t.Errorf("asset response completed before a second streaming write")
		return
	case <-time.After(2 * time.Second):
		t.Errorf("timed out waiting for second streaming write")
		return
	}
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Errorf("streaming asset handler did not complete")
	}
}

type rfBugCancellationLLM struct {
	entered  chan struct{}
	canceled chan struct{}
	once     sync.Once
}

func (l *rfBugCancellationLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{}, errors.New("unexpected summary call")
}

func (l *rfBugCancellationLLM) TranslateSteering(ctx context.Context, _ OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	l.once.Do(func() { close(l.entered) })
	<-ctx.Done()
	close(l.canceled)
	return OpenRouterSteeringOutput{}, ctx.Err()
}

func rfBugAssertRequestCancellation(t *testing.T, db *sqlDBAlias) {
	t.Helper()
	llm := &rfBugCancellationLLM{entered: make(chan struct{}), canceled: make(chan struct{})}
	handler := NewRouter(HTTPServerConfig{DB: db, OwnerToken: rfBugOwnerToken, LLM: llm})
	ctx, cancel := context.WithCancel(context.Background())
	body := []byte(`{"command":"Prefer systems implementation evidence.","actor_kind":"human","actor_id":"owner","idempotency_key":"rf-bug-cancel-001"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/steer", bytes.NewReader(body)).WithContext(ctx)
	request.Header.Set("Authorization", "Bearer "+rfBugOwnerToken)
	request.Header.Set("Content-Type", "application/json")
	done := make(chan struct{})
	go func() {
		handler.ServeHTTP(httptest.NewRecorder(), request)
		close(done)
	}()

	select {
	case <-llm.entered:
	case <-time.After(2 * time.Second):
		cancel()
		t.Errorf("request did not reach cancellable handler")
		return
	}
	cancel()
	select {
	case <-llm.canceled:
	case <-time.After(2 * time.Second):
		t.Errorf("request cancellation did not reach handler context")
	}
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Errorf("canceled request handler did not return")
	}
}

var _ http.Flusher = (*rfBugStreamingWriter)(nil)
var _ io.Writer = (*rfBugStreamingWriter)(nil)
