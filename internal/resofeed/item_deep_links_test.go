package resofeed

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestItemDeepLinkApplicationPathAndPublicURL(t *testing.T) {
	paths := map[string]string{
		"item_01":            "/items/item_01",
		".":                  "/items/!.",
		"..":                 "/items/!..",
		"!.":                 "/items/%21.",
		"~legacy":            "/items/%7Elegacy",
		"slash/%?hash#雪":     "/items/slash%2F%25%3Fhash%23%E9%9B%AA",
		"decomposed-e\u0301": "/items/decomposed-e%CC%81",
	}
	for itemID, want := range paths {
		got, err := itemAppPath(itemID)
		if err != nil || got != want {
			t.Errorf("itemAppPath(%q) = %q, %v; want %q", itemID, got, err, want)
		}
	}
	for _, itemID := range []string{"", "control\x00"} {
		if _, err := itemAppPath(itemID); err == nil {
			t.Errorf("itemAppPath(%q) succeeded; want rejection", itemID)
		}
	}

	for raw, want := range map[string]string{
		"HTTPS://Example.COM:00443/": "https://example.com",
		"http://localhost:08080/":    "http://localhost:8080",
		"http://[2001:0DB8::1]:80/":  "http://[2001:db8::1]",
	} {
		got, err := normalizeAndValidatePublicURL(raw)
		if err != nil || got != want {
			t.Errorf("normalizeAndValidatePublicURL(%q) = %q, %v; want %q", raw, got, err, want)
		}
	}
	for addr, want := range map[string]string{
		"Example.COM:08080":    "http://example.com:8080",
		"0.0.0.0:8080":         "http://127.0.0.1:8080",
		"[2001:0DB8::1]:00443": "http://[2001:db8::1]:443",
		"[::]:8080":            "http://[::1]:8080",
	} {
		got, err := derivePublicURL(addr)
		if err != nil || got != want {
			t.Errorf("derivePublicURL(%q) = %q, %v; want %q", addr, got, err, want)
		}
	}
}

func TestItemDeepLinkReadResultAndMCPProjection(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSource(t, ctx, db, "src_deep_link_unit", "https://example.test/feed.xml", "Deep Links")
	for _, row := range []struct {
		id          string
		duplicateOf any
	}{
		{id: "authority", duplicateOf: nil},
		{id: "duplicate", duplicateOf: "authority"},
		{id: "broken", duplicateOf: "missing"},
	} {
		_, err := db.ExecContext(ctx, `insert into items (id, source_id, url, title, first_seen_at, extraction_status, model_status, duplicate_of_item_id) values (?, 'src_deep_link_unit', ?, ?, '2026-07-26T00:00:00Z', 'full', 'ok', ?)`, row.id, "https://example.test/"+row.id, row.id, row.duplicateOf)
		if err != nil {
			t.Fatalf("insert %s: %v", row.id, err)
		}
	}

	resolved, err := ReadItemResult(ctx, db, "duplicate")
	if err != nil {
		t.Fatalf("ReadItemResult duplicate: %v", err)
	}
	if resolved.Item.ID != "authority" || resolved.ResolvedFromItemID == nil || *resolved.ResolvedFromItemID != "duplicate" || resolved.DuplicateTargetAvailable == nil || !*resolved.DuplicateTargetAvailable {
		t.Fatalf("resolved duplicate = %+v", resolved)
	}
	broken, err := ReadItemResult(ctx, db, "broken")
	if err != nil {
		t.Fatalf("ReadItemResult broken: %v", err)
	}
	if broken.Item.ID != "broken" || broken.ResolvedFromItemID != nil || broken.DuplicateTargetItemID == nil || *broken.DuplicateTargetItemID != "missing" || broken.DuplicateTargetAvailable == nil || *broken.DuplicateTargetAvailable {
		t.Fatalf("broken duplicate = %+v", broken)
	}

	projected, err := projectMCPItem(resolved, "https://resofeed.example.test")
	if err != nil {
		t.Fatalf("project MCP item: %v", err)
	}
	body, err := json.Marshal(projected)
	if err != nil {
		t.Fatalf("marshal MCP projection: %v", err)
	}
	if !strings.Contains(string(body), `"app_url":"https://resofeed.example.test/items/authority"`) {
		t.Fatalf("MCP projection = %s", body)
	}
}
