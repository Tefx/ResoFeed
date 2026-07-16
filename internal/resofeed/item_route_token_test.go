package resofeed

import (
	"encoding/base64"
	"testing"
)

func TestItemRouteTokenRoundTrip(t *testing.T) {
	itemIDs := []string{
		"item/segment",
		"item%percent",
		"项目/百分号%",
		"item?query#fragment",
		"item+plus space",
		"~already-token-like_-.",
	}
	for _, itemID := range itemIDs {
		token := "~" + base64.RawURLEncoding.EncodeToString([]byte(itemID))
		got, ok := decodeItemRouteToken(token)
		if !ok || got != itemID {
			t.Fatalf("decodeItemRouteToken(%q) = %q, %v; want %q, true", token, got, ok, itemID)
		}
	}
}

func TestItemRouteTokenRejectsNonCanonicalInput(t *testing.T) {
	tokens := []struct {
		name  string
		token string
	}{
		{name: "empty", token: ""},
		{name: "raw item ID", token: "plain-id"},
		{name: "empty payload", token: "~"},
		{name: "padded", token: "~aXRlbQ=="},
		{name: "malformed", token: "~***"},
		{name: "invalid UTF-8", token: "~_w"},
		{name: "truncated UTF-8", token: "~ww"},
		{name: "noncanonical trailing", token: "~wyg"},
	}
	for _, tc := range tokens {
		t.Run(tc.name, func(t *testing.T) {
			if got, ok := decodeItemRouteToken(tc.token); ok {
				t.Errorf("decodeItemRouteToken(%q) = %q, true; want rejection", tc.token, got)
			}
		})
	}
}
