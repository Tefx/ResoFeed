package resofeed

import (
	"encoding/json"
	"testing"
	"time"
)

func TestItemSummaryJSONExcludesDetailOnlyFields(t *testing.T) {
	t.Parallel()

	publishedAt := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	summary := ItemSummary{
		ID:                 "item_01",
		SourceID:           "src_01",
		SourceTitle:        "Example",
		URL:                "https://example.com/article",
		Title:              "Example article",
		PublishedAt:        &publishedAt,
		ExtractionStatus:   "full",
		ModelStatus:        "ok",
		HumanInspectedAt:   nil,
		ExternalSurfacedAt: nil,
		StoryKey:           nil,
		DuplicateOfItemID:  nil,
	}

	data, err := json.Marshal(summary)
	if err != nil {
		t.Fatalf("marshal ItemSummary: %v", err)
	}
	fields := decodeObject(t, data)

	for _, key := range []string{"feed_excerpt", "extracted_text", "provenance"} {
		if _, ok := fields[key]; ok {
			t.Fatalf("ItemSummary JSON includes detail-only key %q: %s", key, data)
		}
	}
	for _, key := range []string{"summary", "core_insight", "value_tier", "human_inspected_at", "external_surfaced_at", "story_key", "duplicate_of_item_id"} {
		assertPresentNull(t, fields, key)
	}
}

func TestItemDetailJSONIncludesRequiredNullableDetailFields(t *testing.T) {
	t.Parallel()

	detail := ItemDetail{
		ID:               "item_01",
		SourceID:         "src_01",
		SourceTitle:      "Example",
		URL:              "https://example.com/article",
		Title:            "Example article",
		ExtractionStatus: "partial_extraction",
		ModelStatus:      "summary_unavailable",
		FeedExcerpt:      nil,
		ExtractedText:    nil,
		Provenance: Provenance{
			SourceURL:          "https://example.com/feed.xml",
			OriginalURL:        "https://example.com/article",
			GroupedSourceItems: []GroupedSourceItem{},
		},
	}

	data, err := json.Marshal(detail)
	if err != nil {
		t.Fatalf("marshal ItemDetail: %v", err)
	}
	fields := decodeObject(t, data)

	for _, key := range []string{"feed_excerpt", "extracted_text"} {
		assertPresentNull(t, fields, key)
	}
	provenanceRaw, ok := fields["provenance"]
	if !ok {
		t.Fatalf("ItemDetail JSON omitted required provenance key: %s", data)
	}
	if string(provenanceRaw) == "null" {
		t.Fatalf("ItemDetail JSON provenance = null, want object: %s", data)
	}

	provenance := decodeRawObject(t, provenanceRaw)
	for _, key := range []string{"canonical_url", "story_key", "duplicate_of_item_id"} {
		assertPresentNull(t, provenance, key)
	}
	assertPresentString(t, provenance, "source_url", "https://example.com/feed.xml")
	assertPresentString(t, provenance, "original_url", "https://example.com/article")
	if value, ok := provenance["grouped_source_items"]; !ok || string(value) != "[]" {
		t.Fatalf("ItemDetail JSON provenance grouped_source_items = %s, want []", value)
	}
}

func TestSteerContractJSONShapesPinPreviewReceiptAndUndo(t *testing.T) {
	t.Parallel()

	preview := SteerPreview{
		RouteKind:          SteerRouteSearch,
		InterpretedAs:      "search",
		ChangedRules:       []SteerRule{},
		Message:            "search: 0 results for \"sqlite\"",
		LexicalSearchQuery: nil,
		UndoHandle:         nil,
		WillMutate:         false,
	}
	previewData, err := json.Marshal(preview)
	if err != nil {
		t.Fatalf("marshal SteerPreview: %v", err)
	}
	previewFields := decodeObject(t, previewData)
	for _, key := range []string{"route_kind", "interpreted_as", "changed_rules", "message", "lexical_search_query", "undo_handle", "will_mutate"} {
		if _, ok := previewFields[key]; !ok {
			t.Fatalf("SteerPreview JSON omitted key %q: %s", key, previewData)
		}
	}
	assertPresentNull(t, previewFields, "lexical_search_query")
	assertPresentNull(t, previewFields, "undo_handle")

	receipt := SteeringReceipt{InterpretedAs: "invariant_conflict", ChangedRules: []SteerRule{}, Message: "not fully applied"}
	receiptData, err := json.Marshal(receipt)
	if err != nil {
		t.Fatalf("marshal SteeringReceipt: %v", err)
	}
	receiptFields := decodeObject(t, receiptData)
	for _, key := range []string{"interpreted_as", "changed_rules", "message"} {
		if _, ok := receiptFields[key]; !ok {
			t.Fatalf("SteeringReceipt JSON omitted key %q: %s", key, receiptData)
		}
	}
	if _, ok := receiptFields["undo_handle"]; ok {
		t.Fatalf("SteeringReceipt JSON includes undo_handle; undo is a separate target-specific contract: %s", receiptData)
	}

	revision := int64(3)
	undo := SteerUndoResult{
		RouteKind:      SteerRouteSource,
		Target:         &SteerTarget{Kind: "source", ID: "src_01"},
		Undone:         true,
		RestoredRule:   nil,
		RestoredSource: nil,
		Message:        "source restored",
		AlreadyApplied: false,
	}
	undoHandle := SteerUndoHandle{RouteKind: SteerRouteSource, Target: &SteerTarget{Kind: "source", ID: "src_01"}, Revision: &revision}
	undoData, err := json.Marshal(struct {
		Undo       SteerUndoResult `json:"undo"`
		UndoHandle SteerUndoHandle `json:"undo_handle"`
	}{Undo: undo, UndoHandle: undoHandle})
	if err != nil {
		t.Fatalf("marshal SteerUndo contracts: %v", err)
	}
	envelope := decodeObject(t, undoData)
	undoFields := decodeRawObject(t, envelope["undo"])
	for _, key := range []string{"route_kind", "target", "undone", "restored_rule", "restored_source", "message", "already_applied"} {
		if _, ok := undoFields[key]; !ok {
			t.Fatalf("SteerUndoResult JSON omitted key %q: %s", key, undoData)
		}
	}
	assertPresentNull(t, undoFields, "restored_rule")
	assertPresentNull(t, undoFields, "restored_source")
}

func TestClassifySteerRoutePinsLexicalAliasesAndInvariantConflicts(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		command string
		want    SteerRouteKind
	}{
		{command: "/doctor", want: SteerRouteDoctor},
		{command: "search sqlite", want: SteerRouteSearch},
		{command: "https://example.com/feed.xml", want: SteerRouteSource},
		{command: "hide all fresh items", want: SteerRouteInvariantConflict},
		{command: "push more technical documents", want: SteerRoutePolicy},
	} {
		if got := ClassifySteerRoute(tc.command); got != tc.want {
			t.Fatalf("ClassifySteerRoute(%q) = %q, want %q", tc.command, got, tc.want)
		}
	}
}

func decodeObject(t *testing.T, data []byte) map[string]json.RawMessage {
	t.Helper()

	return decodeRawObject(t, data)
}

func decodeRawObject(t *testing.T, data json.RawMessage) map[string]json.RawMessage {
	t.Helper()

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		t.Fatalf("unmarshal JSON object %s: %v", data, err)
	}
	return fields
}

func assertPresentNull(t *testing.T, fields map[string]json.RawMessage, key string) {
	t.Helper()

	value, ok := fields[key]
	if !ok {
		t.Fatalf("JSON key %q omitted", key)
	}
	if string(value) != "null" {
		t.Fatalf("JSON key %q = %s, want null", key, value)
	}
}

func assertPresentString(t *testing.T, fields map[string]json.RawMessage, key string, want string) {
	t.Helper()

	value, ok := fields[key]
	if !ok {
		t.Fatalf("JSON key %q omitted", key)
	}
	var got string
	if err := json.Unmarshal(value, &got); err != nil {
		t.Fatalf("JSON key %q is not a string: %v", key, err)
	}
	if got != want {
		t.Fatalf("JSON key %q = %q, want %q", key, got, want)
	}
}
