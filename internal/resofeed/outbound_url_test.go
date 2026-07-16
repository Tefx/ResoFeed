package resofeed

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestOutboundE2EFixturePolicy(t *testing.T) {
	for _, tc := range []struct {
		name    string
		runtime string
		want    bool
	}{
		{name: "runtime opt-in absent", runtime: "", want: false},
		{name: "runtime opt-in must be exact", runtime: "true", want: false},
		{name: "exact two-key opt-in", runtime: "1", want: e2eFixtureBuildEnabled},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("RESOFEED_E2E", tc.runtime)
			for _, raw := range []string{"http://localhost/feed.xml", "http://127.0.0.1/feed.xml", "http://[::1]/feed.xml"} {
				if got := isOutboundHTTPURL(raw); got != tc.want {
					t.Errorf("isOutboundHTTPURL(%q) = %v, want %v", raw, got, tc.want)
				}
			}
			if isOutboundHTTPURL("http://192.168.0.1/feed.xml") {
				t.Error("E2E fixture policy allowed a non-loopback private address")
			}
			if isStrictOutboundHTTPURL("http://127.0.0.1/feed.xml") {
				t.Error("strict outbound policy allowed loopback")
			}
		})
	}

	t.Setenv("RESOFEED_E2E", "1")
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "application/rss+xml")
		_, _ = fmt.Fprint(w, `<rss><channel><title>Fixture</title><item><guid>fixture-1</guid><title>Item</title><link>https://example.com/item</link></item></channel></rss>`)
	}))
	defer server.Close()

	_, err := fetchFeed(context.Background(), server.URL)
	if e2eFixtureBuildEnabled {
		if err != nil {
			t.Fatalf("tagged two-key fixture fetch failed: %v", err)
		}
		if hits.Load() != 1 {
			t.Fatalf("tagged two-key fixture fetch hits = %d, want 1", hits.Load())
		}
		return
	}
	if err == nil {
		t.Fatal("untagged build accepted loopback fixture fetch with runtime key alone")
	}
	if hits.Load() != 0 {
		t.Fatalf("untagged fixture server was requested %d times", hits.Load())
	}
}

func TestOutboundHTTPURLPolicyRejectsUnsafeDestinations(t *testing.T) {
	strictOutboundPolicyForTest(t)

	unsafeURLs := []string{
		"ftp://example.com/feed.xml",
		"http://user:pass@example.com/feed.xml",
		"http://localhost/feed.xml",
		"http://foo.localhost/feed.xml",
		"http://127.0.0.1/feed.xml",
		"http://10.0.0.1/feed.xml",
		"http://172.16.0.1/feed.xml",
		"http://192.168.0.1/feed.xml",
		"http://169.254.169.254/latest/meta-data/",
		"http://0.0.0.0/feed.xml",
		"http://224.0.0.1/feed.xml",
		"http://[::1]/feed.xml",
		"http://[fe80::1]/feed.xml",
	}
	for _, raw := range unsafeURLs {
		t.Run(raw, func(t *testing.T) {
			if isOutboundHTTPURL(raw) {
				t.Fatalf("isOutboundHTTPURL(%q) = true, want false", raw)
			}
			if _, ok := parseRSSURL(raw); ok {
				t.Fatalf("parseRSSURL(%q) accepted unsafe URL", raw)
			}
			if isTavilyEligibleArticleURL(raw) {
				t.Fatalf("isTavilyEligibleArticleURL(%q) = true, want false", raw)
			}
		})
	}
}

func TestOutboundHTTPURLPolicyAllowsPublicHTTPSyntax(t *testing.T) {
	strictOutboundPolicyForTest(t)

	for _, raw := range []string{"https://example.com/feed.xml", "http://example.org/articles?id=1"} {
		t.Run(raw, func(t *testing.T) {
			if !isOutboundHTTPURL(raw) {
				t.Fatalf("isOutboundHTTPURL(%q) = false, want true", raw)
			}
			if parsed, ok := parseRSSURL(raw); !ok || parsed == "" {
				t.Fatalf("parseRSSURL(%q) = %q, %v; want accepted", raw, parsed, ok)
			}
			if !isTavilyEligibleArticleURL(raw) {
				t.Fatalf("isTavilyEligibleArticleURL(%q) = false, want true", raw)
			}
		})
	}
}

func TestStateBundleRejectsUnsafeURLs(t *testing.T) {
	strictOutboundPolicyForTest(t)

	cases := []struct {
		name string
		body string
	}{
		{
			name: "source url",
			body: stateBundleJSON("http://127.0.0.1/feed.xml", "https://example.com/item", "https://example.com/feed.xml"),
		},
		{
			name: "resonated item url",
			body: stateBundleJSON("https://example.com/feed.xml", "http://127.0.0.1/item", "https://example.com/feed.xml"),
		},
		{
			name: "resonated source url",
			body: stateBundleJSON("https://example.com/feed.xml", "https://example.com/item", "http://127.0.0.1/feed.xml"),
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := ValidateStateBundle(strings.NewReader(tc.body)); err == nil {
				t.Fatalf("ValidateStateBundle accepted unsafe %s", tc.name)
			}
		})
	}
}

func TestFetchPathsRejectLoopbackBeforeRequest(t *testing.T) {
	strictOutboundPolicyForTest(t)

	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprint(w, `<rss><channel><title>Local</title><item><guid>g1</guid><title>Item</title><link>https://example.com/item</link><description>desc</description></item></channel></rss>`)
	}))
	defer server.Close()

	if _, err := fetchFeed(context.Background(), server.URL); err == nil {
		t.Fatalf("fetchFeed accepted loopback URL %q", server.URL)
	}
	if text, status := extractArticleText(context.Background(), server.URL, "fallback text"); text != "" || status != extractionStatusPartial {
		t.Fatalf("extractArticleText loopback = %q, %q; want empty partial fallback", text, status)
	}
	if _, err := fetchArticleReadableText(context.Background(), server.URL); err == nil {
		t.Fatalf("fetchArticleReadableText accepted loopback URL %q", server.URL)
	}
	if hits.Load() != 0 {
		t.Fatalf("unsafe loopback server was requested %d times", hits.Load())
	}
}

func TestParseFeedDoesNotPromoteUnsafeGUIDToItemURL(t *testing.T) {
	strictOutboundPolicyForTest(t)

	feed, err := parseFeed([]byte(`<rss><channel><title>Feed</title><item><guid>http://127.0.0.1/internal</guid><title>Item</title><description>desc</description></item></channel></rss>`))
	if err != nil {
		t.Fatalf("parseFeed failed: %v", err)
	}
	if len(feed.Items) != 1 {
		t.Fatalf("parseFeed items = %d, want 1", len(feed.Items))
	}
	if feed.Items[0].URL != "" {
		t.Fatalf("parseFeed promoted unsafe GUID URL %q", feed.Items[0].URL)
	}
}

func TestOutboundRedirectPolicyRejectsUnsafeTargets(t *testing.T) {
	strictOutboundPolicyForTest(t)

	req, err := http.NewRequest(http.MethodGet, "http://127.0.0.1/redirected", nil)
	if err != nil {
		t.Fatalf("create redirect request: %v", err)
	}
	if err := checkOutboundRedirect(req, nil); err == nil {
		t.Fatalf("checkOutboundRedirect accepted loopback redirect target")
	}
}

func strictOutboundPolicyForTest(t *testing.T) {
	t.Helper()
	previous := forceStrictOutboundPolicyForTests.Swap(true)
	t.Cleanup(func() {
		forceStrictOutboundPolicyForTests.Store(previous)
	})
}

func stateBundleJSON(sourceURL string, itemURL string, itemSourceURL string) string {
	return fmt.Sprintf(`{
		"schema_version": %q,
		"exported_at": %q,
		"sources": [{"id":"s1","url":%q,"title":"Source"}],
		"steer_rules": [],
		"resonated_items": [{"item_id":"i1","url":%q,"source_url":%q}]
	}`, StateSchemaVersionV1, time.Now().UTC().Format(time.RFC3339), sourceURL, itemURL, itemSourceURL)
}
