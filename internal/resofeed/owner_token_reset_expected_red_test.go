package resofeed

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExpectedRedOwnerTokenResetDeletesOnlyOwnerTokenHash(t *testing.T) {
	ctx := context.Background()
	dbPath := newExpectedRedResetDBFile(t, ctx)

	var stdout, stderr bytes.Buffer
	code := Main([]string{"owner-token", "reset", "--db", dbPath, "--confirm-reset"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("resofeed owner-token reset --db PATH --confirm-reset code=%d, want 0; stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	assertOwnerTokenResetDoesNotExposeReplacementToken(t, stdout.String(), stderr.String())

	db := openExpectedRedResetDB(t, ctx, dbPath)
	defer func() { _ = db.Close() }()
	assertRuntimeMetadataMissing(t, ctx, db, "owner_token_sha256")
	assertRuntimeMetadataValue(t, ctx, db, "startup_mode", "preserve-me")
	assertScalarCount(t, ctx, db, `select count(*) from sources where id = 'src_reset_expected_red' and title = 'Reset Expected Red Source'`, 1)
	assertScalarCount(t, ctx, db, `select count(*) from steer_rules where id = 'rule_reset_expected_red' and rule_text = 'Prefer protocol analysis.'`, 1)
	assertScalarCount(t, ctx, db, `select count(*) from item_state where item_id = 'item_reset_expected_red' and is_resonated = 1`, 1)
}

func TestExpectedRedOwnerTokenResetRequiresConfirmationAndLeavesHashUnchanged(t *testing.T) {
	ctx := context.Background()
	dbPath := newExpectedRedResetDBFile(t, ctx)

	var stdout, stderr bytes.Buffer
	code := Main([]string{"owner-token", "reset", "--db", dbPath}, &stdout, &stderr)
	if code == 0 {
		t.Fatalf("reset without --confirm-reset unexpectedly succeeded; stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
	if !strings.Contains(stderr.String(), "--confirm-reset") {
		t.Fatalf("reset without confirmation stderr=%q, want terse confirmation error", stderr.String())
	}
	assertOwnerTokenResetDoesNotExposeReplacementToken(t, stdout.String(), stderr.String())

	db := openExpectedRedResetDB(t, ctx, dbPath)
	defer func() { _ = db.Close() }()
	assertRuntimeMetadataValue(t, ctx, db, "owner_token_sha256", "lost_plaintext_hash")
}

func TestExpectedRedOwnerTokenResetInvalidDBPathDoesNotCreateProductState(t *testing.T) {
	tempDir := t.TempDir()
	parentFile := filepath.Join(tempDir, "not-a-directory")
	if err := os.WriteFile(parentFile, []byte("sentinel"), 0o644); err != nil {
		t.Fatalf("write parent sentinel: %v", err)
	}
	invalidDBPath := filepath.Join(parentFile, "resofeed.sqlite3")
	sentinelDBPath := filepath.Join(tempDir, "sentinel-resofeed.sqlite3")

	var stdout, stderr bytes.Buffer
	code := Main([]string{"owner-token", "reset", "--db", invalidDBPath, "--confirm-reset"}, &stdout, &stderr)
	if code == 0 {
		t.Fatalf("reset with invalid db path unexpectedly succeeded; stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
	if !strings.Contains(stderr.String(), "invalid_db") {
		t.Fatalf("stderr=%q, want invalid_db", stderr.String())
	}
	assertOwnerTokenResetDoesNotExposeReplacementToken(t, stdout.String(), stderr.String())
	assertPathDoesNotExist(t, invalidDBPath)
	assertPathDoesNotExist(t, sentinelDBPath)
}

func TestExpectedRedOwnerTokenResetOutputNeverContainsReplacementToken(t *testing.T) {
	ctx := context.Background()
	dbPath := newExpectedRedResetDBFile(t, ctx)

	var stdout, stderr bytes.Buffer
	_ = Main([]string{"owner-token", "reset", "--db", dbPath, "--confirm-reset"}, &stdout, &stderr)
	assertOwnerTokenResetDoesNotExposeReplacementToken(t, stdout.String(), stderr.String())
}

func TestExpectedRedServeAfterResetWithoutOwnerTokenGeneratesAndStoresNewHash(t *testing.T) {
	ctx := context.Background()
	dbPath := newExpectedRedResetDBFile(t, ctx)

	var resetOut, resetErr bytes.Buffer
	resetCode := Main([]string{"owner-token", "reset", "--db", dbPath, "--confirm-reset"}, &resetOut, &resetErr)
	if resetCode != 0 {
		t.Fatalf("reset before generated-token serve code=%d, want 0; stdout=%q stderr=%q", resetCode, resetOut.String(), resetErr.String())
	}
	assertOwnerTokenResetDoesNotExposeReplacementToken(t, resetOut.String(), resetErr.String())

	occupied := occupyExpectedRedAddr(t)
	defer func() { _ = occupied.Close() }()
	t.Setenv("OPENROUTER_KEY", "test-key")
	var serveOut, serveErr bytes.Buffer
	serveCode := Main([]string{"serve", "--addr", occupied.Addr().String(), "--db", dbPath}, &serveOut, &serveErr)
	if serveCode != 1 || !strings.Contains(serveErr.String(), "runtime_failed") {
		t.Fatalf("serve after reset code=%d, want occupied-port runtime failure after token resolution; stdout=%q stderr=%q", serveCode, serveOut.String(), serveErr.String())
	}
	if !strings.Contains(serveOut.String(), "owner token generated: rfeed_") {
		t.Fatalf("serve after reset stdout=%q, want generated token printed once", serveOut.String())
	}

	db := openExpectedRedResetDB(t, ctx, dbPath)
	defer func() { _ = db.Close() }()
	stored := readRuntimeMetadataValue(t, ctx, db, "owner_token_sha256")
	if stored == "lost_plaintext_hash" || len(stored) != sha256HexLength {
		t.Fatalf("owner token hash after generated-token serve = %q, want new SHA-256 hash", stored)
	}
}

func TestExpectedRedServeAfterResetWithExplicitOwnerTokenStoresExplicitHash(t *testing.T) {
	ctx := context.Background()
	dbPath := newExpectedRedResetDBFile(t, ctx)
	replacementToken := "rfeed_replacement0123456789abcdefghijklmnopqrstuvwxyzAB"
	wantHash := expectedRedOwnerTokenHash(replacementToken)

	var resetOut, resetErr bytes.Buffer
	resetCode := Main([]string{"owner-token", "reset", "--db", dbPath, "--confirm-reset"}, &resetOut, &resetErr)
	if resetCode != 0 {
		t.Fatalf("reset before explicit-token serve code=%d, want 0; stdout=%q stderr=%q", resetCode, resetOut.String(), resetErr.String())
	}
	assertOwnerTokenResetDoesNotExposeReplacementToken(t, resetOut.String(), resetErr.String())

	occupied := occupyExpectedRedAddr(t)
	defer func() { _ = occupied.Close() }()
	t.Setenv("OPENROUTER_KEY", "test-key")
	var serveOut, serveErr bytes.Buffer
	serveCode := Main([]string{"serve", "--addr", occupied.Addr().String(), "--db", dbPath, "--owner-token", replacementToken}, &serveOut, &serveErr)
	if serveCode != 1 || !strings.Contains(serveErr.String(), "runtime_failed") {
		t.Fatalf("explicit-token serve after reset code=%d, want occupied-port runtime failure after token resolution; stdout=%q stderr=%q", serveCode, serveOut.String(), serveErr.String())
	}
	if !strings.Contains(serveOut.String(), "owner token explicit: stored hash") {
		t.Fatalf("explicit-token serve stdout=%q, want explicit token startup path", serveOut.String())
	}
	if strings.Contains(serveOut.String(), replacementToken) || strings.Contains(serveErr.String(), replacementToken) {
		t.Fatalf("explicit-token serve leaked plaintext replacement token; stdout=%q stderr=%q", serveOut.String(), serveErr.String())
	}

	db := openExpectedRedResetDB(t, ctx, dbPath)
	defer func() { _ = db.Close() }()
	assertRuntimeMetadataValue(t, ctx, db, "owner_token_sha256", wantHash)
}

func TestExpectedRedOwnerTokenResetForbiddenSurfacesRemainAbsent(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Main([]string{"serve", "--reset-owner-token", "--db", filepath.Join(t.TempDir(), "resofeed.sqlite3")}, &stdout, &stderr)
	if code == 0 || !strings.Contains(stderr.String(), "flag provided but not defined") {
		t.Fatalf("serve --reset-owner-token surface accepted or changed error: code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/owner-token/reset", nil)
	req.Header.Set("Authorization", "Bearer "+contractOwnerToken)
	NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken}).ServeHTTP(recorder, req)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("HTTP reset route status=%d, want 404 not found; body=%q", recorder.Code, recorder.Body.String())
	}

	for _, tool := range mcpToolList() {
		name, _ := tool["name"].(string)
		if strings.Contains(strings.ToLower(name), "reset") || strings.Contains(strings.ToLower(name), "owner_token") || strings.Contains(strings.ToLower(name), "owner-token") {
			t.Fatalf("MCP reset-like tool exposed: %q", name)
		}
	}
	for _, resource := range mcpResourceList() {
		uri := resource["uri"]
		if strings.Contains(strings.ToLower(uri), "reset") || strings.Contains(strings.ToLower(uri), "owner_token") || strings.Contains(strings.ToLower(uri), "owner-token") {
			t.Fatalf("MCP reset-like resource exposed: %q", uri)
		}
	}

	assertSourceFileDoesNotContain(t, filepath.Join("web", "src", "routes", "+page.svelte"), []string{"reset-owner-token", "owner-token/reset", "owner_token_sha256"})
	assertSourceFileDoesNotContain(t, filepath.Join("web", "src", "routes", "components", "OwnerTokenPrompt.svelte"), []string{"reset-owner-token", "owner-token/reset", "owner_token_sha256"})
}

func TestExpectedRedBrowserOwnerTokenClearingIsClientLocalOnly(t *testing.T) {
	page := readProjectFile(t, filepath.Join("web", "src", "routes", "+page.svelte"))
	if !strings.Contains(page, "const tokenStorageKey = 'resofeed.ownerToken'") {
		t.Fatalf("UI token storage key drifted; +page.svelte no longer pins resofeed.ownerToken")
	}
	if !strings.Contains(page, "window.localStorage.removeItem(tokenStorageKey)") {
		t.Fatalf("browser token clearing path missing from +page.svelte")
	}
	for _, forbidden := range []string{"owner-token/reset", "reset-owner-token", "owner_token_sha256"} {
		if strings.Contains(page, forbidden) {
			t.Fatalf("browser-local token clearing gained SQLite/server reset surface %q", forbidden)
		}
	}

	apiClient := readProjectFile(t, filepath.Join("web", "src", "lib", "api-client.ts"))
	if strings.Contains(apiClient, "owner-token/reset") || strings.Contains(apiClient, "reset-owner-token") {
		t.Fatalf("API client exposes owner-token reset path: %q", apiClient)
	}
}

const sha256HexLength = 64

func newExpectedRedResetDBFile(t *testing.T, ctx context.Context) string {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "resofeed.sqlite3")
	db, err := OpenDB(ctx, dbPath)
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	if err := RunMigrations(ctx, db); err != nil {
		_ = db.Close()
		t.Fatalf("RunMigrations: %v", err)
	}
	seedExpectedRedResetState(t, ctx, db)
	if err := db.Close(); err != nil {
		t.Fatalf("close seeded db: %v", err)
	}
	return dbPath
}

func seedExpectedRedResetState(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	queries := []string{
		`insert into runtime_metadata (key, value, updated_at) values ('owner_token_sha256', 'lost_plaintext_hash', 1)`,
		`insert into runtime_metadata (key, value, updated_at) values ('startup_mode', 'preserve-me', 1)`,
		`insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values ('src_reset_expected_red', 'https://reset.example/feed.xml', 'Reset Expected Red Source', '2026-05-11T00:00:00Z', 'ok', 1, 7)`,
		`insert into steer_rules (id, rule_text, is_active, created_at, revision) values ('rule_reset_expected_red', 'Prefer protocol analysis.', 1, '2026-05-11T00:00:00Z', 3)`,
		`insert into items (id, source_id, url, title, first_seen_at, extraction_status, model_status) values ('item_reset_expected_red', 'src_reset_expected_red', 'https://reset.example/item', 'Reset item', '2026-05-11T00:00:00Z', 'full', 'ok')`,
		`insert into item_state (item_id, is_resonated, human_inspected_at, last_actor_kind, last_actor_id) values ('item_reset_expected_red', 1, '2026-05-11T00:00:00Z', 'human', 'owner')`,
	}
	for _, query := range queries {
		if _, err := db.ExecContext(ctx, query); err != nil {
			t.Fatalf("seed query %q: %v", query, err)
		}
	}
}

func openExpectedRedResetDB(t *testing.T, ctx context.Context, dbPath string) *sql.DB {
	t.Helper()
	db, err := OpenDB(ctx, dbPath)
	if err != nil {
		t.Fatalf("OpenDB(%s): %v", dbPath, err)
	}
	return db
}

func assertRuntimeMetadataMissing(t *testing.T, ctx context.Context, db *sql.DB, key string) {
	t.Helper()
	var value string
	err := db.QueryRowContext(ctx, `select value from runtime_metadata where key = ?`, key).Scan(&value)
	if err != sql.ErrNoRows {
		t.Fatalf("runtime_metadata[%s] err=%v value=%q, want sql.ErrNoRows", key, err, value)
	}
}

func assertRuntimeMetadataValue(t *testing.T, ctx context.Context, db *sql.DB, key string, want string) {
	t.Helper()
	got := readRuntimeMetadataValue(t, ctx, db, key)
	if got != want {
		t.Fatalf("runtime_metadata[%s]=%q, want %q", key, got, want)
	}
}

func readRuntimeMetadataValue(t *testing.T, ctx context.Context, db *sql.DB, key string) string {
	t.Helper()
	var got string
	if err := db.QueryRowContext(ctx, `select value from runtime_metadata where key = ?`, key).Scan(&got); err != nil {
		t.Fatalf("read runtime_metadata[%s]: %v", key, err)
	}
	return got
}

func assertScalarCount(t *testing.T, ctx context.Context, db *sql.DB, query string, want int) {
	t.Helper()
	var got int
	if err := db.QueryRowContext(ctx, query).Scan(&got); err != nil {
		t.Fatalf("count query %q: %v", query, err)
	}
	if got != want {
		t.Fatalf("count query %q = %d, want %d", query, got, want)
	}
}

func assertPathDoesNotExist(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); err == nil {
		t.Fatalf("path %s exists, want absent", path)
	} else if !os.IsNotExist(err) && !strings.Contains(err.Error(), "not a directory") {
		t.Fatalf("stat %s: %v", path, err)
	}
}

func occupyExpectedRedAddr(t *testing.T) net.Listener {
	t.Helper()
	listener, err := netListen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve occupied addr: %v", err)
	}
	return listener
}

func expectedRedOwnerTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func assertSourceFileDoesNotContain(t *testing.T, relativePath string, forbidden []string) {
	t.Helper()
	content := readProjectFile(t, relativePath)
	for _, needle := range forbidden {
		if strings.Contains(content, needle) {
			t.Fatalf("%s contains forbidden reset surface %q", relativePath, needle)
		}
	}
}

func readProjectFile(t *testing.T, relativePath string) string {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(projectRootForExpectedRed(t), relativePath))
	if err != nil {
		t.Fatalf("read %s: %v", relativePath, err)
	}
	return string(content)
}

func projectRootForExpectedRed(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("go.mod not found from working directory")
		}
		dir = parent
	}
}

var netListen = func(network string, address string) (net.Listener, error) {
	return net.Listen(network, address)
}

func TestExpectedRedMCPListsMarshalWithoutResetSurface(t *testing.T) {
	payload, err := json.Marshal(struct {
		Tools     []map[string]any    `json:"tools"`
		Resources []map[string]string `json:"resources"`
	}{Tools: mcpToolList(), Resources: mcpResourceList()})
	if err != nil {
		t.Fatalf("marshal MCP surface lists: %v", err)
	}
	lower := strings.ToLower(string(payload))
	for _, forbidden := range []string{"reset", "owner-token", "owner_token"} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("MCP surface exposes forbidden reset term %q in %s", forbidden, string(payload))
		}
	}
}

func TestExpectedRedNoSettingsResetControlInStaticRoutes(t *testing.T) {
	for _, relativePath := range []string{
		filepath.Join("web", "src", "routes", "+page.svelte"),
		filepath.Join("web", "src", "routes", "components", "OwnerTokenPrompt.svelte"),
		filepath.Join("web", "src", "routes", "components", "StatePortability.svelte"),
	} {
		content := readProjectFile(t, relativePath)
		lower := strings.ToLower(content)
		if strings.Contains(lower, "settings") && strings.Contains(lower, "reset") && strings.Contains(lower, "owner") {
			t.Fatalf("%s appears to expose a Settings/UI owner-token reset control", relativePath)
		}
	}
}

func TestExpectedRedNoHTTPResetRouteInRouterPaths(t *testing.T) {
	for _, rawPath := range []string{"/api/owner-token/reset", "/api/runtime/owner-token/reset", "/api/reset-owner-token"} {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, rawPath, nil)
		req.Header.Set("Authorization", "Bearer "+contractOwnerToken)
		NewRouter(HTTPServerConfig{OwnerToken: contractOwnerToken}).ServeHTTP(recorder, req)
		if recorder.Code != http.StatusNotFound {
			t.Fatalf("HTTP reset-like route %s status=%d, want 404; body=%q", rawPath, recorder.Code, recorder.Body.String())
		}
	}
}

func TestExpectedRedNoURLAddressableBrowserResetControl(t *testing.T) {
	page := readProjectFile(t, filepath.Join("web", "src", "routes", "+page.svelte"))
	for _, raw := range []string{"/settings", "/reset-owner-token", "/owner-token/reset"} {
		if strings.Contains(page, url.PathEscape(raw)) || strings.Contains(page, raw) {
			t.Fatalf("browser page exposes reset/settings route %q", raw)
		}
	}
}
