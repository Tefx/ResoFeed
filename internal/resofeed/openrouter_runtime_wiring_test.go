package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestServeRuntimeWiresOpenRouterThroughIngestHTTPMCPDoctor(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	db := newContractDB(t, ctx)
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/rss+xml")
		_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>Runtime Source</title><item><guid>runtime-openrouter</guid><title>Runtime OpenRouter Item</title><link>https://article.invalid/runtime</link><description>runtime fallback body for openrouter wiring</description><pubDate>Sat, 09 May 2026 12:00:00 +0000</pubDate></item></channel></rss>`)
	}))
	defer feed.Close()
	insertRuntimeSource(t, ctx, db, feed.URL)

	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"chatcmpl_runtime","model":"openrouter/resolved-runtime","choices":[{"message":{"role":"assistant","content":"{\"title\":\"Runtime OpenRouter Item\",\"feed_excerpt\":\"Runtime excerpt.\",\"extracted_text\":\"Runtime extracted text.\",\"summary\":\"Runtime dense summary.\",\"core_insight\":\"Runtime validated insight.\",\"value_tier\":\"high\",\"model_status\":\"ok\"}"}}]}`)
	}))
	defer model.Close()
	llm := &openRouterHTTPClient{apiKey: "fake-openrouter-runtime-key", model: "openrouter/configured-runtime", endpoint: model.URL, client: model.Client()}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen runtime test: %v", err)
	}
	baseURL := "http://" + listener.Addr().String()
	ingested := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		done <- serveHTTPAndIngestRuntimeOnListener(ctx, HTTPServerConfig{Addr: listener.Addr().String(), PublicURL: baseURL, DB: db, OwnerToken: contractOwnerToken, LLM: llm}, listener, func(runCtx context.Context) error {
			if err := IngestOnce(runCtx, db, IngestConfig{LLM: llm}); err != nil {
				return err
			}
			close(ingested)
			<-runCtx.Done()
			return nil
		})
	}()

	select {
	case <-ingested:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for runtime ingest through OpenRouter client")
	}

	httpDoctor := getAuthorizedText(t, baseURL+"/api/doctor")
	assertRuntimeDoctorOpenRouterStatus(t, httpDoctor)
	t.Logf("HTTP /api/doctor output:\n%s", httpDoctor)
	mcpDoctor := mcpDoctorText(t, baseURL+"/mcp")
	assertRuntimeDoctorOpenRouterStatus(t, mcpDoctor)
	t.Logf("MCP resofeed://system/doctor output:\n%s", mcpDoctor)

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("runtime returned error: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("runtime did not shut down")
	}
}

func insertRuntimeSource(t *testing.T, ctx context.Context, db *sql.DB, feedURL string) {
	t.Helper()
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, 'not_fetched', 1, 1)`, "src_runtime_openrouter", feedURL, "Runtime", time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("insert runtime source: %v", err)
	}
}

func getAuthorizedText(t *testing.T, url string) string {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatalf("create authorized request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+contractOwnerToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("authorized GET %s: %v", url, err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read authorized response: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("authorized GET %s status=%d body=%s", url, resp.StatusCode, string(body))
	}
	return string(body)
}

func mcpDoctorText(t *testing.T, url string) string {
	t.Helper()
	body := []byte(`{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"resofeed://system/doctor"}}`)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("create MCP doctor request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+contractOwnerToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("MCP doctor request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read MCP doctor response: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("MCP doctor status=%d body=%s", resp.StatusCode, string(responseBody))
	}
	var response struct {
		Result struct {
			Contents []struct {
				Text string `json:"text"`
			} `json:"contents"`
		} `json:"result"`
	}
	if err := json.Unmarshal(responseBody, &response); err != nil {
		t.Fatalf("decode MCP doctor response: %v body=%s", err, string(responseBody))
	}
	if len(response.Result.Contents) != 1 {
		t.Fatalf("MCP doctor contents=%d body=%s", len(response.Result.Contents), string(responseBody))
	}
	return response.Result.Contents[0].Text
}

func assertRuntimeDoctorOpenRouterStatus(t *testing.T, body string) {
	t.Helper()
	bareStatusLines := 0
	for _, line := range strings.Split(body, "\n") {
		if strings.TrimSpace(line) == "openrouter: ok" {
			bareStatusLines++
		}
	}
	if bareStatusLines != 0 {
		t.Fatalf("doctor output included redundant bare OpenRouter status line:\n%s", body)
	}
	for _, want := range []string{"openrouter: ok", "configured_model=openrouter/configured-runtime", "resolved_model=openrouter/resolved-runtime"} {
		if !strings.Contains(body, want) {
			t.Fatalf("doctor output missing %q:\n%s", want, body)
		}
	}
	for _, forbidden := range []string{"gemini", "fake-openrouter-runtime-key"} {
		if strings.Contains(strings.ToLower(body), strings.ToLower(forbidden)) {
			t.Fatalf("doctor output leaked forbidden text %q:\n%s", forbidden, body)
		}
	}
}
