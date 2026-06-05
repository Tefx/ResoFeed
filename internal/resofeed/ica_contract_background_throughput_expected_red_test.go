package resofeed

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestICAExpectedRedBackgroundTickSkipsBusySourceAndDrainsIdleSources(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)

	busyEntered := make(chan struct{})
	busyRelease := make(chan struct{})
	busyFeed, busyRequests := icaBlockingFeedServer(t, "ICA Background Busy", "background-busy", busyEntered, busyRelease)
	idleBFeed, idleBRequests := icaCountingFeedServer(t, "ICA Background Idle B", "background-idle-b")
	idleCFeed, idleCRequests := icaCountingFeedServer(t, "ICA Background Idle C", "background-idle-c")
	seedSTCSource(t, ctx, db, "src_ica_background_busy", busyFeed.URL+"/feed.xml", "ICA Background Busy Fallback", 1)
	seedSTCSource(t, ctx, db, "src_ica_background_idle_b", idleBFeed.URL+"/feed.xml", "ICA Background Idle B Fallback", 1)
	seedSTCSource(t, ctx, db, "src_ica_background_idle_c", idleCFeed.URL+"/feed.xml", "ICA Background Idle C Fallback", 1)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	var releaseBusyOnce sync.Once
	releaseBusy := func() { releaseBusyOnce.Do(func() { close(busyRelease) }) }
	t.Cleanup(releaseBusy)

	busyDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		busyDone <- stcPostManualFetch(router, "/api/sources/src_ica_background_busy/fetch")
	}()
	stcWaitForSignal(t, busyEntered, "background busy source A fetch to enter upstream fixture")

	if err := IngestOnce(ctx, db, IngestConfig{SourceFetchTimeout: 3 * time.Second}); err != nil {
		t.Fatalf("background tick while source A was busy returned error: %v", err)
	}
	if got := busyRequests.Load(); got != 1 {
		t.Fatalf("background tick contacted busy source A %d times while row fetch was held, want only original in-flight request", got)
	}
	if got := idleBRequests.Load(); got != 1 {
		t.Fatalf("background tick idle source B requests = %d, want started and drained exactly once while source A remains busy", got)
	}
	if got := idleCRequests.Load(); got != 1 {
		t.Fatalf("background tick idle source C requests = %d, want started and drained exactly once while source A remains busy", got)
	}
	assertManualFetchDurableArtifactsAbsent(t, ctx, db)

	releaseBusy()
	assertStatus(t, <-busyDone, http.StatusOK)
	icaAssertNoAdditionalRequests(t, busyRequests, 1, "busy source A after background tick")
	icaAssertNoAdditionalRequests(t, idleBRequests, 1, "idle source B after background tick")
	icaAssertNoAdditionalRequests(t, idleCRequests, 1, "idle source C after background tick")
}

func TestICAExpectedRedBackgroundTickExternalCapacityDrainsOwnedSlotsAndSkipsBlockedStartsOnly(t *testing.T) {
	t.Run("partial external pressure drains selected idle sources through owned slot", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		db := newContractDB(t, ctx)
		releaseCapacity := icaHoldExternalSourceLeases(t, ctx, icaExpectedSourceConcurrencySlots-1)
		defer releaseCapacity()

		feeds := make([]*atomic.Int64, 0, 3)
		for i := 0; i < 3; i++ {
			feed, requests := icaCountingFeedServer(t, fmt.Sprintf("ICA Background Owned Slot %d", i), fmt.Sprintf("background-owned-slot-%d", i))
			seedSTCSource(t, ctx, db, fmt.Sprintf("src_ica_background_owned_%d", i), feed.URL+"/feed.xml", fmt.Sprintf("ICA Background Owned %d", i), 1)
			feeds = append(feeds, requests)
		}

		if err := IngestOnce(ctx, db, IngestConfig{SourceFetchTimeout: 3 * time.Second}); err != nil {
			t.Fatalf("background tick under partial external capacity pressure returned error: %v", err)
		}
		for i, requests := range feeds {
			if got := requests.Load(); got != 1 {
				t.Fatalf("background tick idle source %d requests = %d, want drained through the tick's owned capacity slot, not mislabeled as externally blocked", i, got)
			}
		}
		assertManualFetchDurableArtifactsAbsent(t, ctx, db)
	})

	t.Run("full external pressure skips starts without deferred queued work", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		db := newContractDB(t, ctx)
		releaseCapacity := icaHoldExternalSourceLeases(t, ctx, icaExpectedSourceConcurrencySlots)
		defer releaseCapacity()

		blockedFeed, blockedRequests := icaCountingFeedServer(t, "ICA Background Blocked", "background-blocked")
		seedSTCSource(t, ctx, db, "src_ica_background_blocked", blockedFeed.URL+"/feed.xml", "ICA Background Blocked Fallback", 1)

		if err := IngestOnce(ctx, db, IngestConfig{SourceFetchTimeout: 3 * time.Second}); err != nil {
			t.Fatalf("background tick under full external capacity pressure returned error: %v", err)
		}
		if got := blockedRequests.Load(); got != 0 {
			t.Fatalf("background tick externally blocked source requests = %d, want skipped start only with no upstream contact", got)
		}
		assertManualFetchDurableArtifactsAbsent(t, ctx, db)

		releaseCapacity()
		icaAssertNoDeferredFeedRequest(t, blockedRequests, "externally blocked background source after tick")
	})
}

func TestICAExpectedRedBackgroundTickSourceConcurrencyLimitDrainsOwnBacklogWithoutCapacitySkips(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)

	const sourceCount = 5
	const sourceLimit = 2
	requests := make([]*icaObservedFeedRequests, 0, sourceCount)
	for i := 0; i < sourceCount; i++ {
		feed, observed := icaObservedDelayedFeedServer(t, fmt.Sprintf("ICA Background Backlog %d", i), fmt.Sprintf("background-backlog-%d", i), 75*time.Millisecond)
		seedSTCSource(t, ctx, db, fmt.Sprintf("src_ica_background_backlog_%d", i), feed.URL+"/feed.xml", fmt.Sprintf("ICA Background Backlog %d", i), 1)
		requests = append(requests, observed)
	}

	if err := IngestOnce(ctx, db, IngestConfig{SourceConcurrency: sourceLimit, SourceFetchTimeout: 3 * time.Second}); err != nil {
		t.Fatalf("background tick with source_concurrency=%d returned error: %v", sourceLimit, err)
	}
	for i, observed := range requests {
		if got := observed.requests.Load(); got != 1 {
			t.Fatalf("background tick own-backlog source %d requests = %d, want eventually drained once instead of skipped as source_capacity_exhausted", i, got)
		}
		if got := observed.maxConcurrent.Load(); got > sourceLimit {
			t.Fatalf("background tick own-backlog source %d max concurrency = %d, want bounded by source_concurrency=%d", i, got, sourceLimit)
		}
	}
	assertManualFetchDurableArtifactsAbsent(t, ctx, db)
	for i, observed := range requests {
		icaAssertNoAdditionalRequests(t, &observed.requests, 1, fmt.Sprintf("own-backlog background source %d after tick", i))
	}
}

func TestICAExpectedRedThroughputMultipleSlowSourcesBeatSerialTime(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)

	const sourceCount = 4
	delayPerSource := 250 * time.Millisecond
	requests := make([]*atomic.Int64, 0, sourceCount)
	for i := 0; i < sourceCount; i++ {
		feed, feedRequests := icaDelayedFeedServer(t, fmt.Sprintf("ICA Slow Source %d", i), fmt.Sprintf("slow-source-%d", i), delayPerSource)
		seedSTCSource(t, ctx, db, fmt.Sprintf("src_ica_slow_source_%d", i), feed.URL+"/feed.xml", fmt.Sprintf("ICA Slow Source %d Fallback", i), 1)
		requests = append(requests, feedRequests)
	}

	started := time.Now()
	result, err := ManualIngest(ctx, db, IngestConfig{SourceFetchTimeout: 5 * time.Second})
	elapsed := time.Since(started)
	if err != nil {
		t.Fatalf("ManualIngest slow-source throughput fixture returned error: %v", err)
	}
	if result.SourcesFetched != sourceCount {
		t.Fatalf("ManualIngest slow-source throughput fetched %d sources, want %d; result=%+v", result.SourcesFetched, sourceCount, result)
	}
	for i, feedRequests := range requests {
		if got := feedRequests.Load(); got != 1 {
			t.Fatalf("slow source %d feed requests = %d, want exactly one", i, got)
		}
	}

	serialFloor := time.Duration(sourceCount) * delayPerSource
	parallelBudget := 700 * time.Millisecond
	if elapsed >= parallelBudget {
		t.Fatalf("slow-source ingest elapsed %s, want under %s with source_concurrency > 1 (serial floor is %s)", elapsed, parallelBudget, serialFloor)
	}
}

func TestICAExpectedRedThroughputMultipleSlowItemLLMRequestsBeatSerialTime(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)

	const itemCount = 4
	feed := icaMultiItemFeedServer(t, "ICA Slow LLM Source", "slow-llm", itemCount)
	seedSTCSource(t, ctx, db, "src_ica_slow_llm", feed.URL+"/feed.xml", "ICA Slow LLM Fallback", 1)
	llm := &icaSlowSummaryLLM{delay: 200 * time.Millisecond}

	started := time.Now()
	result, err := ManualFetchSource(ctx, db, IngestConfig{LLM: llm, SourceFetchTimeout: 5 * time.Second}, "src_ica_slow_llm")
	elapsed := time.Since(started)
	if err != nil {
		t.Fatalf("ManualFetchSource slow-LLM throughput fixture returned error: %v", err)
	}
	if result.ItemsUpserted != itemCount || result.ItemsDiscovered != itemCount {
		t.Fatalf("ManualFetchSource slow-LLM result = %+v, want %d discovered/upserted items", result, itemCount)
	}
	if got := llm.calls.Load(); got != itemCount {
		t.Fatalf("slow LLM calls = %d, want %d", got, itemCount)
	}
	if got := llm.maxConcurrent.Load(); got < 2 {
		t.Fatalf("slow LLM max concurrent calls = %d, want at least 2 with item_concurrency_per_source > 1", got)
	}

	serialFloor := time.Duration(itemCount) * llm.delay
	parallelBudget := 550 * time.Millisecond
	if elapsed >= parallelBudget {
		t.Fatalf("slow item/LLM ingest elapsed %s, want under %s with item_concurrency_per_source > 1 (serial floor is %s)", elapsed, parallelBudget, serialFloor)
	}
}

func TestICAExpectedRedBackgroundThroughputForbiddenDurableWorkDriftScan(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	for _, token := range []string{"queue", "job", "pending_work", "operation_history", "command_history", "reading_history", "progress"} {
		assertSQLiteSchemaTokenAbsent(t, ctx, db, token)
	}
	assertSQLiteTableNameFragmentsAbsent(t, ctx, db, []string{"queue", "job", "pending_work", "operation_history", "activity", "command_history", "reading_history", "progress"})
	assertSQLiteTableColumnPresent(t, ctx, db, "sources", "title")
	assertSQLiteTableColumnAbsent(t, ctx, db, "sources", "feed_title")
	assertProductionBackendTokenAbsent(t, "feed_title")
	assertProductionBackendIdentifiersAbsent(t, []string{"eventbus", "event_bus", "sidecar"})

	tools := mcpToolsListForTest(t, NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken}))
	for _, forbidden := range []string{"ingest", "manual_ingest", "run_ingest", "fetch", "fetch_source", "manual_fetch_source"} {
		if _, ok := tools[forbidden]; ok {
			t.Fatalf("MCP exposed forbidden ingest/fetch trigger tool %q", forbidden)
		}
	}
}

func icaBlockingFeedServer(t *testing.T, sourceTitle string, itemSlug string, entered chan<- struct{}, release <-chan struct{}) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	var requests atomic.Int64
	var enterOnce sync.Once
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			requests.Add(1)
			enterOnce.Do(func() { close(entered) })
			select {
			case <-release:
			case <-r.Context().Done():
				return
			}
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, icaRSSFixture(r.Host, sourceTitle, []string{itemSlug}))
		case "/" + itemSlug + "-article":
			_, _ = io.WriteString(w, `<html><body><article>Article body for `+itemSlug+`.</article></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	return server, &requests
}

func icaDelayedFeedServer(t *testing.T, sourceTitle string, itemSlug string, delay time.Duration) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	var requests atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			requests.Add(1)
			timer := time.NewTimer(delay)
			select {
			case <-timer.C:
			case <-r.Context().Done():
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				return
			}
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, icaRSSFixture(r.Host, sourceTitle, []string{itemSlug}))
		case "/" + itemSlug + "-article":
			_, _ = io.WriteString(w, `<html><body><article>Article body for `+itemSlug+`.</article></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	return server, &requests
}

type icaObservedFeedRequests struct {
	requests      atomic.Int64
	current       atomic.Int64
	maxConcurrent atomic.Int64
}

func icaObservedDelayedFeedServer(t *testing.T, sourceTitle string, itemSlug string, delay time.Duration) (*httptest.Server, *icaObservedFeedRequests) {
	t.Helper()
	observed := &icaObservedFeedRequests{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			observed.requests.Add(1)
			current := observed.current.Add(1)
			for {
				maxSeen := observed.maxConcurrent.Load()
				if current <= maxSeen || observed.maxConcurrent.CompareAndSwap(maxSeen, current) {
					break
				}
			}
			defer observed.current.Add(-1)
			timer := time.NewTimer(delay)
			select {
			case <-timer.C:
			case <-r.Context().Done():
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				return
			}
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, icaRSSFixture(r.Host, sourceTitle, []string{itemSlug}))
		case "/" + itemSlug + "-article":
			_, _ = io.WriteString(w, `<html><body><article>Article body for `+itemSlug+`.</article></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	return server, observed
}

func icaMultiItemFeedServer(t *testing.T, sourceTitle string, itemPrefix string, itemCount int) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/feed.xml" {
			items := make([]string, 0, itemCount)
			for i := 0; i < itemCount; i++ {
				items = append(items, fmt.Sprintf("%s-%d", itemPrefix, i))
			}
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, icaRSSFixture(r.Host, sourceTitle, items))
			return
		}
		if strings.HasSuffix(r.URL.Path, "-article") {
			_, _ = io.WriteString(w, `<html><body><article>Article body for `+strings.TrimPrefix(r.URL.Path, "/")+` with source-backed facts.</article></body></html>`)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)
	return server
}

func icaRSSFixture(host string, sourceTitle string, itemSlugs []string) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0"?><rss><channel><title>`)
	b.WriteString(sourceTitle)
	b.WriteString(`</title>`)
	for _, slug := range itemSlugs {
		b.WriteString(`<item><guid>`)
		b.WriteString(slug)
		b.WriteString(`</guid><title>`)
		b.WriteString(slug)
		b.WriteString(` article</title><link>http://`)
		b.WriteString(host)
		b.WriteString(`/`)
		b.WriteString(slug)
		b.WriteString(`-article</link><description>Excerpt for `)
		b.WriteString(slug)
		b.WriteString(`.</description></item>`)
	}
	b.WriteString(`</channel></rss>`)
	return b.String()
}

type icaSlowSummaryLLM struct {
	delay         time.Duration
	calls         atomic.Int64
	current       atomic.Int64
	maxConcurrent atomic.Int64
}

func (l *icaSlowSummaryLLM) SummarizeItem(ctx context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.calls.Add(1)
	current := l.current.Add(1)
	for {
		maxSeen := l.maxConcurrent.Load()
		if current <= maxSeen || l.maxConcurrent.CompareAndSwap(maxSeen, current) {
			break
		}
	}
	defer l.current.Add(-1)

	timer := time.NewTimer(l.delay)
	select {
	case <-timer.C:
	case <-ctx.Done():
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		return OpenRouterSummaryOutput{}, fmt.Errorf("slow summary fixture canceled: %w", ctx.Err())
	}

	return OpenRouterSummaryOutput{
		LocalizedTitle: "localized " + input.Title,
		Title:          "localized " + input.Title,
		Summary:        "Summary with concrete source facts for " + input.Title + ".",
		CoreInsight:    "Core insight grounded in source facts for " + input.Title + ".",
		FeedExcerpt:    "Feed excerpt for " + input.Title + ".",
		ExtractedText:  "Extracted source text for " + input.Title + ".",
		KeyPoints: []string{
			"First source-backed key point.",
			"Second source-backed key point.",
			"Third source-backed key point.",
		},
		ValueTier:   "high",
		ModelStatus: modelStatusOK,
	}, nil
}

func (l *icaSlowSummaryLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

var _ LLMClient = (*icaSlowSummaryLLM)(nil)
