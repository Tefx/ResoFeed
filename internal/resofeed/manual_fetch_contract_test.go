package resofeed

import (
	"encoding/json"
	"testing"
)

func TestManualFetchContractPinsEndpointsAndRequestShape(t *testing.T) {
	t.Parallel()

	if ManualIngestHTTPPath != "/api/ingest" {
		t.Fatalf("ManualIngestHTTPPath = %q, want /api/ingest", ManualIngestHTTPPath)
	}
	if ManualSourceFetchHTTPPathPattern != "/api/sources/{id}/fetch" {
		t.Fatalf("ManualSourceFetchHTTPPathPattern = %q, want /api/sources/{id}/fetch", ManualSourceFetchHTTPPathPattern)
	}

	body, err := json.Marshal(ManualFetchRequest{})
	if err != nil {
		t.Fatalf("marshal ManualFetchRequest: %v", err)
	}
	if string(body) != ManualFetchRequestBody {
		t.Fatalf("ManualFetchRequest marshals to %s, want %s", body, ManualFetchRequestBody)
	}
}

func TestManualFetchContractPinsStatusAndResponseSchemas(t *testing.T) {
	t.Parallel()

	if ManualFetchHTTPStatusOK != 200 || ManualFetchHTTPStatusUnauthorized != 401 || ManualFetchHTTPStatusBadRequest != 400 || ManualFetchHTTPStatusNotFound != 404 || ManualFetchHTTPStatusConflict != 409 || ManualFetchHTTPStatusInternal != 500 {
		t.Fatalf("manual fetch status constants changed")
	}
	if ManualFetchErrorCodeConflict != "conflict" {
		t.Fatalf("ManualFetchErrorCodeConflict = %q, want conflict", ManualFetchErrorCodeConflict)
	}

	assertMarshaledJSON(t, ManualFetchResult{
		Operation:       ManualFetchOperationIngest,
		Completed:       true,
		SourcesTotal:    0,
		SourcesFetched:  0,
		ItemsDiscovered: 0,
		ItemsUpserted:   0,
		Errors:          []ManualFetchSourceError{},
	}, `{"operation":"ingest","source_id":null,"completed":true,"sources_total":0,"sources_fetched":0,"items_discovered":0,"items_upserted":0,"errors":[]}`)

	sourceID := "src_01"
	assertMarshaledJSON(t, ManualFetchResult{
		Operation:       ManualFetchOperationSourceFetch,
		SourceID:        &sourceID,
		Completed:       true,
		SourcesTotal:    1,
		SourcesFetched:  0,
		ItemsDiscovered: 0,
		ItemsUpserted:   0,
		Errors: []ManualFetchSourceError{{
			SourceID: sourceID,
			Code:     "rss_fetch_error",
			Message:  "source fetch failed",
		}},
	}, `{"operation":"source_fetch","source_id":"src_01","completed":true,"sources_total":1,"sources_fetched":0,"items_discovered":0,"items_upserted":0,"errors":[{"source_id":"src_01","code":"rss_fetch_error","message":"source fetch failed"}]}`)
}

func TestManualFetchContractPinsForbiddenArchitectureExpansions(t *testing.T) {
	t.Parallel()

	want := map[string]bool{
		"durable queue":    false,
		"job table":        false,
		"receipt ledger":   false,
		"sync coordinator": false,
		"service layer":    false,
		"repository layer": false,
		"DI container":     false,
		"event bus":        false,
	}
	for _, expansion := range ManualFetchForbiddenExpansions {
		if _, ok := want[expansion]; ok {
			want[expansion] = true
		}
	}
	for expansion, seen := range want {
		if !seen {
			t.Fatalf("ManualFetchForbiddenExpansions missing %q", expansion)
		}
	}
}
