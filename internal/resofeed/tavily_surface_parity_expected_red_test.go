package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestTavilyDoctorMandatoryLinesAndNoSecretLeakExpectedRed(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSource(t, ctx, db, "src_tavily_doctor", "https://doctor-tavily.example.test/feed.xml", "Doctor Tavily Source")
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, summary, core_insight, feed_excerpt, extracted_text, first_seen_at, extraction_status, model_status) values (?, ?, ?, ?, ?, ?, null, null, null, null, ?, 'original_unavailable', 'summary_unavailable')`,
		"item_tavily_recoverable_doctor",
		"src_tavily_doctor",
		"https://doctor-tavily.example.test/feed.xml",
		"https://public-article.example.test/recoverable",
		"https://public-article.example.test/canonical-recoverable",
		"Recoverable Tavily Doctor Candidate",
		now,
	); err != nil {
		t.Fatalf("seed recoverable Tavily doctor candidate: %v", err)
	}

	const fakeTavilySecret = "tavily-doctor-test-secret-do-not-print"
	t.Setenv("TAVILY_API_KEY", fakeTavilySecret)

	var body bytes.Buffer
	if err := WriteDoctor(ctx, db, &body); err != nil {
		t.Fatalf("WriteDoctor with Tavily configured: %v", err)
	}
	text := body.String()
	for _, want := range []string{
		"tavily: configured=present",
		"tavily: recovered_items=0",
		"tavily: recoverable_unavailable=1",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("doctor missing mandatory Tavily line %q; body=\n%s", want, text)
		}
	}
	for _, forbidden := range []string{
		fakeTavilySecret,
		"TAVILY_API_KEY",
		"Authorization:",
		"Bearer ",
		"api.tavily.com",
		"provider_reachable",
		"provider tester",
		".env",
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("doctor leaked Tavily secret/config/probe detail %q; body=\n%s", forbidden, text)
		}
	}
}

func TestTavilyHTTPMCPSchemaParityExpectedRed(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedTavilySurfaceParityCorpus(t, ctx, db)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})
	mcpHandler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken})

	t.Run("HTTP feed and search summaries expose extraction_source only", func(t *testing.T) {
		feed := tavilyHTTPJSONMap(t, router, http.MethodGet, "/api/feed/today?limit=10")
		feedItem := tavilyFirstItem(t, feed, "items", "item_tavily_surface_parity")
		assertTavilyExtractionSourceField(t, feedItem, "HTTP feed item summary")
		assertTavilySummaryOmitsSourceEvidenceText(t, feedItem, "HTTP feed item summary")

		search := tavilyHTTPJSONMap(t, router, http.MethodGet, "/api/search?q=TavilySurfaceParity&limit=10")
		searchItem := tavilyFirstItem(t, search, "items", "item_tavily_surface_parity")
		assertTavilyExtractionSourceField(t, searchItem, "HTTP search item summary")
		assertTavilySummaryOmitsSourceEvidenceText(t, searchItem, "HTTP search item summary")
	})

	t.Run("HTTP item detail exposes extraction_source and nullable source_evidence_text", func(t *testing.T) {
		detail := tavilyHTTPJSONMap(t, router, http.MethodGet, "/api/items/item_tavily_surface_parity")
		item := tavilyObjectField(t, detail, "item", "HTTP item detail")
		assertTavilyExtractionSourceField(t, item, "HTTP item detail")
		assertTavilyNullableSourceEvidenceTextField(t, item, "HTTP item detail")
	})

	t.Run("MCP candidate/search summaries and read_item match HTTP item schema", func(t *testing.T) {
		candidateText := mcpToolText(t, mcpCall(t, mcpHandler, "list_candidate_items", map[string]any{"limit": 10}), "list_candidate_items")
		candidate := tavilyJSONTextMap(t, candidateText, "MCP list_candidate_items")
		candidateItem := tavilyFirstItem(t, candidate, "items", "item_tavily_surface_parity")
		assertTavilyExtractionSourceField(t, candidateItem, "MCP candidate item summary")
		assertTavilySummaryOmitsSourceEvidenceText(t, candidateItem, "MCP candidate item summary")

		searchText := mcpToolText(t, mcpCall(t, mcpHandler, "search_items", map[string]any{"query": "TavilySurfaceParity", "limit": 10}), "search_items")
		search := tavilyJSONTextMap(t, searchText, "MCP search_items")
		searchItem := tavilyFirstItem(t, search, "items", "item_tavily_surface_parity")
		assertTavilyExtractionSourceField(t, searchItem, "MCP search item summary")
		assertTavilySummaryOmitsSourceEvidenceText(t, searchItem, "MCP search item summary")

		readText := mcpToolText(t, mcpCall(t, mcpHandler, "read_item", map[string]any{"item_id": "item_tavily_surface_parity"}), "read_item")
		read := tavilyJSONTextMap(t, readText, "MCP read_item")
		readItem := tavilyObjectField(t, read, "item", "MCP read_item detail")
		assertTavilyExtractionSourceField(t, readItem, "MCP read_item detail")
		assertTavilyNullableSourceEvidenceTextField(t, readItem, "MCP read_item detail")
	})

	t.Run("MCP feed resource reuses the same summary schema", func(t *testing.T) {
		resource := tavilyJSONTextMap(t, mcpResourceText(t, mcpHandler, "resofeed://feed/today"), "MCP feed resource")
		resourceItem := tavilyFirstItem(t, resource, "items", "item_tavily_surface_parity")
		assertTavilyExtractionSourceField(t, resourceItem, "MCP feed resource item summary")
		assertTavilySummaryOmitsSourceEvidenceText(t, resourceItem, "MCP feed resource item summary")
	})
}

func seedTavilySurfaceParityCorpus(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	now := time.Now().UTC().Format(time.RFC3339)
	seedSource(t, ctx, db, "src_tavily_surface_parity", "https://tavily-surface.example.test/feed.xml", "Tavily Surface Source")
	if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, canonical_url, title, source_item_title, localized_title, summary, core_insight, value_tier, feed_excerpt, extracted_text, published_at, first_seen_at, extraction_status, model_status, content_status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'full', 'ok', 'ok')`,
		"item_tavily_surface_parity",
		"src_tavily_surface_parity",
		"https://tavily-surface.example.test/feed.xml",
		"https://tavily-surface.example.test/article",
		"https://tavily-surface.example.test/article",
		"TavilySurfaceParity item",
		"Original TavilySurfaceParity item",
		"TavilySurfaceParity 本地化条目",
		"TavilySurfaceParity summary for schema parity.",
		"TavilySurfaceParity core insight for schema parity.",
		"high",
		"TavilySurfaceParity RSS excerpt remains display fallback, not detail source_evidence_text.",
		"TavilySurfaceParity local extracted text predates source_evidence_text migration.",
		now,
		now,
	); err != nil {
		t.Fatalf("insert Tavily surface parity item: %v", err)
	}
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild Tavily surface parity search index: %v", err)
	}
}

func tavilyHTTPJSONMap(t *testing.T, router http.Handler, method string, path string) map[string]any {
	t.Helper()
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, authorizedRequest(method, path, nil))
	assertStatus(t, recorder, http.StatusOK)
	return tavilyJSONBytesMap(t, recorder.Body.Bytes(), "HTTP "+path)
}

func tavilyJSONTextMap(t *testing.T, text string, label string) map[string]any {
	t.Helper()
	return tavilyJSONBytesMap(t, []byte(text), label)
}

func tavilyJSONBytesMap(t *testing.T, data []byte, label string) map[string]any {
	t.Helper()
	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal %s JSON: %v; body=%s", label, err, data)
	}
	return parsed
}

func tavilyFirstItem(t *testing.T, envelope map[string]any, field string, itemID string) map[string]any {
	t.Helper()
	rawItems, ok := envelope[field].([]any)
	if !ok {
		t.Fatalf("response missing %q array; response=%s", field, tavilyPrettyJSON(envelope))
	}
	for _, raw := range rawItems {
		item, ok := raw.(map[string]any)
		if !ok {
			t.Fatalf("%q contained non-object item %#v", field, raw)
		}
		if item["id"] == itemID {
			return item
		}
	}
	t.Fatalf("%q missing item %q; response=%s", field, itemID, tavilyPrettyJSON(envelope))
	return nil
}

func tavilyObjectField(t *testing.T, envelope map[string]any, field string, label string) map[string]any {
	t.Helper()
	object, ok := envelope[field].(map[string]any)
	if !ok {
		t.Fatalf("%s missing object field %q; response=%s", label, field, tavilyPrettyJSON(envelope))
	}
	return object
}

func assertTavilyExtractionSourceField(t *testing.T, item map[string]any, label string) {
	t.Helper()
	raw, ok := item["extraction_source"]
	if !ok {
		t.Fatalf("%s missing required extraction_source; item=%s", label, tavilyPrettyJSON(item))
	}
	source, ok := raw.(string)
	if !ok {
		t.Fatalf("%s extraction_source = %#v, want string enum", label, raw)
	}
	switch source {
	case "local_readable", "feed_excerpt", "external_tavily", "none":
		return
	default:
		t.Fatalf("%s extraction_source = %q, want local_readable|feed_excerpt|external_tavily|none", label, source)
	}
}

func assertTavilyNullableSourceEvidenceTextField(t *testing.T, item map[string]any, label string) {
	t.Helper()
	raw, ok := item["source_evidence_text"]
	if !ok {
		t.Fatalf("%s missing required nullable detail field source_evidence_text; item=%s", label, tavilyPrettyJSON(item))
	}
	if raw == nil {
		return
	}
	if _, ok := raw.(string); !ok {
		t.Fatalf("%s source_evidence_text = %#v, want string or null", label, raw)
	}
}

func assertTavilySummaryOmitsSourceEvidenceText(t *testing.T, item map[string]any, label string) {
	t.Helper()
	if _, ok := item["source_evidence_text"]; ok {
		t.Fatalf("%s exposed detail-only source_evidence_text; item=%s", label, tavilyPrettyJSON(item))
	}
}

func tavilyPrettyJSON(value any) string {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Sprintf("%#v", value)
	}
	return string(data)
}
