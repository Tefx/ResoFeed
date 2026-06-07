package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// expected_result: red
// These tests lock the Tavily Extract wire and external-evidence sanitation
// contract before production Tavily support exists. Red must be caused by
// missing Tavily behavior, not compile or harness failures. The fake provider is
// reached through a test-only endpoint override; production must not add CLI
// flags, settings UI, provider registries, durable queues, or Tavily state.

const (
	tavilyExpectedRedAPIKey      = "tavily-contract-local-key"
	tavilyExpectedRedArticleHost = "tavily-contract.example"
)

var tavilyDefaultTransportMu sync.Mutex

func TestTavilyExpectedRedFakeServerWireShapeAndRawContentParsing(t *testing.T) {
	articleURL := tavilyExpectedRedArticleURL("wire-shape")
	rawContent := tavilyLongArticlePayload("wire contract article")
	provider := newTavilyExpectedRedProvider(t, func(w http.ResponseWriter, _ *http.Request) {
		writeTavilyJSON(t, w, map[string]any{
			"results": []map[string]any{{"url": articleURL, "raw_content": rawContent}},
		})
	})

	ctx := context.Background()
	db := tavilyExpectedRedDB(t, ctx)
	tavilySeedSelectedItem(t, ctx, db, articleURL)
	llm := &tavilyExpectedRedLLM{}
	tavilyInstallContractHTTPTransport(t)
	tavilyConfigureProviderEnv(t, provider.extractEndpoint())

	resp, err := ReingestItem(ctx, db, llm, "item_tavily_expected_red", tavilyExpectedRedReingestRequest("wire-shape"))
	if err != nil {
		t.Fatalf("ReingestItem returned error: %v", err)
	}

	assertTavilyExpectedRedWireRequest(t, provider.requests(), articleURL)
	assertTavilyExpectedRedCompleted(t, resp)
	input := llm.singleInput(t)
	if input.URL != articleURL {
		t.Fatalf("LLM input URL = %q, want selected article URL %q", input.URL, articleURL)
	}
	if input.AvailableTextSource != "external_tavily" {
		t.Fatalf("available_text_source = %q, want external_tavily", input.AvailableTextSource)
	}
	if !strings.Contains(input.AvailableText, "wire contract article") {
		t.Fatalf("LLM available_text did not include Tavily results[0].raw_content marker")
	}
	assertTavilyNoLeakInResponseOrDB(t, ctx, db, resp, []string{tavilyExpectedRedAPIKey, "Authorization", "Bearer "})
}

func TestTavilyExpectedRedFailedResultsWithoutUsableResultIsProviderUnavailable(t *testing.T) {
	articleURL := tavilyExpectedRedArticleURL("failed-results")
	provider := newTavilyExpectedRedProvider(t, func(w http.ResponseWriter, _ *http.Request) {
		writeTavilyJSON(t, w, map[string]any{
			"failed_results": []map[string]any{{"url": articleURL, "error": "provider refused secret-provider-body"}},
		})
	})
	ctx := context.Background()
	db := tavilyExpectedRedDB(t, ctx)
	tavilySeedSelectedItem(t, ctx, db, articleURL)
	llm := &tavilyExpectedRedLLM{}
	tavilyInstallContractHTTPTransport(t)
	tavilyConfigureProviderEnv(t, provider.extractEndpoint())

	resp, err := ReingestItem(ctx, db, llm, "item_tavily_expected_red", tavilyExpectedRedReingestRequest("failed-results"))
	if err != nil {
		t.Fatalf("ReingestItem returned error: %v", err)
	}

	assertTavilyExpectedRedWireRequest(t, provider.requests(), articleURL)
	assertTavilyExpectedRedError(t, resp, ReprocessErrorProviderError)
	llm.assertNotCalled(t)
	assertTavilyNoLeakInResponseOrDB(t, ctx, db, resp, []string{"secret-provider-body", tavilyExpectedRedAPIKey})
}

func TestTavilyExpectedRedProviderFailuresMalformedOversizedAndEmptyOutput(t *testing.T) {
	tests := []struct {
		name      string
		respond   func(t *testing.T, w http.ResponseWriter, articleURL string)
		wantCode  ReprocessErrorCode
		wantLLM   bool
		forbidden []string
	}{
		{
			name: "provider http error redacted",
			respond: func(_ *testing.T, w http.ResponseWriter, _ string) {
				http.Error(w, `provider raw error contains secret-provider-body`, http.StatusServiceUnavailable)
			},
			wantCode:  ReprocessErrorProviderError,
			forbidden: []string{"secret-provider-body"},
		},
		{
			name: "malformed json",
			respond: func(_ *testing.T, w http.ResponseWriter, _ string) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, `{not-json`)
			},
			wantCode: ReprocessErrorProviderError,
		},
		{
			name: "provider body over one mib",
			respond: func(_ *testing.T, w http.ResponseWriter, _ string) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, strings.Repeat("x", (1<<20)+1))
			},
			wantCode: ReprocessErrorProviderError,
		},
		{
			name: "empty raw content unusable",
			respond: func(t *testing.T, w http.ResponseWriter, articleURL string) {
				writeTavilyJSON(t, w, map[string]any{"results": []map[string]any{{"url": articleURL, "raw_content": "   \n\t"}}})
			},
			wantCode: ReprocessErrorOriginalUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			articleURL := tavilyExpectedRedArticleURL(tt.name)
			provider := newTavilyExpectedRedProvider(t, func(w http.ResponseWriter, _ *http.Request) {
				tt.respond(t, w, articleURL)
			})
			ctx := context.Background()
			db := tavilyExpectedRedDB(t, ctx)
			tavilySeedSelectedItem(t, ctx, db, articleURL)
			llm := &tavilyExpectedRedLLM{}
			tavilyInstallContractHTTPTransport(t)
			tavilyConfigureProviderEnv(t, provider.extractEndpoint())

			resp, err := ReingestItem(ctx, db, llm, "item_tavily_expected_red", tavilyExpectedRedReingestRequest(tt.name))
			if err != nil {
				t.Fatalf("ReingestItem returned error: %v", err)
			}

			assertTavilyExpectedRedWireRequest(t, provider.requests(), articleURL)
			assertTavilyExpectedRedError(t, resp, tt.wantCode)
			if tt.wantLLM {
				_ = llm.singleInput(t)
			} else {
				llm.assertNotCalled(t)
			}
			assertTavilyNoLeakInResponseOrDB(t, ctx, db, resp, append(tt.forbidden, tavilyExpectedRedAPIKey))
		})
	}
}

func TestTavilyExpectedRedTimeoutBehaviorAndNoAutomaticRetry(t *testing.T) {
	t.Run("context cancellation maps to timeout and preserves single provider attempt", func(t *testing.T) {
		articleURL := tavilyExpectedRedArticleURL("timeout")
		provider := newTavilyExpectedRedProvider(t, func(w http.ResponseWriter, r *http.Request) {
			select {
			case <-r.Context().Done():
				return
			case <-time.After(2 * time.Second):
				writeTavilyJSON(t, w, map[string]any{"results": []map[string]any{{"url": articleURL, "raw_content": tavilyLongArticlePayload("late timeout article")}}})
			}
		})
		ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
		defer cancel()
		db := tavilyExpectedRedDB(t, context.Background())
		tavilySeedSelectedItem(t, context.Background(), db, articleURL)
		llm := &tavilyExpectedRedLLM{}
		tavilyInstallContractHTTPTransport(t)
		tavilyConfigureProviderEnv(t, provider.extractEndpoint())

		resp, err := ReingestItem(ctx, db, llm, "item_tavily_expected_red", tavilyExpectedRedReingestRequest("timeout"))
		if err != nil {
			t.Fatalf("ReingestItem returned error: %v", err)
		}

		assertTavilyExpectedRedWireRequest(t, provider.requests(), articleURL)
		assertTavilyExpectedRedError(t, resp, ReprocessErrorTimeout)
		llm.assertNotCalled(t)
	})

	t.Run("provider error is not retried automatically", func(t *testing.T) {
		articleURL := tavilyExpectedRedArticleURL("no-retry")
		provider := newTavilyExpectedRedProvider(t, func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "temporary provider failure", http.StatusBadGateway)
		})
		ctx := context.Background()
		db := tavilyExpectedRedDB(t, ctx)
		tavilySeedSelectedItem(t, ctx, db, articleURL)
		llm := &tavilyExpectedRedLLM{}
		tavilyInstallContractHTTPTransport(t)
		tavilyConfigureProviderEnv(t, provider.extractEndpoint())

		resp, err := ReingestItem(ctx, db, llm, "item_tavily_expected_red", tavilyExpectedRedReingestRequest("no-retry"))
		if err != nil {
			t.Fatalf("ReingestItem returned error: %v", err)
		}

		assertTavilyExpectedRedWireRequest(t, provider.requests(), articleURL)
		if got := len(provider.requests()); got != 1 {
			t.Fatalf("Tavily provider request count = %d, want exactly one no-retry attempt", got)
		}
		assertTavilyExpectedRedError(t, resp, ReprocessErrorProviderError)
		llm.assertNotCalled(t)
	})
}

func TestTavilyExpectedRedExternalSanitationAcceptsArticleLikePayloads(t *testing.T) {
	tests := []struct {
		name       string
		articleURL string
		rawContent string
		mustKeep   []string
		mustDrop   []string
	}{
		{
			name:       "long article payload",
			articleURL: tavilyExpectedRedArticleURL("long-article"),
			rawContent: tavilyLongArticlePayload("long article acceptance"),
			mustKeep:   []string{"long article acceptance", "source-backed article paragraph"},
		},
		{
			name:       "non x javascript heavy article payload",
			articleURL: "http://nonx-js-heavy.example/articles/general-recovery",
			rawContent: tavilyJSHeavyArticlePayload(),
			mustKeep:   []string{"general external recovery article", "committee reviewed the incident timeline"},
			mustDrop:   []string{"window.__NUXT__", "Please enable JavaScript", "cookie settings"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider := newTavilyExpectedRedProvider(t, func(w http.ResponseWriter, _ *http.Request) {
				writeTavilyJSON(t, w, map[string]any{"results": []map[string]any{{"url": tt.articleURL, "raw_content": tt.rawContent}}})
			})
			ctx := context.Background()
			db := tavilyExpectedRedDB(t, ctx)
			tavilySeedSelectedItem(t, ctx, db, tt.articleURL)
			llm := &tavilyExpectedRedLLM{}
			tavilyInstallContractHTTPTransport(t)
			tavilyConfigureProviderEnv(t, provider.extractEndpoint())

			resp, err := ReingestItem(ctx, db, llm, "item_tavily_expected_red", tavilyExpectedRedReingestRequest(tt.name))
			if err != nil {
				t.Fatalf("ReingestItem returned error: %v", err)
			}

			assertTavilyExpectedRedWireRequest(t, provider.requests(), tt.articleURL)
			assertTavilyExpectedRedCompleted(t, resp)
			input := llm.singleInput(t)
			if input.AvailableTextSource != "external_tavily" {
				t.Fatalf("available_text_source = %q, want external_tavily", input.AvailableTextSource)
			}
			if got := nonWhitespaceRuneCount(input.AvailableText); got < 500 {
				t.Fatalf("sanitized Tavily evidence non-whitespace count = %d, want at least 500", got)
			}
			if got := tavilyNonBoilerplateUnitCount(input.AvailableText); got < 3 {
				t.Fatalf("sanitized Tavily evidence units = %d, want at least 3", got)
			}
			for _, want := range tt.mustKeep {
				if !strings.Contains(input.AvailableText, want) {
					t.Fatalf("sanitized Tavily evidence missing %q", want)
				}
			}
			for _, forbidden := range tt.mustDrop {
				if strings.Contains(input.AvailableText, forbidden) {
					t.Fatalf("sanitized Tavily evidence retained boilerplate %q", forbidden)
				}
			}
		})
	}
}

func TestTavilyExpectedRedExternalSanitationRejectsChromeAndThresholdFailures(t *testing.T) {
	tests := []struct {
		name       string
		articleURL string
		rawContent string
	}{
		{
			name:       "x login shell",
			articleURL: "http://x-public-post.example/status/2059045647634858329",
			rawContent: strings.Join([]string{
				"JavaScript is not available.",
				"We have detected that JavaScript is disabled in this browser.",
				"Please enable JavaScript or switch to a supported browser to continue using x.com.",
				"You can see a list of supported browsers in our Help Center.",
				"Terms of Service Privacy Policy Cookie Policy Imprint Ads info © X Corp.",
			}, "\n"),
		},
		{
			name:       "metadata only author topic audio chrome",
			articleURL: tavilyExpectedRedArticleURL("metadata-only"),
			rawContent: strings.Join([]string{
				"2,075 reads",
				"How AI Quietly Changed Modern UX Patterns",
				"by Artem Ivanov",
				"Translations EN KO ES VI JA RO LT GL PL KM ID ZU SK",
				"Your browser does not support the audio element.",
				"Story's Credibility",
				"About Author",
				"Read my stories Learn More",
				"Comments TOPICS ai-and-ml # ai # ux # product-design",
				"THIS ARTICLE WAS FEATURED IN Terminal Lite Threads Bsky",
			}, "\n"),
		},
		{
			name:       "footer trending only",
			articleURL: tavilyExpectedRedArticleURL("footer-trending"),
			rawContent: strings.Join([]string{
				"Trending now",
				"Relevant people",
				"Subscribe to our newsletter",
				"Footer links Contact us Privacy Policy Terms of Use Cookie Settings",
				"More from this site",
				"Most read stories",
				"Share this page",
			}, "\n"),
		},
		{
			name:       "below five hundred non whitespace characters",
			articleURL: tavilyExpectedRedArticleURL("short-threshold"),
			rawContent: strings.Join([]string{
				strings.Repeat("A compact source paragraph with some factual wording. ", 3),
				strings.Repeat("Second compact source paragraph with factual wording. ", 3),
				strings.Repeat("Third compact source paragraph with factual wording. ", 2),
			}, "\n\n"),
		},
		{
			name:       "fewer than three non boilerplate units",
			articleURL: tavilyExpectedRedArticleURL("unit-threshold"),
			rawContent: strings.Join([]string{
				strings.Repeat("The first retained paragraph contains real article detail about governance, release sequencing, source verification, and operational risk. ", 4),
				strings.Repeat("The second retained paragraph contains more real article detail about implementation boundaries, test fixtures, and owner-visible provenance. ", 4),
			}, "\n\n"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider := newTavilyExpectedRedProvider(t, func(w http.ResponseWriter, _ *http.Request) {
				writeTavilyJSON(t, w, map[string]any{"results": []map[string]any{{"url": tt.articleURL, "raw_content": tt.rawContent}}})
			})
			ctx := context.Background()
			db := tavilyExpectedRedDB(t, ctx)
			tavilySeedSelectedItem(t, ctx, db, tt.articleURL)
			llm := &tavilyExpectedRedLLM{}
			tavilyInstallContractHTTPTransport(t)
			tavilyConfigureProviderEnv(t, provider.extractEndpoint())

			resp, err := ReingestItem(ctx, db, llm, "item_tavily_expected_red", tavilyExpectedRedReingestRequest(tt.name))
			if err != nil {
				t.Fatalf("ReingestItem returned error: %v", err)
			}

			assertTavilyExpectedRedWireRequest(t, provider.requests(), tt.articleURL)
			assertTavilyExpectedRedError(t, resp, ReprocessErrorOriginalUnavailable)
			llm.assertNotCalled(t)
		})
	}
}

type tavilyExpectedRedProvider struct {
	server *httptest.Server
	mu     sync.Mutex
	seen   []tavilyExpectedRedRequest
}

type tavilyExpectedRedRequest struct {
	method string
	path   string
	auth   string
	body   []byte
}

func newTavilyExpectedRedProvider(t *testing.T, respond func(http.ResponseWriter, *http.Request)) *tavilyExpectedRedProvider {
	t.Helper()
	provider := &tavilyExpectedRedProvider{}
	provider.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, (2<<20)+1024))
		if err != nil {
			t.Errorf("read fake Tavily request body: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		provider.mu.Lock()
		provider.seen = append(provider.seen, tavilyExpectedRedRequest{method: r.Method, path: r.URL.Path, auth: r.Header.Get("Authorization"), body: append([]byte(nil), body...)})
		provider.mu.Unlock()
		r.Body = io.NopCloser(bytes.NewReader(body))
		respond(w, r)
	}))
	t.Cleanup(provider.server.Close)
	return provider
}

func (p *tavilyExpectedRedProvider) extractEndpoint() string {
	return p.server.URL + "/extract"
}

func (p *tavilyExpectedRedProvider) requests() []tavilyExpectedRedRequest {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]tavilyExpectedRedRequest, len(p.seen))
	copy(out, p.seen)
	return out
}

func writeTavilyJSON(t *testing.T, w http.ResponseWriter, value any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		t.Errorf("encode fake Tavily JSON: %v", err)
	}
}

func tavilyConfigureProviderEnv(t *testing.T, extractEndpoint string) {
	t.Helper()
	t.Setenv("TAVILY_API_KEY", tavilyExpectedRedAPIKey)
	// Test-only endpoint injection required by docs/TAVILY_EXTERNAL_EXTRACTION_PLAN.md
	// module split recommendations. It must not become a CLI/settings/persistent
	// provider surface.
	t.Setenv("RESOFEED_TAVILY_EXTRACT_ENDPOINT", extractEndpoint)
}

func tavilyInstallContractHTTPTransport(t *testing.T) {
	t.Helper()
	tavilyDefaultTransportMu.Lock()
	original := http.DefaultTransport
	base := original
	if base == nil {
		base = http.DefaultTransport
	}
	http.DefaultTransport = tavilyArticleFailingTransport{base: base}
	t.Cleanup(func() {
		http.DefaultTransport = original
		tavilyDefaultTransportMu.Unlock()
	})
}

type tavilyArticleFailingTransport struct {
	base http.RoundTripper
}

func (tavilyArticleFailingTransport) localUnavailableArticleBody() string {
	return `<!doctype html><html><head><title>Contract fixture</title></head><body><main>Loading</main><script>window.__APP__={}</script></body></html>`
}

func (rt tavilyArticleFailingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Host == tavilyExpectedRedArticleHost || strings.HasSuffix(req.URL.Host, ".example") || strings.HasSuffix(req.URL.Host, ".example.test") {
		body := rt.localUnavailableArticleBody()
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     http.Header{"Content-Type": []string{"text/html; charset=utf-8"}},
			Body:       io.NopCloser(strings.NewReader(body)),
			Request:    req,
		}, nil
	}
	base := rt.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(req)
}

func tavilyExpectedRedDB(t *testing.T, ctx context.Context) *sql.DB {
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

func tavilySeedSelectedItem(t *testing.T, ctx context.Context, db *sql.DB, articleURL string) {
	t.Helper()
	now := time.Date(2026, 6, 8, 12, 0, 0, 0, time.UTC).Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values ('src_tavily_expected_red', 'https://feed.example/rss.xml', 'Tavily Expected Red Source', ?, 'ok', 1, 1)`, now)
	if err != nil {
		t.Fatalf("seed Tavily source: %v", err)
	}
	_, err = db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, source_item_title, localized_title, key_points, content_status, summary, core_insight, feed_excerpt, extracted_text, value_tier, first_seen_at, extraction_status, model_status) values ('item_tavily_expected_red', 'src_tavily_expected_red', 'https://feed.example/rss.xml', ?, 'Prior Tavily title', 'Prior source Tavily title', 'Prior Tavily title', '[]', 'ok', 'Prior generated summary must not become source evidence.', 'Prior generated insight must not become source evidence.', null, null, 'brief', ?, 'original_unavailable', 'summary_unavailable')`, articleURL, now)
	if err != nil {
		t.Fatalf("seed Tavily selected item: %v", err)
	}
}

func tavilyExpectedRedReingestRequest(suffix string) ItemReingestRequest {
	return ItemReingestRequest{MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "tavily-expected-red-" + slugForID(suffix)}}
}

func tavilyExpectedRedArticleURL(suffix string) string {
	return "http://" + tavilyExpectedRedArticleHost + "/articles/" + slugForID(suffix)
}

func slugForID(value string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(value) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			b.WriteRune(r)
			continue
		}
		if b.Len() > 0 {
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}

type tavilyExpectedRedLLM struct {
	mu     sync.Mutex
	inputs []OpenRouterSummaryInput
}

func (l *tavilyExpectedRedLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.mu.Lock()
	l.inputs = append(l.inputs, input)
	l.mu.Unlock()
	return OpenRouterSummaryOutput{
		LocalizedTitle: "Tavily recovered contract title",
		Title:          "Tavily recovered contract title",
		FeedExcerpt:    "Tavily source excerpt retained by model.",
		ExtractedText:  "Tavily source extracted text retained by model.",
		Summary:        "Tavily recovered summary grounded in the external article evidence.",
		CoreInsight:    "Tavily recovered insight grounded in the external article evidence.",
		KeyPoints: []string{
			"Tavily recovered point one is grounded in source evidence.",
			"Tavily recovered point two is grounded in source evidence.",
			"Tavily recovered point three is grounded in source evidence.",
		},
		ValueTier:   "high",
		ModelStatus: modelStatusOK,
	}, nil
}

func (l *tavilyExpectedRedLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func (l *tavilyExpectedRedLLM) singleInput(t *testing.T) OpenRouterSummaryInput {
	t.Helper()
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.inputs) != 1 {
		t.Fatalf("LLM call count = %d, want exactly one external Tavily evidence processing call", len(l.inputs))
	}
	return l.inputs[0]
}

func (l *tavilyExpectedRedLLM) assertNotCalled(t *testing.T) {
	t.Helper()
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.inputs) != 0 {
		t.Fatalf("LLM call count = %d, want zero for unusable/provider-failed Tavily output", len(l.inputs))
	}
}

func assertTavilyExpectedRedWireRequest(t *testing.T, requests []tavilyExpectedRedRequest, articleURL string) {
	t.Helper()
	if len(requests) != 1 {
		t.Fatalf("Tavily provider request count = %d, want exactly one POST /extract", len(requests))
	}
	req := requests[0]
	if req.method != http.MethodPost || req.path != "/extract" {
		t.Fatalf("Tavily request method/path = %s %s, want POST /extract", req.method, req.path)
	}
	if req.auth != "Bearer "+tavilyExpectedRedAPIKey {
		t.Fatalf("Tavily Authorization header did not match expected bearer token shape")
	}
	if strings.Contains(string(req.body), tavilyExpectedRedAPIKey) {
		t.Fatalf("Tavily JSON body leaked provider secret")
	}
	var body map[string]any
	if err := json.Unmarshal(req.body, &body); err != nil {
		t.Fatalf("decode Tavily request JSON: %v", err)
	}
	wantKeys := map[string]bool{"urls": true, "extract_depth": true, "format": true, "include_images": true, "timeout": true}
	if len(body) != len(wantKeys) {
		t.Fatalf("Tavily request JSON keys = %v, want exactly urls/extract_depth/format/include_images/timeout", sortedJSONKeys(body))
	}
	for key := range wantKeys {
		if _, ok := body[key]; !ok {
			t.Fatalf("Tavily request JSON missing key %q in %v", key, sortedJSONKeys(body))
		}
	}
	urls, ok := body["urls"].([]any)
	if !ok || len(urls) != 1 || urls[0] != articleURL {
		t.Fatalf("Tavily request urls = %#v, want single selected article URL", body["urls"])
	}
	if body["extract_depth"] != "advanced" {
		t.Fatalf("Tavily extract_depth = %#v, want advanced", body["extract_depth"])
	}
	if body["format"] != "markdown" {
		t.Fatalf("Tavily format = %#v, want markdown", body["format"])
	}
	if body["include_images"] != false {
		t.Fatalf("Tavily include_images = %#v, want false", body["include_images"])
	}
	if body["timeout"] != float64(30) {
		t.Fatalf("Tavily timeout = %#v, want numeric 30", body["timeout"])
	}
	for _, forbidden := range []string{"summarize", "summary", "translate", "rank", "classify", "search"} {
		if strings.Contains(strings.ToLower(string(req.body)), forbidden) {
			t.Fatalf("Tavily request body contained forbidden operation %q", forbidden)
		}
	}
}

func sortedJSONKeys(body map[string]any) []string {
	keys := make([]string, 0, len(body))
	for key := range body {
		keys = append(keys, key)
	}
	return keys
}

func assertTavilyExpectedRedCompleted(t *testing.T, resp ItemReingestResponse) {
	t.Helper()
	if resp.Reingest.Status != ReprocessStatusCompleted || !resp.Reingest.ItemUpdated || !resp.Reingest.FTSUpdated || resp.Reingest.Error != nil {
		t.Fatalf("Reingest response = %+v, want completed Tavily-backed item update", resp)
	}
}

func assertTavilyExpectedRedError(t *testing.T, resp ItemReingestResponse, want ReprocessErrorCode) {
	t.Helper()
	if resp.Reingest.Status != ReprocessStatusCompletedWithErrors || resp.Reingest.Error == nil || resp.Reingest.Error.Code != want {
		t.Fatalf("Reingest response = %+v, want completed_with_errors code %q", resp, want)
	}
}

func assertTavilyNoLeakInResponseOrDB(t *testing.T, ctx context.Context, db *sql.DB, resp ItemReingestResponse, forbidden []string) {
	t.Helper()
	payload, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal reingest response for leak scan: %v", err)
	}
	for _, token := range forbidden {
		if token == "" {
			continue
		}
		if strings.Contains(string(payload), token) {
			t.Fatalf("response leaked forbidden Tavily token")
		}
	}
	rows, err := db.QueryContext(ctx, `select result_snapshot from agent_receipts union all select coalesce(last_reprocess_error_message, '') from items`)
	if err != nil {
		t.Fatalf("query DB leak scan: %v", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			t.Fatalf("scan DB leak value: %v", err)
		}
		for _, token := range forbidden {
			if token == "" {
				continue
			}
			if strings.Contains(value, token) {
				t.Fatalf("database runtime state leaked forbidden Tavily token")
			}
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate DB leak scan: %v", err)
	}
}

func tavilyLongArticlePayload(marker string) string {
	paragraphs := []string{
		fmt.Sprintf("This %s source-backed article paragraph explains how the owner reviewed a public incident timeline, compared independent source notes, and documented the operational boundary before any generated summary was allowed to run.", marker),
		"The second source-backed article paragraph describes concrete evidence: maintainers compared RSS excerpts, direct readable extraction, and externally recovered markdown while preserving literal source URLs and keeping provider credentials outside every user-facing surface.",
		"The third source-backed article paragraph adds implementation detail about bounded fallback behavior, including a single extraction request, no retry loop, no browser sidecar, and careful rejection of login, footer, trend, navigation, and metadata-only chrome.",
		"The fourth source-backed article paragraph gives enough factual density for downstream processing: it names the source recovery stage, describes why sanitation happens before model input, and explains that search indexing follows only after validated content is written.",
	}
	return strings.Join(paragraphs, "\n\n")
}

func tavilyJSHeavyArticlePayload() string {
	return strings.Join([]string{
		"window.__NUXT__={state:'hydrating'};",
		"Please enable JavaScript for the enhanced navigation shell.",
		"cookie settings privacy policy terms of use",
		"# A general external recovery article",
		"The general external recovery article reports that a public-interest engineering team reviewed a local outage timeline, compared source logs, and published a remediation sequence with exact timestamps and owner-visible limitations.",
		"The committee reviewed the incident timeline alongside maintainer notes, verified which evidence came from the source page, and separated article facts from social sharing widgets and trend modules that surrounded the page.",
		"A final article paragraph explains that the extraction path should keep provenance literal, reject login shell content, and pass only source-backed article paragraphs into the existing structured processing pipeline.",
	}, "\n\n")
}

func nonWhitespaceRuneCount(value string) int {
	count := 0
	for _, r := range value {
		if !strings.ContainsRune(" \t\n\r\v\f", r) {
			count++
		}
	}
	return count
}

func tavilyNonBoilerplateUnitCount(value string) int {
	count := 0
	for _, unit := range strings.Split(value, "\n\n") {
		unit = strings.TrimSpace(unit)
		if unit == "" {
			continue
		}
		lower := strings.ToLower(unit)
		boilerplateHits := 0
		for _, marker := range []string{"cookie", "privacy", "terms", "trending", "relevant people", "subscribe", "javascript", "loading", "footer", "share this page"} {
			if strings.Contains(lower, marker) {
				boilerplateHits++
			}
		}
		if boilerplateHits == 0 && nonWhitespaceRuneCount(unit) >= 80 {
			count++
		}
	}
	return count
}
