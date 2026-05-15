package resofeed

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSRDCTBackendPreviewSteerExpectedRedNoReceiptOrFTSRewrite(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken, LLM: srdctSteeringLLM{}})

	beforeCounts := srdctTableCounts(t, ctx, db)
	beforeFTS := srdctSearchFTSSnapshot(t, ctx, db)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, srdctAuthorizedJSON(http.MethodPost, "/api/steer/preview", srdctPreviewBody(t, "find sqlite")))
	srdctWantStatus(t, recorder, http.StatusOK, "preview_steer is authenticated read-only classification, not a receipt-producing mutation")

	afterCounts := srdctTableCounts(t, ctx, db)
	if beforeCounts != afterCounts {
		t.Fatalf("preview changed durable table counts: before=%+v after=%+v", beforeCounts, afterCounts)
	}
	afterFTS := srdctSearchFTSSnapshot(t, ctx, db)
	if beforeFTS != afterFTS {
		t.Fatalf("preview rewrote FTS content: before=%q after=%q", beforeFTS, afterFTS)
	}
}

func TestSRDCTBackendSteerExpectedRedRejectsAgentOnlyMCPConcepts(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSRDCTSteerState(t, ctx, db)
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken, LLM: srdctSteeringLLM{}})

	resp := mcpCall(t, handler, "preview_steer", map[string]any{
		"command":    "find sqlite",
		"actor_id":   "briefing-agent",
		"agent_name": "agent-only-ui-concept",
	})
	expectedRedAssertNestedMCPError(t, resp, -32602, "bad_request", "agent_name", "", "preview_steer rejects agent-only concepts and keeps HTTP schema parity")
}

func srdctSearchFTSSnapshot(t *testing.T, ctx context.Context, db *sql.DB) string {
	t.Helper()
	var parts []string
	rows, err := db.QueryContext(ctx, `select item_id, title, source_title, feed_excerpt, summary, core_insight, extracted_text, provenance from search_fts order by item_id`)
	if err != nil {
		t.Fatalf("query search_fts snapshot: %v", err)
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil {
			t.Fatalf("close search_fts snapshot rows: %v", closeErr)
		}
	}()
	for rows.Next() {
		var itemID, title, sourceTitle, feedExcerpt, summary, coreInsight, extractedText, provenance string
		if err := rows.Scan(&itemID, &title, &sourceTitle, &feedExcerpt, &summary, &coreInsight, &extractedText, &provenance); err != nil {
			t.Fatalf("scan search_fts snapshot: %v", err)
		}
		parts = append(parts, strings.Join([]string{itemID, title, sourceTitle, feedExcerpt, summary, coreInsight, extractedText, provenance}, "\x1f"))
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate search_fts snapshot: %v", err)
	}
	return strings.Join(parts, "\x1e")
}
