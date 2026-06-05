package resofeed

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const icaExpectedSourceConcurrencySlots = 8

func TestICAExpectedRedSlowUnrelatedSourceOverlapAndSameSourceConflict(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	alphaEntered := make(chan struct{})
	alphaRelease := make(chan struct{})
	betaEntered := make(chan struct{})
	betaRelease := make(chan struct{})
	alphaFeed, alphaRequests := stcSlowFeedServer(t, stcRSSNonEmptyTitleFixture, alphaEntered, alphaRelease)
	betaFeed, betaRequests := stcSlowFeedServer(t, stcAtomNonEmptyTitleFixture, betaEntered, betaRelease)
	seedSTCSource(t, ctx, db, "src_ica_coord_alpha", alphaFeed.URL+"/rss.xml", "ICA Alpha Fallback", 1)
	seedSTCSource(t, ctx, db, "src_ica_coord_beta", betaFeed.URL+"/atom.xml", "ICA Beta Fallback", 1)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	var releaseAlphaOnce sync.Once
	releaseAlpha := func() { releaseAlphaOnce.Do(func() { close(alphaRelease) }) }
	var releaseBetaOnce sync.Once
	releaseBeta := func() { releaseBetaOnce.Do(func() { close(betaRelease) }) }
	t.Cleanup(func() {
		releaseBeta()
		releaseAlpha()
	})

	alphaDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		alphaDone <- stcPostManualFetch(router, "/api/sources/src_ica_coord_alpha/fetch")
	}()
	stcWaitForSignal(t, alphaEntered, "source A row fetch to enter upstream fixture")

	betaDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		betaDone <- stcPostManualFetch(router, "/api/sources/src_ica_coord_beta/fetch")
	}()

	select {
	case <-betaEntered:
		t.Log("unrelated-source overlap attempt reached source B upstream while source A was still in-flight")
	case recorder := <-betaDone:
		releaseAlpha()
		assertStatus(t, <-alphaDone, http.StatusOK)
		t.Fatalf("unrelated-source overlap attempt completed before source B entered upstream: status=%d body=%s", recorder.Code, recorder.Body.String())
	case <-time.After(2 * time.Second):
		releaseAlpha()
		assertStatus(t, <-alphaDone, http.StatusOK)
		t.Fatal("timed out waiting for unrelated slow source B to overlap source A")
	}

	duplicateAlpha := stcPostManualFetch(router, "/api/sources/src_ica_coord_alpha/fetch")
	assertStatus(t, duplicateAlpha, http.StatusConflict)
	assertErrorCode(t, duplicateAlpha.Body.Bytes(), ManualFetchErrorCodeConflict)
	t.Log("same-source duplicate fetch returned 409 conflict while original source A request remained in-flight")

	if got := alphaRequests.Load(); got != 1 {
		t.Fatalf("source A upstream request count = %d, want one with no queued duplicate", got)
	}
	if got := betaRequests.Load(); got != 1 {
		t.Fatalf("source B upstream request count = %d, want one overlapped attempt", got)
	}
	assertManualFetchDurableArtifactsAbsent(t, ctx, db)

	releaseBeta()
	releaseAlpha()
	assertStatus(t, <-betaDone, http.StatusOK)
	assertStatus(t, <-alphaDone, http.StatusOK)
}

func TestICAExpectedRedManualRowFetchExternalSourceCapacityExhaustionReturns409Reason(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	releaseCapacity := icaHoldExternalSourceLeases(t, ctx, icaExpectedSourceConcurrencySlots)
	defer releaseCapacity()

	feed, feedRequests := icaCountingFeedServer(t, "Capacity Target", "capacity-target")
	seedSTCSource(t, ctx, db, "src_ica_capacity_target", feed.URL+"/feed.xml", "ICA Capacity Target", 1)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	recorder := stcPostManualFetch(router, "/api/sources/src_ica_capacity_target/fetch")
	assertStatus(t, recorder, http.StatusConflict)
	icaAssertConflictReason(t, recorder.Body.Bytes(), "source_capacity_exhausted")
	if got := feedRequests.Load(); got != 0 {
		t.Fatalf("manual row fetch under external source capacity exhaustion contacted upstream %d times, want no queued or started work", got)
	}
	assertManualFetchDurableArtifactsAbsent(t, ctx, db)

	releaseCapacity()
	icaAssertNoDeferredFeedRequest(t, feedRequests, "manual row fetch after capacity-conflict response")
}

func TestICAExpectedRedRunIngestSkipsBusySourceAndDrainsIdleSourcesWithoutQueueing(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	busyEntered := make(chan struct{})
	busyRelease := make(chan struct{})
	busyFeed, busyRequests := stcSlowFeedServer(t, stcRSSNonEmptyTitleFixture, busyEntered, busyRelease)
	idleBFeed, idleBRequests := icaCountingFeedServer(t, "Idle B", "idle-b")
	idleCFeed, idleCRequests := icaCountingFeedServer(t, "Idle C", "idle-c")
	seedSTCSource(t, ctx, db, "src_ica_run_busy", busyFeed.URL+"/rss.xml", "ICA Busy", 1)
	seedSTCSource(t, ctx, db, "src_ica_run_idle_b", idleBFeed.URL+"/feed.xml", "ICA Idle B", 1)
	seedSTCSource(t, ctx, db, "src_ica_run_idle_c", idleCFeed.URL+"/feed.xml", "ICA Idle C", 1)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	var releaseBusyOnce sync.Once
	releaseBusy := func() { releaseBusyOnce.Do(func() { close(busyRelease) }) }
	t.Cleanup(releaseBusy)

	busyDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		busyDone <- stcPostManualFetch(router, "/api/sources/src_ica_run_busy/fetch")
	}()
	stcWaitForSignal(t, busyEntered, "busy source A fetch to enter upstream fixture")

	recorder := stcPostManualFetch(router, ManualIngestHTTPPath)
	assertStatus(t, recorder, http.StatusOK)
	icaAssertIngestCounter(t, recorder.Body.Bytes(), "sources_attempted", 2)
	icaAssertIngestCounter(t, recorder.Body.Bytes(), "sources_skipped", 1)
	icaAssertIngestError(t, recorder.Body.Bytes(), "src_ica_run_busy", "source_busy")
	if got := idleBRequests.Load(); got != 1 {
		t.Fatalf("RUN INGEST idle source B upstream requests = %d, want drained exactly once", got)
	}
	if got := idleCRequests.Load(); got != 1 {
		t.Fatalf("RUN INGEST idle source C upstream requests = %d, want drained exactly once", got)
	}
	if got := busyRequests.Load(); got != 1 {
		t.Fatalf("busy source A upstream requests before release = %d, want only original in-flight fetch", got)
	}
	assertManualFetchDurableArtifactsAbsent(t, ctx, db)

	releaseBusy()
	assertStatus(t, <-busyDone, http.StatusOK)
	icaAssertNoAdditionalRequests(t, busyRequests, 1, "busy source after RUN INGEST response")
}

func TestICAExpectedRedRunIngestExternalCapacitySkippedEntriesDoNotQueue(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	releaseCapacity := icaHoldExternalSourceLeases(t, ctx, icaExpectedSourceConcurrencySlots)
	defer releaseCapacity()

	blockedBFeed, blockedBRequests := icaCountingFeedServer(t, "Blocked B", "blocked-b")
	blockedCFeed, blockedCRequests := icaCountingFeedServer(t, "Blocked C", "blocked-c")
	seedSTCSource(t, ctx, db, "src_ica_capacity_blocked_b", blockedBFeed.URL+"/feed.xml", "ICA Blocked B", 1)
	seedSTCSource(t, ctx, db, "src_ica_capacity_blocked_c", blockedCFeed.URL+"/feed.xml", "ICA Blocked C", 1)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	recorder := stcPostManualFetch(router, ManualIngestHTTPPath)
	assertStatus(t, recorder, http.StatusOK)
	icaAssertIngestCounter(t, recorder.Body.Bytes(), "sources_attempted", 0)
	icaAssertIngestCounter(t, recorder.Body.Bytes(), "sources_skipped", 2)
	icaAssertIngestError(t, recorder.Body.Bytes(), "src_ica_capacity_blocked_b", "source_capacity_exhausted")
	icaAssertIngestError(t, recorder.Body.Bytes(), "src_ica_capacity_blocked_c", "source_capacity_exhausted")
	if got := blockedBRequests.Load(); got != 0 {
		t.Fatalf("capacity-blocked source B upstream requests = %d, want no started or queued work", got)
	}
	if got := blockedCRequests.Load(); got != 0 {
		t.Fatalf("capacity-blocked source C upstream requests = %d, want no started or queued work", got)
	}
	assertManualFetchDurableArtifactsAbsent(t, ctx, db)

	releaseCapacity()
	icaAssertNoDeferredFeedRequest(t, blockedBRequests, "capacity-blocked source B after RUN INGEST response")
	icaAssertNoDeferredFeedRequest(t, blockedCRequests, "capacity-blocked source C after RUN INGEST response")
}

func TestICAExpectedRedManualFetchRequestBodyFixturesRemainExactEmptyObjects(t *testing.T) {
	if ManualFetchRequestBody != "{}" {
		t.Fatalf("ManualFetchRequestBody = %q, want exact {}", ManualFetchRequestBody)
	}
	fixture := readFixture(t, "manual_ingest_empty_request.json")
	if string(fixture) != "{}" {
		t.Fatalf("manual_ingest_empty_request.json = %q, want exact {} with no whitespace or fields", string(fixture))
	}
}

func icaHoldExternalSourceLeases(t *testing.T, ctx context.Context, count int) func() {
	t.Helper()
	releases := make([]func(), 0, count)
	released := false
	for i := 0; i < count; i++ {
		release, err := tryAcquireIngestGuardWithActor(ctx, "fetch", fmt.Sprintf("src_ica_external_capacity_%02d", i), "background")
		if err != nil {
			for j := len(releases) - 1; j >= 0; j-- {
				releases[j]()
			}
			t.Fatalf("hold external source capacity lease %d/%d: %v", i+1, count, err)
		}
		releases = append(releases, release)
	}
	return func() {
		if released {
			return
		}
		released = true
		for i := len(releases) - 1; i >= 0; i-- {
			releases[i]()
		}
	}
}

func icaCountingFeedServer(t *testing.T, sourceTitle string, itemSlug string) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	var feedRequests atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			feedRequests.Add(1)
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>`+sourceTitle+`</title><item><guid>`+itemSlug+`</guid><title>`+itemSlug+` article</title><link>http://`+r.Host+`/`+itemSlug+`-article</link><description>Excerpt for `+itemSlug+`.</description></item></channel></rss>`)
		case "/" + itemSlug + "-article":
			_, _ = io.WriteString(w, `<html><body><article>Article body for `+itemSlug+`.</article></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	return server, &feedRequests
}

func icaAssertConflictReason(t *testing.T, body []byte, wantReason string) {
	t.Helper()
	var parsed ErrorBody
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal conflict response: %v; body=%s", err, string(body))
	}
	if parsed.Error.Code != ManualFetchErrorCodeConflict || parsed.Error.Details["reason"] != wantReason {
		t.Fatalf("conflict response = %+v, want code=%s reason=%s; body=%s", parsed.Error, ManualFetchErrorCodeConflict, wantReason, string(body))
	}
}

func icaAssertIngestCounter(t *testing.T, body []byte, field string, want int) {
	t.Helper()
	rawIngest := icaRawIngestMap(t, body)
	rawValue, ok := rawIngest[field]
	if !ok {
		t.Fatalf("RUN INGEST response missing ingest.%s; body=%s", field, string(body))
	}
	var got int
	if err := json.Unmarshal(rawValue, &got); err != nil {
		t.Fatalf("RUN INGEST ingest.%s is not integer: %v; body=%s", field, err, string(body))
	}
	if got != want {
		t.Fatalf("RUN INGEST ingest.%s = %d, want %d; body=%s", field, got, want, string(body))
	}
}

func icaAssertIngestError(t *testing.T, body []byte, sourceID string, code string) {
	t.Helper()
	rawIngest := icaRawIngestMap(t, body)
	rawErrors, ok := rawIngest["errors"]
	if !ok {
		t.Fatalf("RUN INGEST response missing ingest.errors; body=%s", string(body))
	}
	var errors []IngestErrorDetail
	if err := json.Unmarshal(rawErrors, &errors); err != nil {
		t.Fatalf("unmarshal RUN INGEST errors: %v; body=%s", err, string(body))
	}
	for _, ingestErr := range errors {
		if ingestErr.SourceID != nil && *ingestErr.SourceID == sourceID && ingestErr.Code == code {
			return
		}
	}
	fatalErrors, err := json.Marshal(errors)
	if err != nil {
		fatalErrors = []byte("<unmarshalable errors>")
	}
	t.Fatalf("RUN INGEST errors = %s, want source_id=%s code=%s; body=%s", string(fatalErrors), sourceID, code, string(body))
}

func icaRawIngestMap(t *testing.T, body []byte) map[string]json.RawMessage {
	t.Helper()
	var parsed struct {
		Ingest map[string]json.RawMessage `json:"ingest"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal ingest response: %v; body=%s", err, string(body))
	}
	if parsed.Ingest == nil {
		t.Fatalf("response missing ingest object; body=%s", string(body))
	}
	return parsed.Ingest
}

func icaAssertNoDeferredFeedRequest(t *testing.T, requests *atomic.Int64, label string) {
	t.Helper()
	icaAssertNoAdditionalRequests(t, requests, 0, label)
}

func icaAssertNoAdditionalRequests(t *testing.T, requests *atomic.Int64, want int64, label string) {
	t.Helper()
	timer := time.NewTimer(100 * time.Millisecond)
	defer timer.Stop()
	<-timer.C
	if got := requests.Load(); got != want {
		t.Fatalf("%s feed requests after response = %d, want %d (no queued work after response)", label, got, want)
	}
}
