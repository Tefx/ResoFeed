package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSRDCTHTTPPreviewSteerExpectedRedAuthStrictSchemaAndReadOnly(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: srdctSteeringLLM{}})

	unauthorized := httptest.NewRecorder()
	router.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodPost, "/api/steer/preview", strings.NewReader(`{"command":"search sqlite","actor_kind":"human","actor_id":"owner"}`)))
	srdctWantStatus(t, unauthorized, http.StatusUnauthorized, "preview requires owner-token auth before route/schema work")

	before := srdctTableCounts(t, ctx, db)

	unknownField := srdctAuthorizedJSON(http.MethodPost, "/api/steer/preview", `{"command":"search sqlite","actor_kind":"human","actor_id":"owner","extra":"nope"}`)
	unknownRecorder := httptest.NewRecorder()
	router.ServeHTTP(unknownRecorder, unknownField)
	srdctWantStatus(t, unknownRecorder, http.StatusBadRequest, "preview rejects unknown strict-schema fields")
	srdctWantErrorField(t, unknownRecorder.Body.Bytes(), "extra", "preview unknown field")

	withKey := srdctAuthorizedJSON(http.MethodPost, "/api/steer/preview", `{"command":"search sqlite","actor_kind":"human","actor_id":"owner","idempotency_key":"preview-must-not-accept-key"}`)
	withKeyRecorder := httptest.NewRecorder()
	router.ServeHTTP(withKeyRecorder, withKey)
	srdctWantStatus(t, withKeyRecorder, http.StatusBadRequest, "preview rejects idempotency_key because it is read-only")
	srdctWantErrorField(t, withKeyRecorder.Body.Bytes(), "idempotency_key", "preview idempotency_key rejection")

	previewReq := srdctAuthorizedJSON(http.MethodPost, "/api/steer/preview", `{"command":"search sqlite","actor_kind":"human","actor_id":"owner"}`)
	previewRecorder := httptest.NewRecorder()
	router.ServeHTTP(previewRecorder, previewReq)
	srdctWantStatus(t, previewRecorder, http.StatusOK, "preview route exists and returns canonical route classification")
	var preview SteerPreviewResult
	if err := json.Unmarshal(previewRecorder.Body.Bytes(), &preview); err != nil {
		t.Errorf("preview response is not SteerPreviewResult JSON: %v; body=%s", err, previewRecorder.Body.String())
	} else if preview.Preview.RouteKind != SteerRouteSearch || preview.Preview.WillMutate || preview.Preview.LexicalSearchQuery == nil || preview.Preview.UndoHandle != nil {
		t.Errorf("preview = %+v, want read-only lexical search classification without undo handle", preview.Preview)
	}

	after := srdctTableCounts(t, ctx, db)
	if before != after {
		t.Errorf("preview changed durable state counts: before=%+v after=%+v; want no writes to sources, steer_rules, item_state, agent_receipts, or FTS", before, after)
	}
}

func TestSRDCTHTTPPreviewSteerExpectedRedRoutePrecedenceAndBoundaries(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: srdctSteeringLLM{}})

	for _, tc := range []struct {
		name        string
		command     string
		wantRoute   SteerRouteKind
		wantMutates bool
		wantMessage []string
	}{
		{name: "doctor wins over policy", command: "/doctor", wantRoute: SteerRouteDoctor, wantMutates: false},
		{name: "direct URL add source", command: "https://new-source.example.test/rss.xml", wantRoute: SteerRouteSource, wantMutates: false},
		{name: "add alias", command: "add https://new-source.example.test/rss.xml", wantRoute: SteerRouteSource, wantMutates: false},
		{name: "add Chinese alias", command: "添加 https://new-source.example.test/rss.xml", wantRoute: SteerRouteSource, wantMutates: false},
		{name: "search alias", command: "search sqlite", wantRoute: SteerRouteSearch, wantMutates: false},
		{name: "search Chinese alias", command: "搜索 sqlite", wantRoute: SteerRouteSearch, wantMutates: false},
		{name: "find warning-only alias", command: "find sqlite", wantRoute: SteerRouteSearch, wantMutates: false, wantMessage: []string{"warning", "find is treated as lexical search", "no generated answer"}},
		{name: "invalid vague add", command: "add that blog I mentioned", wantRoute: SteerRouteUnknown, wantMutates: false, wantMessage: []string{"RSS", "URL", "not applied"}},
		{name: "unmatched proposed rule", command: "make the feed more resonant somehow", wantRoute: SteerRoutePolicy, wantMutates: false, wantMessage: []string{"not applied", "no safe product-valid steering rule"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, srdctAuthorizedJSON(http.MethodPost, "/api/steer/preview", srdctPreviewBody(t, tc.command)))
			srdctWantStatus(t, recorder, http.StatusOK, tc.name)
			var parsed SteerPreviewResult
			if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
				t.Errorf("unmarshal preview %q: %v; body=%s", tc.command, err, recorder.Body.String())
				return
			}
			if parsed.Preview.RouteKind != tc.wantRoute || parsed.Preview.WillMutate != tc.wantMutates {
				t.Errorf("preview route for %q = %+v, want route=%s will_mutate=%v", tc.command, parsed.Preview, tc.wantRoute, tc.wantMutates)
			}
			for _, part := range tc.wantMessage {
				if !strings.Contains(strings.ToLower(parsed.Preview.Message), strings.ToLower(part)) {
					t.Errorf("preview message for %q = %q, want contains %q", tc.command, parsed.Preview.Message, part)
				}
			}
		})
	}
}

func TestSRDCTHTTPPreviewSteerPolicyLLMFailureFallsBackReadOnly(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	llm := &srdctFailingSteeringLLM{}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})

	before := srdctTableCounts(t, ctx, db)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, srdctAuthorizedJSON(http.MethodPost, "/api/steer/preview", srdctPreviewBody(t, "push more source-backed SQLite runtime analysis")))
	srdctWantStatus(t, recorder, http.StatusOK, "policy preview falls back safely when OpenRouter translation fails")

	var parsed SteerPreviewResult
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal fallback policy preview: %v; body=%s", err, recorder.Body.String())
	}
	if parsed.Preview.RouteKind != SteerRoutePolicy || parsed.Preview.InterpretedAs != "no_safe_policy_change" || parsed.Preview.WillMutate || len(parsed.Preview.ChangedRules) != 0 {
		t.Fatalf("fallback policy preview = %+v, want policy no_safe_policy_change, will_mutate=false, changed_rules=[]", parsed.Preview)
	}
	if !strings.Contains(parsed.Preview.Message, "not applied: no safe product-valid steering rule remained") {
		t.Fatalf("fallback policy preview message = %q, want safe fallback message", parsed.Preview.Message)
	}
	if llm.calls != 1 {
		t.Fatalf("TranslateSteering calls = %d, want 1 for policy-route preview", llm.calls)
	}
	after := srdctTableCounts(t, ctx, db)
	if before != after {
		t.Fatalf("fallback policy preview changed durable state counts: before=%+v after=%+v", before, after)
	}
}

func TestSRDCTHTTPPreviewSteerSourceWillMutateFalseAndReadOnly(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: srdctSteeringLLM{}})

	before := srdctTableCounts(t, ctx, db)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, srdctAuthorizedJSON(http.MethodPost, "/api/steer/preview", srdctPreviewBody(t, "add https://preview-source.example.test/rss.xml")))
	srdctWantStatus(t, recorder, http.StatusOK, "source preview is a read-only classification")
	var parsed SteerPreviewResult
	if err := json.Unmarshal(recorder.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal source preview: %v; body=%s", err, recorder.Body.String())
	}
	if parsed.Preview.RouteKind != SteerRouteSource || parsed.Preview.WillMutate {
		t.Fatalf("source preview = %+v, want source route with will_mutate=false because preview call does not mutate", parsed.Preview)
	}
	after := srdctTableCounts(t, ctx, db)
	if before != after {
		t.Fatalf("source preview changed durable state counts: before=%+v after=%+v", before, after)
	}
}

func TestSRDCTHTTPCommitSteerExpectedRedIdempotencyUndoAndPolicyConflicts(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	llm := &srdctCountingSteeringLLM{out: OpenRouterSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Prefer source-backed SQLite runtime reports."}, Message: "applied: source-backed SQLite runtime reports"}}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})

	missingKey := httptest.NewRecorder()
	router.ServeHTTP(missingKey, srdctAuthorizedJSON(http.MethodPost, "/api/steer", `{"command":"Push source-backed SQLite reports.","actor_kind":"human","actor_id":"owner"}`))
	srdctWantStatus(t, missingKey, http.StatusBadRequest, "commit requires idempotency_key")
	srdctWantErrorField(t, missingKey.Body.Bytes(), "idempotency_key", "missing commit idempotency_key")

	first := httptest.NewRecorder()
	body := `{"command":"Push source-backed SQLite reports.","actor_kind":"human","actor_id":"owner","idempotency_key":"srdct-steer-commit-001"}`
	router.ServeHTTP(first, srdctAuthorizedJSON(http.MethodPost, "/api/steer", body))
	srdctWantStatus(t, first, http.StatusOK, "commit applies policy through classifier/LLM")
	if got := llm.calls; got != 1 {
		t.Errorf("TranslateSteering calls after first commit = %d, want 1", got)
	}
	var committed struct {
		Receipt    SteeringReceipt  `json:"receipt"`
		UndoHandle *SteerUndoHandle `json:"undo_handle"`
	}
	if err := json.Unmarshal(first.Body.Bytes(), &committed); err != nil {
		t.Errorf("unmarshal commit response: %v; body=%s", err, first.Body.String())
	} else if committed.UndoHandle == nil || committed.UndoHandle.Target == nil || committed.UndoHandle.Target.Kind != "steer_rule" || len(committed.Receipt.ChangedRules) != 1 {
		t.Errorf("commit response = %+v, want undo handle only for revocable rule write", committed)
	}

	replay := httptest.NewRecorder()
	router.ServeHTTP(replay, srdctAuthorizedJSON(http.MethodPost, "/api/steer", body))
	srdctWantStatus(t, replay, http.StatusOK, "commit idempotency replay preserves fingerprint")
	if got := llm.calls; got != 1 {
		t.Errorf("TranslateSteering calls after same-key replay = %d, want still 1", got)
	}

	mismatch := httptest.NewRecorder()
	router.ServeHTTP(mismatch, srdctAuthorizedJSON(http.MethodPost, "/api/steer", `{"command":"Push PostgreSQL reports.","actor_kind":"human","actor_id":"owner","idempotency_key":"srdct-steer-commit-001"}`))
	srdctWantStatus(t, mismatch, http.StatusBadRequest, "commit detects request_fingerprint mismatch")
	srdctWantErrorField(t, mismatch.Body.Bytes(), "idempotency_key", "commit fingerprint mismatch")

	conflict := httptest.NewRecorder()
	router.ServeHTTP(conflict, srdctAuthorizedJSON(http.MethodPost, "/api/steer", `{"command":"hide all fresh items and only show old starred memory forever","actor_kind":"human","actor_id":"owner","idempotency_key":"srdct-steer-conflict-001"}`))
	srdctWantStatus(t, conflict, http.StatusOK, "AC-4 conflict returns closest allowable interpretation")
	var conflictResult struct {
		Receipt    SteeringReceipt  `json:"receipt"`
		UndoHandle *SteerUndoHandle `json:"undo_handle"`
	}
	if err := json.Unmarshal(conflict.Body.Bytes(), &conflictResult); err != nil {
		t.Errorf("unmarshal conflict receipt: %v; body=%s", err, conflict.Body.String())
	} else {
		srdctAssertConflictMessage(t, conflictResult.Receipt.Message)
		if conflictResult.UndoHandle != nil || len(conflictResult.Receipt.ChangedRules) != 0 {
			t.Errorf("conflict result = %+v, want no changed rules and no undo handle for non-write", conflictResult)
		}
	}
}

func TestSRDCTHTTPThenMCPSteerSameKeyCommandReplaysWithoutFingerprintMismatch(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	llm := &srdctCountingSteeringLLM{out: OpenRouterSteeringOutput{InterpretedAs: "openrouter_policy_update", RuleTexts: []string{"Prefer deterministic SQLite steering parity."}, Message: "applied: deterministic SQLite steering parity"}}
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: llm})

	command := "Push deterministic SQLite steering parity."
	key := "srdct-http-mcp-steer-parity-001"
	bodyData, err := json.Marshal(SteerRequest{Command: command, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: "briefing-agent", IdempotencyKey: key}})
	if err != nil {
		t.Fatalf("marshal HTTP steer body: %v", err)
	}
	first := postHTTPJSON[SteerResult](t, router, "/api/steer", string(bodyData), http.StatusOK)
	if first.Receipt.InterpretedAs != "openrouter_policy_update" || len(first.Receipt.ChangedRules) != 1 {
		t.Fatalf("HTTP steer result = %+v, want committed policy receipt", first)
	}
	if got := llm.calls; got != 1 {
		t.Fatalf("TranslateSteering calls after HTTP steer = %d, want 1", got)
	}

	replayResp := mcpCall(t, router, "steer", map[string]any{"command": command, "actor_id": "briefing-agent", "idempotency_key": key})
	if replayResp.Error != nil {
		t.Fatalf("MCP steer replay returned error: %+v", replayResp.Error)
	}
	text := mcpToolText(t, replayResp, "steer HTTP-to-MCP replay")
	var replay SteerResult
	if err := json.Unmarshal([]byte(text), &replay); err != nil {
		t.Fatalf("unmarshal MCP steer replay: %v; text=%s", err, text)
	}
	if replay.Receipt.InterpretedAs != first.Receipt.InterpretedAs || len(replay.Receipt.ChangedRules) != 1 || replay.Receipt.ChangedRules[0].ID != first.Receipt.ChangedRules[0].ID {
		t.Fatalf("MCP replay = %+v, want stored HTTP receipt %+v", replay, first)
	}
	if got := llm.calls; got != 1 {
		t.Fatalf("TranslateSteering calls after MCP replay = %d, want still 1", got)
	}
	assertReceiptCount(t, ctx, db, key, 1)
}

func TestSRDCTHTTPUndoSteerExpectedRedTargetSpecificAndIdempotent(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: srdctSteeringLLM{}})

	ruleRevision := int64(7)
	ruleHandle := SteerUndoHandle{RouteKind: SteerRoutePolicy, Target: &SteerTarget{Kind: "steer_rule", ID: "rule_srdct_existing"}, Revision: &ruleRevision}
	body := srdctUndoBody(t, ruleHandle, "srdct-undo-rule-001")

	first := httptest.NewRecorder()
	router.ServeHTTP(first, srdctAuthorizedJSON(http.MethodPost, "/api/steer/undo", body))
	srdctWantStatus(t, first, http.StatusOK, "undo route restores only supplied target")
	var undo SteerUndoResult
	if err := json.Unmarshal(first.Body.Bytes(), &undo); err != nil {
		t.Errorf("unmarshal undo response: %v; body=%s", err, first.Body.String())
	} else if undo.Target == nil || undo.Target.ID != "rule_srdct_existing" || !undo.Undone || undo.RestoredRule == nil || undo.RestoredSource != nil {
		t.Errorf("undo response = %+v, want target-specific rule undo and no global/last-action behavior", undo)
	}

	replay := httptest.NewRecorder()
	router.ServeHTTP(replay, srdctAuthorizedJSON(http.MethodPost, "/api/steer/undo", body))
	srdctWantStatus(t, replay, http.StatusOK, "undo same key replay is idempotent")
	var replayed SteerUndoResult
	if err := json.Unmarshal(replay.Body.Bytes(), &replayed); err != nil {
		t.Errorf("unmarshal replay undo response: %v; body=%s", err, replay.Body.String())
	} else if !replayed.AlreadyApplied || replayed.Target == nil || replayed.Target.ID != "rule_srdct_existing" {
		t.Errorf("replayed undo response = %+v, want already_applied for same target", replayed)
	}

	alreadyInactiveHandle := SteerUndoHandle{RouteKind: SteerRouteSource, Target: &SteerTarget{Kind: "source", ID: "src_srdct_inactive"}, Revision: &ruleRevision}
	alreadyInactive := httptest.NewRecorder()
	router.ServeHTTP(alreadyInactive, srdctAuthorizedJSON(http.MethodPost, "/api/steer/undo", srdctUndoBody(t, alreadyInactiveHandle, "srdct-undo-inactive-source-001")))
	srdctWantStatus(t, alreadyInactive, http.StatusOK, "undo inactive target is idempotent and target-scoped")
	var inactive SteerUndoResult
	if err := json.Unmarshal(alreadyInactive.Body.Bytes(), &inactive); err != nil {
		t.Errorf("unmarshal inactive undo response: %v; body=%s", err, alreadyInactive.Body.String())
	} else if inactive.Target == nil || inactive.Target.ID != "src_srdct_inactive" || inactive.Message == "" || strings.Contains(strings.ToLower(inactive.Message), "last action") {
		t.Errorf("inactive undo response = %+v, want explicit target idempotency and never global/last-action undo", inactive)
	}
}

func TestSRDCTLexicalSearchExpectedRedNoVectorEmbeddingRAGOrGeneratedAnswer(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: srdctSteeringLLM{}})

	for _, path := range []string{
		"/api/search?q=sqlite&semantic=true",
		"/api/search?q=sqlite&vector=true",
		"/api/search?q=sqlite&embedding=true",
		"/api/search?q=sqlite&rag=true",
		"/api/search?q=sqlite&answer=true",
	} {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, authorizedRequest(http.MethodGet, path, nil))
		srdctWantStatus(t, recorder, http.StatusBadRequest, "search rejects non-lexical parameter "+path)
	}

	find := httptest.NewRecorder()
	router.ServeHTTP(find, srdctAuthorizedJSON(http.MethodPost, "/api/steer/preview", srdctPreviewBody(t, "find sqlite")))
	srdctWantStatus(t, find, http.StatusOK, "find alias is warning-only lexical search")
	var parsed SteerPreviewResult
	if err := json.Unmarshal(find.Body.Bytes(), &parsed); err != nil {
		t.Errorf("unmarshal find preview: %v; body=%s", err, find.Body.String())
	} else if parsed.Preview.RouteKind != SteerRouteSearch || !strings.Contains(strings.ToLower(parsed.Preview.Message), "no generated answer") || parsed.Preview.WillMutate {
		t.Errorf("find preview = %+v, want lexical-only warning copy without vector/embedding/RAG/generated answer behavior", parsed.Preview)
	}
}

func TestSRDCTMCPSteerPreviewCommitUndoExpectedRedParity(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken, LLM: srdctSteeringLLM{}})

	tools := expectedRedToolNames(t, mcpRequestJSON(t, handler, map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}))
	for _, name := range []string{"preview_steer", "steer", "undo_steer"} {
		if _, ok := tools[name]; !ok {
			t.Errorf("MCP tools/list missing %q; tools=%v", name, tools)
		}
	}

	previewResp := mcpCall(t, handler, "preview_steer", map[string]any{"command": "find sqlite", "actor_id": "briefing-agent"})
	if text, ok := expectedRedToolText(t, previewResp, "preview_steer"); ok {
		var parsed SteerPreviewResult
		if err := json.Unmarshal([]byte(text), &parsed); err != nil {
			t.Errorf("unmarshal MCP preview_steer text: %v; text=%s", err, text)
		} else if parsed.Preview.RouteKind != SteerRouteSearch || parsed.Preview.WillMutate || !strings.Contains(strings.ToLower(parsed.Preview.Message), "no generated answer") {
			t.Errorf("MCP preview_steer = %+v, want HTTP-parity lexical warning and no agent-only concepts", parsed.Preview)
		}
	}

	steerResp := mcpCall(t, handler, "steer", map[string]any{"command": "hide all fresh items", "actor_id": "briefing-agent", "idempotency_key": "srdct-mcp-steer-001"})
	if text, ok := expectedRedToolText(t, steerResp, "steer invariant conflict"); ok {
		var parsed struct {
			Receipt    SteeringReceipt  `json:"receipt"`
			UndoHandle *SteerUndoHandle `json:"undo_handle"`
		}
		if err := json.Unmarshal([]byte(text), &parsed); err != nil {
			t.Errorf("unmarshal MCP steer text: %v; text=%s", err, text)
		} else {
			srdctAssertConflictMessage(t, parsed.Receipt.Message)
			if parsed.UndoHandle != nil {
				t.Errorf("MCP steer conflict undo_handle = %+v, want nil for non-write", parsed.UndoHandle)
			}
		}
	}

	undoResp := mcpCall(t, handler, "undo_steer", map[string]any{"undo_handle": map[string]any{"route_kind": "policy", "target": map[string]any{"kind": "steer_rule", "id": "rule_srdct_existing"}, "revision": 7}, "actor_id": "briefing-agent", "idempotency_key": "srdct-mcp-undo-001"})
	if text, ok := expectedRedToolText(t, undoResp, "undo_steer"); ok {
		var parsed SteerUndoResult
		if err := json.Unmarshal([]byte(text), &parsed); err != nil {
			t.Errorf("unmarshal MCP undo_steer text: %v; text=%s", err, text)
		} else if parsed.Target == nil || parsed.Target.ID != "rule_srdct_existing" || strings.Contains(strings.ToLower(parsed.Message), "last action") {
			t.Errorf("MCP undo_steer = %+v, want target-specific HTTP parity and no global undo", parsed)
		}
	}
}

type srdctTableSnapshot struct {
	Sources       int
	SteerRules    int
	ItemState     int
	AgentReceipts int
	SearchFTS     int
}

func srdctTableCounts(t *testing.T, ctx context.Context, db *sql.DB) srdctTableSnapshot {
	t.Helper()
	return srdctTableSnapshot{
		Sources:       srdctScalarCount(t, ctx, db, `select count(*) from sources`),
		SteerRules:    srdctScalarCount(t, ctx, db, `select count(*) from steer_rules`),
		ItemState:     srdctScalarCount(t, ctx, db, `select count(*) from item_state`),
		AgentReceipts: srdctScalarCount(t, ctx, db, `select count(*) from agent_receipts`),
		SearchFTS:     srdctScalarCount(t, ctx, db, `select count(*) from search_fts`),
	}
}

func srdctScalarCount(t *testing.T, ctx context.Context, db *sql.DB, query string) int {
	t.Helper()
	var count int
	if err := db.QueryRowContext(ctx, query).Scan(&count); err != nil {
		t.Fatalf("count query %q: %v", query, err)
	}
	return count
}

func seedSRDCTSteerState(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	insertSource(t, ctx, db, "src_srdct", "https://srdct.example.test/rss.xml", "SRDCT Source")
	if _, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, is_active, revision) values ('src_srdct_inactive', 'https://inactive.example.test/rss.xml', 'Inactive Source', ?, 0, 3)`, now.Format(time.RFC3339)); err != nil {
		t.Fatalf("insert inactive source: %v", err)
	}
	if _, err := db.ExecContext(ctx, `insert into steer_rules (id, rule_text, is_active, created_at, created_by_actor_kind, created_by_actor_id, revision) values ('rule_srdct_existing', 'Prefer source-backed SQLite runtime reports.', 1, ?, 'human', 'owner', 7)`, now.Format(time.RFC3339)); err != nil {
		t.Fatalf("insert steer rule: %v", err)
	}
	if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, summary, core_insight, value_tier, published_at, first_seen_at, extraction_status, model_status, feed_excerpt, extracted_text) values ('item_srdct', 'src_srdct', 'https://srdct.example.test/rss.xml', 'https://srdct.example.test/item', 'https://srdct.example.test/item', 'SQLite lexical steering boundary', 'No vector database is involved.', 'Search stays lexical and provenance-backed.', 'high', ?, ?, 'full', 'ok', 'sqlite feed excerpt', 'sqlite fts searchable text')`, now.Format(time.RFC3339), now.Format(time.RFC3339)); err != nil {
		t.Fatalf("insert item: %v", err)
	}
	if _, err := db.ExecContext(ctx, `insert into item_state (item_id, is_resonated, human_inspected_at, external_surfaced_at, last_actor_kind, last_actor_id) values ('item_srdct', 1, null, null, 'human', 'owner')`); err != nil {
		t.Fatalf("insert item state: %v", err)
	}
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild search index: %v", err)
	}
}

func srdctAuthorizedJSON(method string, path string, body string) *http.Request {
	req := authorizedRequest(method, path, bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func srdctPreviewBody(t *testing.T, command string) string {
	t.Helper()
	data, err := json.Marshal(SteerPreviewRequest{Command: command, ActorKind: ActorKindHuman, ActorID: "owner"})
	if err != nil {
		t.Fatalf("marshal preview body: %v", err)
	}
	return string(data)
}

func srdctUndoBody(t *testing.T, handle SteerUndoHandle, key string) string {
	t.Helper()
	data, err := json.Marshal(SteerUndoRequest{UndoHandle: handle, MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: key}})
	if err != nil {
		t.Fatalf("marshal undo body: %v", err)
	}
	return string(data)
}

func srdctWantStatus(t *testing.T, recorder *httptest.ResponseRecorder, want int, context string) {
	t.Helper()
	if recorder.Code != want {
		t.Errorf("%s: status = %d, want %d; body=%s", context, recorder.Code, want, recorder.Body.String())
	}
}

func srdctWantErrorField(t *testing.T, body []byte, want string, context string) {
	t.Helper()
	var parsed ErrorBody
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Errorf("%s: unmarshal error body: %v; body=%s", context, err, string(body))
		return
	}
	if got, _ := parsed.Error.Details["field"].(string); got != want {
		t.Errorf("%s: error field = %q, want %q; body=%s", context, got, want, string(body))
	}
}

func srdctAssertConflictMessage(t *testing.T, message string) {
	t.Helper()
	lower := strings.ToLower(message)
	for _, part := range []string{"closest", "freshness", "coverage", "provenance", "minimalism"} {
		if !strings.Contains(lower, part) {
			t.Errorf("conflict message = %q, want terse closest-allowable interpretation preserving %q", message, part)
		}
	}
}

type srdctSteeringLLM struct{}

func (srdctSteeringLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{}, nil
}

func (srdctSteeringLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{InterpretedAs: "no_safe_policy_change", RuleTexts: nil, Message: "not applied: no safe product-valid steering rule remained"}, nil
}

type srdctCountingSteeringLLM struct {
	calls int
	out   OpenRouterSteeringOutput
}

func (l *srdctCountingSteeringLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{}, nil
}

func (l *srdctCountingSteeringLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	l.calls++
	return l.out, nil
}

type srdctFailingSteeringLLM struct {
	calls int
}

func (l *srdctFailingSteeringLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{}, nil
}

func (l *srdctFailingSteeringLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	l.calls++
	return OpenRouterSteeringOutput{}, errors.New("openrouter translation unavailable")
}
