package resofeed

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestTavilyURLEligibilityMatrixExpectedRed(t *testing.T) {
	for _, tc := range []struct {
		name string
		url  string
		want int
	}{
		{name: "public http URL is eligible", url: "http://example.com/article", want: 1},
		{name: "public https URL is eligible", url: "https://example.com/article", want: 1},
		{name: "public IPv4 literal is eligible", url: "https://93.184.216.34/article", want: 1},
		{name: "public IPv6 literal is eligible", url: "https://[2606:4700:4700::1111]/article", want: 1},
		{name: "unresolvable public syntax remains eligible without DNS preflight", url: "https://does-not-resolve.invalid/article", want: 1},
		{name: "empty string is ineligible", url: "", want: 0},
		{name: "non URL string is ineligible", url: "not a URL", want: 0},
		{name: "unsupported ftp scheme is ineligible", url: "ftp://example.com/article", want: 0},
		{name: "unsupported mailto scheme is ineligible", url: "mailto:owner@example.com", want: 0},
		{name: "unsupported data scheme is ineligible", url: "data:text/plain,article", want: 0},
		{name: "empty host is ineligible", url: "https:///article", want: 0},
		{name: "credentials are ineligible", url: "https://user:pass@example.com/article", want: 0},
		{name: "localhost is ineligible", url: "http://localhost/article", want: 0},
		{name: "dot localhost suffix is ineligible", url: "http://news.localhost/article", want: 0},
		{name: "IPv4 loopback literal is ineligible", url: "http://127.0.0.1/article", want: 0},
		{name: "IPv4 private 10 literal is ineligible", url: "http://10.0.0.8/article", want: 0},
		{name: "IPv4 private 172 literal is ineligible", url: "http://172.16.0.8/article", want: 0},
		{name: "IPv4 private 192 literal is ineligible", url: "http://192.168.1.8/article", want: 0},
		{name: "IPv4 link local literal is ineligible", url: "http://169.254.10.20/article", want: 0},
		{name: "IPv4 multicast literal is ineligible", url: "http://224.0.0.1/article", want: 0},
		{name: "IPv4 unspecified literal is ineligible", url: "http://0.0.0.0/article", want: 0},
		{name: "IPv6 loopback literal is ineligible", url: "http://[::1]/article", want: 0},
		{name: "IPv6 unique local literal is ineligible", url: "http://[fc00::1]/article", want: 0},
		{name: "IPv6 link local literal is ineligible", url: "http://[fe80::1]/article", want: 0},
		{name: "IPv6 multicast literal is ineligible", url: "http://[ff02::1]/article", want: 0},
		{name: "IPv6 unspecified literal is ineligible", url: "http://[::]/article", want: 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			db := newTavilyExpectedRedURLDoctorDB(t, ctx)
			seedTavilyExpectedRedURLCandidate(t, ctx, db, tavilyExpectedRedURLCandidate{ID: "item_matrix", URL: tc.url})

			doctor := tavilyExpectedRedDoctorOutput(t, ctx, db)
			requireTavilyExpectedRedRecoverableCount(t, doctor, tc.want)
		})
	}
}

func TestTavilyEligibilityDoesNotResolveDNSOrPreflightRedirectsExpectedRed(t *testing.T) {
	withIsolatedTavilyExpectedRedRuntimeInputs(t)

	var roundTripCalls atomic.Int64
	oldTransport := http.DefaultTransport
	http.DefaultTransport = tavilyExpectedRedRoundTripper{calls: &roundTripCalls}
	t.Cleanup(func() { http.DefaultTransport = oldTransport })

	ctx := context.Background()
	db := newTavilyExpectedRedURLDoctorDB(t, ctx)
	seedTavilyExpectedRedURLCandidate(t, ctx, db, tavilyExpectedRedURLCandidate{ID: "item_unresolved", URL: "https://does-not-resolve.invalid/article"})
	seedTavilyExpectedRedURLCandidate(t, ctx, db, tavilyExpectedRedURLCandidate{ID: "item_redirect", URL: "https://redirect-preflight.example/article"})

	doctor := tavilyExpectedRedDoctorOutput(t, ctx, db)
	if got := roundTripCalls.Load(); got != 0 {
		t.Fatalf("Tavily URL eligibility must be syntactic/IP-literal only and must not perform HTTP redirect preflight; round trips=%d", got)
	}
	requireTavilyExpectedRedRecoverableCount(t, doctor, 2)
}

func TestTavilyReprocessCandidateOrderAndFieldExclusionsExpectedRed(t *testing.T) {
	for _, tc := range []struct {
		name          string
		canonicalURL  string
		itemURL       string
		sourceURL     string
		itemSourceURL string
		feedExcerpt   string
		extractedText string
		summary       string
		coreInsight   string
		want          int
	}{
		{
			name:         "canonical URL is considered before unsafe item URL",
			canonicalURL: "https://article.example/canonical",
			itemURL:      "http://127.0.0.1/private",
			want:         1,
		},
		{
			name:         "invalid canonical URL falls back to item URL",
			canonicalURL: "file:///tmp/generated.html",
			itemURL:      "https://article.example/original",
			want:         1,
		},
		{
			name:          "source feed URLs and generated fields are never Tavily candidates",
			canonicalURL:  "",
			itemURL:       "file:///not-an-article",
			sourceURL:     "https://source-ledger.example/feed.xml",
			itemSourceURL: "https://item-source-url.example/feed.xml",
			feedExcerpt:   "Feed display text mentions https://feed-excerpt.example/article but is not source evidence.",
			extractedText: "Generated extracted_text mentions https://generated-extracted.example/article but is not source evidence.",
			summary:       "Generated summary mentions https://generated-summary.example/article but is not source evidence.",
			coreInsight:   "Generated insight mentions https://generated-insight.example/article but is not source evidence.",
			want:          0,
		},
		{
			name:         "empty canonical URL falls back to item URL",
			canonicalURL: "",
			itemURL:      "https://article.example/original",
			want:         1,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			db := newTavilyExpectedRedURLDoctorDB(t, ctx)
			seedTavilyExpectedRedURLCandidate(t, ctx, db, tavilyExpectedRedURLCandidate{
				ID:            "item_candidate_order",
				URL:           tc.itemURL,
				CanonicalURL:  tc.canonicalURL,
				SourceURL:     tc.sourceURL,
				ItemSourceURL: tc.itemSourceURL,
				FeedExcerpt:   tc.feedExcerpt,
				ExtractedText: tc.extractedText,
				Summary:       tc.summary,
				CoreInsight:   tc.coreInsight,
			})

			doctor := tavilyExpectedRedDoctorOutput(t, ctx, db)
			requireTavilyExpectedRedRecoverableCount(t, doctor, tc.want)
		})
	}
}

type tavilyExpectedRedRoundTripper struct {
	calls *atomic.Int64
}

func (r tavilyExpectedRedRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	r.calls.Add(1)
	return nil, errors.New("unexpected Tavily eligibility network preflight")
}

type tavilyExpectedRedURLCandidate struct {
	ID            string
	URL           string
	CanonicalURL  string
	SourceURL     string
	ItemSourceURL string
	FeedExcerpt   string
	ExtractedText string
	Summary       string
	CoreInsight   string
}

func newTavilyExpectedRedURLDoctorDB(t *testing.T, ctx context.Context) *sql.DB {
	t.Helper()
	withIsolatedTavilyExpectedRedRuntimeInputs(t)
	db := newContractDB(t, ctx)
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, 'ok', 1, 1)`, "src_tavily_expected_red", "https://feed.example/rss.xml", "Tavily URL Fixture", time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("seed Tavily URL source: %v", err)
	}
	return db
}

func seedTavilyExpectedRedURLCandidate(t *testing.T, ctx context.Context, db *sql.DB, candidate tavilyExpectedRedURLCandidate) {
	t.Helper()
	if strings.TrimSpace(candidate.ID) == "" {
		t.Fatal("Tavily URL candidate fixture requires ID")
	}
	sourceURL := firstNonEmptyTavilyExpectedRed(candidate.SourceURL, "https://feed.example/rss.xml")
	itemSourceURL := firstNonEmptyTavilyExpectedRed(candidate.ItemSourceURL, sourceURL)
	firstSeen := time.Now().UTC().Format(time.RFC3339)
	canonical := any(nil)
	if candidate.CanonicalURL != "" {
		canonical = candidate.CanonicalURL
	}
	_, err := db.ExecContext(ctx, `
insert into items (
  id, source_id, source_url, url, canonical_url, title, feed_excerpt, extracted_text,
  summary, core_insight, value_tier, published_at, first_seen_at, extraction_status,
  model_status, source_item_title, localized_title, key_points, content_status
) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		candidate.ID,
		"src_tavily_expected_red",
		itemSourceURL,
		candidate.URL,
		canonical,
		"Tavily URL Fixture "+candidate.ID,
		nullableStringForTavilyExpectedRed(candidate.FeedExcerpt),
		nullableStringForTavilyExpectedRed(candidate.ExtractedText),
		nullableStringForTavilyExpectedRed(candidate.Summary),
		nullableStringForTavilyExpectedRed(candidate.CoreInsight),
		"brief",
		firstSeen,
		firstSeen,
		extractionStatusOriginalNA,
		modelStatusSummaryNA,
		"Tavily URL Fixture "+candidate.ID,
		"Tavily URL Fixture "+candidate.ID,
		"[]",
		modelStatusSummaryNA,
	)
	if err != nil {
		t.Fatalf("seed Tavily URL item %s: %v", candidate.ID, err)
	}
}

func nullableStringForTavilyExpectedRed(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func firstNonEmptyTavilyExpectedRed(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func requireTavilyExpectedRedRecoverableCount(t *testing.T, doctor string, want int) {
	t.Helper()
	value := tavilyExpectedRedDoctorValue(t, doctor, "tavily: recoverable_unavailable=")
	got, err := strconv.Atoi(value)
	if err != nil {
		t.Fatalf("parse tavily recoverable_unavailable count %q from doctor=%q: %v", value, redactTavilyExpectedRedOutput(doctor), err)
	}
	if got != want {
		t.Fatalf("tavily recoverable_unavailable=%d, want %d; doctor=%q", got, want, redactTavilyExpectedRedOutput(doctor))
	}
}

func tavilyExpectedRedDoctorValue(t *testing.T, doctor string, prefix string) string {
	t.Helper()
	for _, line := range strings.Split(doctor, "\n") {
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(line, prefix))
		}
	}
	t.Fatalf("doctor output missing %q line; doctor=%q", prefix, redactTavilyExpectedRedOutput(doctor))
	return ""
}
