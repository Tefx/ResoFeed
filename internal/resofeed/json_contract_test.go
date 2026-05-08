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
	for _, key := range []string{"summary", "core_insight", "human_inspected_at", "external_surfaced_at", "story_key", "duplicate_of_item_id"} {
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
			SourceURL:   "https://example.com/feed.xml",
			OriginalURL: "https://example.com/article",
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
