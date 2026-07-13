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
	for _, token := range []string{"", "plain-id", "~", "~a===", "~***", "~ww", "~wyg"} {
		if got, ok := decodeItemRouteToken(token); ok {
			t.Errorf("decodeItemRouteToken(%q) = %q, true; want rejection", token, got)
		}
	}
}
