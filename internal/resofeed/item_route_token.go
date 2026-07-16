package resofeed

import (
	"encoding/base64"
	"strings"
	"unicode/utf8"
)

func decodeItemRouteToken(token string) (string, bool) {
	if !strings.HasPrefix(token, "~") || len(token) == 1 {
		return "", false
	}
	payload := token[1:]
	decoded, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil || !utf8.Valid(decoded) {
		return "", false
	}
	itemID := string(decoded)
	if "~"+base64.RawURLEncoding.EncodeToString(decoded) != token {
		return "", false
	}
	return itemID, true
}
