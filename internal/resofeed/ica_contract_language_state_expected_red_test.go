package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestICAExpectedRedLanguageParityManualFetchSourceUsesRuntimeZH(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	icaSetRuntimeLanguageZH(t, ctx, db, "ica-manual-fetch-zh")

	feed := icaLanguageParityFeed(t, "manual")
	seedSource(t, ctx, db, "src_ica_manual_fetch_zh", feed.URL+"/feed.xml", "ICA Manual Source")
	llm := &icaLanguageRecordingLLM{}

	result, err := ManualFetchSource(ctx, db, IngestConfig{LLM: llm}, "src_ica_manual_fetch_zh")
	if err != nil {
		t.Fatalf("ManualFetchSource returned error: %v", err)
	}
	if result.ItemsUpserted != 1 || result.ItemsDiscovered != 1 {
		t.Fatalf("ManualFetchSource result = %+v, want one discovered/upserted item", result)
	}
	icaAssertRecordedLanguages(t, llm, []ProcessingLanguage{ProcessingLanguageChinese})
	icaAssertStoredChineseFixtureOutput(t, ctx, db, itemIDByURL(t, ctx, db, feed.URL+"/manual-article"), "manual article")
}

func TestICAExpectedRedLanguageParityIngestOnceAndManualIngestUseRuntimeZH(t *testing.T) {
	for _, tc := range []struct {
		name      string
		sourceID  string
		itemSlug  string
		runIngest func(context.Context, *sql.DB, IngestConfig) error
	}{
		{
			name:     "IngestOnce",
			sourceID: "src_ica_ingest_once_zh",
			itemSlug: "ingest-once",
			runIngest: func(ctx context.Context, db *sql.DB, cfg IngestConfig) error {
				return IngestOnce(ctx, db, cfg)
			},
		},
		{
			name:     "ManualIngest",
			sourceID: "src_ica_manual_ingest_zh",
			itemSlug: "manual-ingest",
			runIngest: func(ctx context.Context, db *sql.DB, cfg IngestConfig) error {
				result, err := ManualIngest(ctx, db, cfg)
				if err != nil {
					return err
				}
				if result.ItemsUpserted != 1 || result.ItemsDiscovered != 1 {
					return errICAUnexpectedIngestResult{result: result}
				}
				return nil
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			db := newContractDB(t, ctx)
			icaSetRuntimeLanguageZH(t, ctx, db, "ica-"+tc.itemSlug+"-zh")

			feed := icaLanguageParityFeed(t, tc.itemSlug)
			seedSource(t, ctx, db, tc.sourceID, feed.URL+"/feed.xml", "ICA "+tc.name+" Source")
			llm := &icaLanguageRecordingLLM{}

			if err := tc.runIngest(ctx, db, IngestConfig{LLM: llm}); err != nil {
				t.Fatalf("%s returned error: %v", tc.name, err)
			}
			icaAssertRecordedLanguages(t, llm, []ProcessingLanguage{ProcessingLanguageChinese})
			icaAssertStoredChineseFixtureOutput(t, ctx, db, itemIDByURL(t, ctx, db, feed.URL+"/"+tc.itemSlug+"-article"), tc.itemSlug+" article")
		})
	}
}

func TestICAExpectedRedStateImportDuringActiveSourceWorkReturns409GlobalOperationRunning(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	release, err := tryAcquireIngestGuardWithActor(ctx, "fetch", "src_ica_busy_import_guard", string(ActorKindHuman))
	if err != nil {
		t.Fatalf("hold active source operation: %v", err)
	}
	t.Cleanup(release)

	recorder := httptest.NewRecorder()
	req := authorizedRequest(http.MethodPost, "/api/state/import", bytes.NewReader([]byte(icaValidStateBundle())))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)

	assertStatus(t, recorder, http.StatusConflict)
	var parsed ErrorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal state import conflict body: %v; body=%s", err, recorder.Body.String())
	}
	if parsed.Error.Code != "conflict" || parsed.Error.Details["reason"] != "global_operation_running" {
		t.Fatalf("state import conflict = %+v, want conflict reason=global_operation_running", parsed.Error)
	}
}

func TestICAExpectedRedUnrepresentedStateImportGuardAllowsNullCurrentOperation(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	release, err := tryAcquireIngestGuardWithActor(ctx, "state_import", "restore", "")
	if err != nil {
		t.Fatalf("hold short state import guard: %v", err)
	}
	t.Cleanup(release)

	recorder := httptest.NewRecorder()
	req := authorizedRequest(http.MethodPut, RuntimeLanguageHTTPPath, bytes.NewReader([]byte(`{"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"ica-language-during-state-import"}`)))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)

	assertStatus(t, recorder, http.StatusConflict)
	var parsed ErrorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal language conflict body: %v; body=%s", err, recorder.Body.String())
	}
	if parsed.Error.Code != "conflict" || parsed.Error.Details["reason"] != "global_operation_running" {
		t.Fatalf("language conflict = %+v, want conflict reason=global_operation_running", parsed.Error)
	}
	for _, field := range []string{"operation", "actor_kind", "current_operation"} {
		if value, ok := parsed.Error.Details[field]; ok && value != nil {
			t.Fatalf("details[%s] = %#v, want null or absent for short unrepresented state import blocker; details=%#v", field, value, parsed.Error.Details)
		}
	}
	if strings.Contains(recorder.Body.String(), "state_import") || strings.Contains(recorder.Body.String(), "state_restore") {
		t.Fatalf("unrepresented state guard leaked forbidden operation kind in body: %s", recorder.Body.String())
	}
}

type errICAUnexpectedIngestResult struct {
	result ManualFetchResult
}

func (e errICAUnexpectedIngestResult) Error() string {
	return "unexpected ingest result: " + e.result.Operation
}

type icaLanguageRecordingLLM struct {
	mu        sync.Mutex
	languages []ProcessingLanguage
	inputs    []OpenRouterSummaryInput
}

func (l *icaLanguageRecordingLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.mu.Lock()
	l.languages = append(l.languages, input.TargetLanguage)
	l.inputs = append(l.inputs, input)
	l.mu.Unlock()

	return OpenRouterSummaryOutput{
		LocalizedTitle: "中文标题 " + input.Title,
		Title:          "中文标题 " + input.Title,
		Summary:        "中文摘要说明 " + input.Title + " 的来源事实。",
		CoreInsight:    "中文洞察说明 " + input.Title + " 的重要性。",
		FeedExcerpt:    "中文摘录 " + input.Title,
		ExtractedText:  "中文正文 " + input.Title,
		KeyPoints: []string{
			"中文要点一说明来源事实。",
			"中文要点二说明来源事实。",
			"中文要点三说明来源事实。",
		},
		ValueTier:   "high",
		ModelStatus: modelStatusOK,
	}, nil
}

func (l *icaLanguageRecordingLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func (l *icaLanguageRecordingLLM) snapshotLanguages() []ProcessingLanguage {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]ProcessingLanguage(nil), l.languages...)
}

func icaSetRuntimeLanguageZH(t *testing.T, ctx context.Context, db *sql.DB, key string) {
	t.Helper()
	_, err := SetProcessingLanguage(ctx, db, SetProcessingLanguageRequest{
		Language: ProcessingLanguageChinese,
		MutationRequestFields: MutationRequestFields{
			ActorKind:      ActorKindHuman,
			ActorID:        "owner",
			IdempotencyKey: key,
		},
	})
	if err != nil {
		t.Fatalf("SetProcessingLanguage zh: %v", err)
	}
}

func icaLanguageParityFeed(t *testing.T, itemSlug string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>ICA Feed Title</title><item><guid>`+itemSlug+`</guid><title>`+itemSlug+` article</title><link>http://`+r.Host+`/`+itemSlug+`-article</link><description>English excerpt for `+itemSlug+`.</description></item></channel></rss>`)
		case "/" + itemSlug + "-article":
			_, _ = io.WriteString(w, `<html><body><article>English article body for `+itemSlug+` with source facts.</article></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	return server
}

func icaAssertRecordedLanguages(t *testing.T, llm *icaLanguageRecordingLLM, want []ProcessingLanguage) {
	t.Helper()
	got := llm.snapshotLanguages()
	if len(got) != len(want) {
		t.Fatalf("recorded target languages = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("recorded target languages = %v, want %v", got, want)
		}
	}
}

func icaAssertStoredChineseFixtureOutput(t *testing.T, ctx context.Context, db *sql.DB, itemID string, sourceTitle string) {
	t.Helper()
	text := readStoredText(t, ctx, db, itemID)
	if text.title != "中文标题 "+sourceTitle || text.summary != "中文摘要说明 "+sourceTitle+" 的来源事实。" || text.coreInsight != "中文洞察说明 "+sourceTitle+" 的重要性。" || text.feedExcerpt != "中文摘录 "+sourceTitle || text.extractedText != "中文正文 "+sourceTitle {
		t.Fatalf("stored Chinese fixture output = %+v", text)
	}
}

func icaValidStateBundle() string {
	return `{"schema_version":"resofeed.state.v1","exported_at":"2026-05-09T00:00:00Z","sources":[],"steer_rules":[],"resonated_items":[]}`
}
