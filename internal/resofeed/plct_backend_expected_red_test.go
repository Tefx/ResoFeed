package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPLCTRuntimeMetadataMigrationsAndDefaultLanguageContract(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	assertColumnExists(t, ctx, db, "runtime_metadata", "updated_at")
	assertColumnExists(t, ctx, db, "agent_receipts", "request_fingerprint")
	assertFTSColumnExists(t, ctx, db, "search_fts", "core_insight")

	info, err := readRuntimeLanguageViaHTTP(t, db)
	if err != nil {
		t.Fatalf("GET /api/runtime/language failed: %v", err)
	}
	if info.Code != ProcessingLanguageEnglish || info.Label != "English" {
		t.Fatalf("effective processing language = %+v, want en/English when runtime_metadata key is absent", info)
	}
}

func TestPLCTStateExportImportExcludesRuntimeMetadataAndReceipts(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	fixture := readFixture(t, "state_architecture_exact_minimal.json")
	if _, err := ValidateStateBundle(bytes.NewReader(fixture)); err != nil {
		t.Fatalf("ARCHITECTURE.md §5.5 exact state fixture rejected: %v", err)
	}

	if _, err := db.ExecContext(ctx, `insert into runtime_metadata (key, value, updated_at) values (?, ?, unixepoch()), (?, ?, unixepoch())`, RuntimeMetadataKeyProcessingLanguage, "zh", RuntimeMetadataKeySearchFTSStaleSince, "2026-05-09T00:00:00Z"); err != nil {
		t.Fatalf("seed runtime metadata: %v", err)
	}
	if _, err := db.ExecContext(ctx, `insert into agent_receipts (idempotency_key, actor_id, operation, item_id, created_at, result_snapshot, request_fingerprint) values ('plct-receipt', 'owner', 'set_processing_language', null, ?, '{}', 'fingerprint')`, time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatalf("seed receipt: %v", err)
	}

	var exported bytes.Buffer
	if err := ExportState(ctx, db, &exported); err != nil {
		t.Fatalf("ExportState returned error: %v", err)
	}
	for _, forbidden := range []string{"runtime_metadata", RuntimeMetadataKeyProcessingLanguage, RuntimeMetadataKeySearchFTSStaleSince, "agent_receipts", "request_fingerprint", "plct-receipt"} {
		if strings.Contains(exported.String(), forbidden) {
			t.Fatalf("state export leaked %q in body: %s", forbidden, exported.String())
		}
	}
}

func TestPLCTRuntimeLanguageHTTPStrictValidationAndReceiptTTL(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	for _, tc := range []struct {
		name string
		path string
		body string
		want string
	}{
		{name: "unknown query", path: RuntimeLanguageHTTPPath + "?trace=1", body: `{"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"plct-lang-query"}`, want: "trace"},
		{name: "unknown body", path: RuntimeLanguageHTTPPath, body: `{"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"plct-lang-body","extra":true}`, want: "extra"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			req := plctAuthorizedJSONRequest(http.MethodPut, tc.path, tc.body)
			router.ServeHTTP(recorder, req)

			assertStatus(t, recorder, http.StatusBadRequest)
			assertErrorField(t, recorder.Body.Bytes(), tc.want)
		})
	}

	first := httptest.NewRecorder()
	firstReq := plctAuthorizedJSONRequest(http.MethodPut, RuntimeLanguageHTTPPath, `{"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"plct-lang-live"}`)
	router.ServeHTTP(first, firstReq)
	assertStatus(t, first, http.StatusOK)

	replay := httptest.NewRecorder()
	replayReq := plctAuthorizedJSONRequest(http.MethodPut, RuntimeLanguageHTTPPath, `{"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"plct-lang-live"}`)
	router.ServeHTTP(replay, replayReq)
	assertStatus(t, replay, http.StatusOK)
	if !jsonBoolAt(t, replay.Body.Bytes(), "already_applied") {
		t.Fatalf("live language receipt replay already_applied=false; body=%s", replay.Body.String())
	}

	mismatch := httptest.NewRecorder()
	mismatchReq := plctAuthorizedJSONRequest(http.MethodPut, RuntimeLanguageHTTPPath, `{"language":"en","actor_kind":"human","actor_id":"owner","idempotency_key":"plct-lang-live"}`)
	router.ServeHTTP(mismatch, mismatchReq)
	assertStatus(t, mismatch, http.StatusBadRequest)
	assertErrorReason(t, mismatch.Body.Bytes(), "request_fingerprint_mismatch")

	if _, err := db.ExecContext(ctx, `update agent_receipts set created_at = ? where idempotency_key = 'plct-lang-live'`, time.Now().UTC().Add(-ReceiptLiveTTL-time.Minute).Format(time.RFC3339)); err != nil {
		t.Fatalf("expire language receipt: %v", err)
	}
	expired := httptest.NewRecorder()
	expiredReq := plctAuthorizedJSONRequest(http.MethodPut, RuntimeLanguageHTTPPath, `{"language":"en","actor_kind":"human","actor_id":"owner","idempotency_key":"plct-lang-live"}`)
	router.ServeHTTP(expired, expiredReq)
	assertStatus(t, expired, http.StatusOK)
	if jsonBoolAt(t, expired.Body.Bytes(), "already_applied") {
		t.Fatalf("expired language receipt was replayed instead of replaced fresh; body=%s", expired.Body.String())
	}
}

func TestPLCTDeliveryEndpointStrictValidationAndIdempotency(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedPLCTItem(t, ctx, db, "item_plct_delivery", "Insight before delivery")
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	path := "/api/items/item_plct_delivery/delivery"

	unknown := httptest.NewRecorder()
	unknownReq := plctAuthorizedJSONRequest(http.MethodPost, path, `{"actor_kind":"agent","actor_id":"briefing-agent","delivered_at":"2026-05-09T00:00:00Z","idempotency_key":"plct-delivery-unknown","channel":"telegram"}`)
	router.ServeHTTP(unknown, unknownReq)
	assertStatus(t, unknown, http.StatusBadRequest)
	assertErrorField(t, unknown.Body.Bytes(), "channel")

	first := httptest.NewRecorder()
	firstReq := plctAuthorizedJSONRequest(http.MethodPost, path, `{"actor_kind":"agent","actor_id":"briefing-agent","delivered_at":"2026-05-09T00:00:00Z","idempotency_key":"plct-delivery-live"}`)
	router.ServeHTTP(first, firstReq)
	assertStatus(t, first, http.StatusOK)

	replay := httptest.NewRecorder()
	replayReq := plctAuthorizedJSONRequest(http.MethodPost, path, `{"actor_kind":"agent","actor_id":"briefing-agent","delivered_at":"2026-05-09T00:00:00Z","idempotency_key":"plct-delivery-live"}`)
	router.ServeHTTP(replay, replayReq)
	assertStatus(t, replay, http.StatusOK)
	if !jsonBoolAt(t, replay.Body.Bytes(), "already_applied") {
		t.Fatalf("live delivery receipt replay already_applied=false; body=%s", replay.Body.String())
	}

	mismatch := httptest.NewRecorder()
	mismatchReq := plctAuthorizedJSONRequest(http.MethodPost, path, `{"actor_kind":"agent","actor_id":"briefing-agent","delivered_at":"2026-05-10T00:00:00Z","idempotency_key":"plct-delivery-live"}`)
	router.ServeHTTP(mismatch, mismatchReq)
	assertStatus(t, mismatch, http.StatusBadRequest)
	assertErrorReason(t, mismatch.Body.Bytes(), "request_fingerprint_mismatch")

	if _, err := db.ExecContext(ctx, `update agent_receipts set created_at = ? where idempotency_key = 'plct-delivery-live'`, time.Now().UTC().Add(-ReceiptLiveTTL-time.Minute).Format(time.RFC3339)); err != nil {
		t.Fatalf("expire delivery receipt: %v", err)
	}
	expired := httptest.NewRecorder()
	expiredReq := plctAuthorizedJSONRequest(http.MethodPost, path, `{"actor_kind":"agent","actor_id":"briefing-agent","delivered_at":"2026-05-10T00:00:00Z","idempotency_key":"plct-delivery-live"}`)
	router.ServeHTTP(expired, expiredReq)
	assertStatus(t, expired, http.StatusOK)
	if jsonBoolAt(t, expired.Body.Bytes(), "already_applied") {
		t.Fatalf("expired delivery receipt was replayed instead of accepted fresh; body=%s", expired.Body.String())
	}
}

func TestPLCTReprocessEndpointCountsStaleMarkerAndStrictValidation(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedPLCTItem(t, ctx, db, "item_plct_reprocess", "prior insight")
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: &plctLanguageRecordingLLM{}})

	unknown := httptest.NewRecorder()
	unknownReq := plctAuthorizedJSONRequest(http.MethodPost, RuntimeReprocessLibraryHTTPPath, `{"actor_kind":"human","actor_id":"owner","idempotency_key":"plct-reprocess-unknown","extra":true}`)
	router.ServeHTTP(unknown, unknownReq)
	assertStatus(t, unknown, http.StatusBadRequest)
	assertErrorField(t, unknown.Body.Bytes(), "extra")

	recorder := httptest.NewRecorder()
	req := plctAuthorizedJSONRequest(http.MethodPost, RuntimeReprocessLibraryHTTPPath, `{"actor_kind":"human","actor_id":"owner","idempotency_key":"plct-reprocess-run"}`)
	router.ServeHTTP(recorder, req)
	assertStatus(t, recorder, http.StatusOK)

	var parsed ReprocessLibraryResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal reprocess response: %v; body=%s", err, recorder.Body.String())
	}
	counts := parsed.Reprocess
	if counts.ItemsAttempted != counts.ItemsUpdated+counts.ItemsUnavailable+counts.ItemsFailed {
		t.Fatalf("items_attempted=%d, want updated+unavailable+failed=%d (%+v)", counts.ItemsAttempted, counts.ItemsUpdated+counts.ItemsUnavailable+counts.ItemsFailed, counts)
	}
	if !counts.FTSRebuilt || counts.ItemsIndexed == 0 {
		t.Fatalf("reprocess response did not report final FTS rebuild/index counts: %+v", counts)
	}

	doctor := httptest.NewRecorder()
	router.ServeHTTP(doctor, authorizedRequest(http.MethodGet, "/api/doctor", nil))
	assertStatus(t, doctor, http.StatusOK)
	if !strings.Contains(doctor.Body.String(), DoctorSearchFTSOKLinePrefix) {
		t.Fatalf("doctor missing search_fts ok after successful reprocess; body=%s", doctor.Body.String())
	}
}

func TestPLCTDoctorReportsStaleFTSMarker(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	staleSince := "2026-05-09T14:00:00Z"
	if _, err := db.ExecContext(ctx, `insert into runtime_metadata (key, value, updated_at) values (?, ?, unixepoch())`, RuntimeMetadataKeySearchFTSStaleSince, staleSince); err != nil {
		t.Fatalf("seed stale FTS marker: %v", err)
	}

	recorder := httptest.NewRecorder()
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, "/api/doctor", nil))
	assertStatus(t, recorder, http.StatusOK)
	if !strings.Contains(recorder.Body.String(), DoctorSearchFTSStaleLinePrefix+staleSince) {
		t.Fatalf("doctor body missing stale FTS line %q; body=%s", DoctorSearchFTSStaleLinePrefix+staleSince, recorder.Body.String())
	}
}

func TestPLCTTargetLanguageFTSIncludesCoreInsight(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedPLCTItem(t, ctx, db, "item_plct_fts", "核心洞察只在这里")
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuildSearchIndex returned error: %v", err)
	}

	var count int
	if err := db.QueryRowContext(ctx, `select count(*) from search_fts where search_fts match ?`, `"核心洞察只在这里"`).Scan(&count); err != nil {
		t.Fatalf("query search_fts for core_insight text: %v", err)
	}
	if count != 1 {
		t.Fatalf("search_fts matches for target-language core_insight = %d, want 1", count)
	}
}

func TestPLCTOpenRouterReceivesEffectiveTargetLanguage(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = w.Write([]byte(`<?xml version="1.0"?><rss><channel><title>PLCT</title><item><guid>plct-one</guid><title>One</title><link>` + "http://" + r.Host + `/article</link><description>excerpt</description></item></channel></rss>`))
		case "/article":
			_, _ = w.Write([]byte(`<html><body><article>article text for target language prompt</article></body></html>`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(feed.Close)
	if _, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values ('src_plct_lang', ?, 'PLCT', ?, 'not_fetched', 1, 1)`, feed.URL+"/feed.xml", time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatalf("insert source: %v", err)
	}
	capture := &plctLanguageRecordingLLM{}
	if err := IngestOnce(ctx, db, IngestConfig{LLM: capture}); err != nil {
		t.Fatalf("IngestOnce returned error: %v", err)
	}
	if capture.lastTarget != ProcessingLanguageEnglish {
		t.Fatalf("OpenRouter target_language = %q, want effective default en", capture.lastTarget)
	}
}

type plctLanguageRecordingLLM struct {
	lastTarget ProcessingLanguage
}

func (l *plctLanguageRecordingLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.lastTarget = input.TargetLanguage
	return OpenRouterSummaryOutput{Summary: "summary", CoreInsight: "insight", ValueTier: "high", ModelStatus: modelStatusOK}, nil
}

func (l *plctLanguageRecordingLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{InterpretedAs: "noop", Message: "noop"}, nil
}

func seedPLCTItem(t *testing.T, ctx context.Context, db *sql.DB, itemID string, coreInsight string) {
	t.Helper()
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, 'ok', 1, 1)`, "src_"+itemID, "https://"+itemID+".example/feed.xml", "PLCT Source", now); err != nil {
		t.Fatalf("insert source for %s: %v", itemID, err)
	}
	if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, summary, core_insight, feed_excerpt, extracted_text, value_tier, first_seen_at, extraction_status, model_status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'high', ?, 'full', 'ok')`, itemID, "src_"+itemID, "https://"+itemID+".example/feed.xml", "https://"+itemID+".example/article", "https://"+itemID+".example/article", "PLCT title", "PLCT summary", coreInsight, "PLCT excerpt", "PLCT extracted text", now); err != nil {
		t.Fatalf("insert item %s: %v", itemID, err)
	}
}

func plctAuthorizedJSONRequest(method string, target string, body string) *http.Request {
	req := authorizedRequest(method, target, bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func assertColumnExists(t *testing.T, ctx context.Context, db *sql.DB, table string, column string) {
	t.Helper()
	rows, err := db.QueryContext(ctx, `pragma table_info(`+table+`)`)
	if err != nil {
		t.Fatalf("pragma table_info(%s): %v", table, err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var cid int
		var name, typ string
		var notNull, pk int
		var defaultValue sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &notNull, &defaultValue, &pk); err != nil {
			t.Fatalf("scan table_info(%s): %v", table, err)
		}
		if name == column {
			return
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate table_info(%s): %v", table, err)
	}
	t.Fatalf("%s.%s column missing", table, column)
}

func assertFTSColumnExists(t *testing.T, ctx context.Context, db *sql.DB, table string, column string) {
	t.Helper()
	assertColumnExists(t, ctx, db, table, column)
}

func readRuntimeLanguageViaHTTP(t *testing.T, db *sql.DB) (ProcessingLanguageInfo, error) {
	t.Helper()
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, RuntimeLanguageHTTPPath, nil))
	if recorder.Code != http.StatusOK {
		return ProcessingLanguageInfo{}, errUnexpectedStatus{status: recorder.Code, body: recorder.Body.String()}
	}
	var parsed ProcessingLanguageResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		return ProcessingLanguageInfo{}, err
	}
	return parsed.Language, nil
}

type errUnexpectedStatus struct {
	status int
	body   string
}

func (e errUnexpectedStatus) Error() string {
	return "unexpected status " + http.StatusText(e.status) + ": " + e.body
}

func jsonBoolAt(t *testing.T, body []byte, field string) bool {
	t.Helper()
	var parsed map[string]any
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal bool response: %v; body=%s", err, string(body))
	}
	value, ok := parsed[field].(bool)
	if !ok {
		t.Fatalf("response field %q = %#v, want bool; body=%s", field, parsed[field], string(body))
	}
	return value
}

func assertErrorReason(t *testing.T, body []byte, want string) {
	t.Helper()
	var parsed ErrorBody
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal error body: %v; body=%s", err, string(body))
	}
	if parsed.Error.Code != "bad_request" || parsed.Error.Details["field"] != "idempotency_key" || parsed.Error.Details["reason"] != want {
		t.Fatalf("error details = %#v, want field=idempotency_key reason=%q; body=%s", parsed.Error.Details, want, string(body))
	}
}
