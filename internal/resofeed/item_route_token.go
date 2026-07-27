package resofeed

import (
	"encoding/base64"
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"
)

func decodeItemRouteToken(token string) (string, bool) {
	if !strings.HasPrefix(token, "~") || len(token) == 1 {
		return "", false
	}
	payload := token[1:]
	decoded, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil || !validItemRouteID(string(decoded)) {
		return "", false
	}
	itemID := string(decoded)
	if "~"+base64.RawURLEncoding.EncodeToString(decoded) != token {
		return "", false
	}
	return itemID, true
}

func itemAppPath(itemID string) (string, error) {
	if !validItemRouteID(itemID) {
		return "", errors.New("item application path: invalid item id")
	}
	if itemID == "." {
		return "/items/!.", nil
	}
	if itemID == ".." {
		return "/items/!..", nil
	}

	const hexadecimal = "0123456789ABCDEF"
	var segment strings.Builder
	for index, value := range []byte(itemID) {
		unreserved := value >= 'A' && value <= 'Z' || value >= 'a' && value <= 'z' || value >= '0' && value <= '9' || value == '-' || value == '.' || value == '_' || value == '~'
		if unreserved && !(index == 0 && (value == '!' || value == '~')) {
			segment.WriteByte(value)
			continue
		}
		segment.WriteByte('%')
		segment.WriteByte(hexadecimal[value>>4])
		segment.WriteByte(hexadecimal[value&0x0f])
	}
	return "/items/" + segment.String(), nil
}

func validItemRouteID(itemID string) bool {
	if itemID == "" || !utf8.ValidString(itemID) {
		return false
	}
	for _, value := range itemID {
		if unicode.Is(unicode.Cc, value) {
			return false
		}
	}
	return true
}
