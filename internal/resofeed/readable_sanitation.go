package resofeed

import (
	"bytes"
	"mime"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const contaminatedInsightFallback = "insight unavailable (fallback: source payload contaminated)"

var (
	readableTailMarkerPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)^\s*more\s+from\s+the\s+verge\b`),
		regexp.MustCompile(`(?i)^\s*more\s+from\b`),
		regexp.MustCompile(`(?i)^\s*related\s+(stories|articles|posts)\b`),
		regexp.MustCompile(`(?i)^\s*you\s+might\s+also\s+like\b`),
		regexp.MustCompile(`(?i)^\s*read\s+next\b`),
	}
	readableDropLinePatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)follow\s+(topics|authors?)`),
		regexp.MustCompile(`(?i)authors?\s+from\s+this\s+story`),
		regexp.MustCompile(`(?i)personaliz(e|ed|ation)|personalized\s+feed`),
		regexp.MustCompile(`(?i)sign\s+up\s+for|newsletter|cookie\s+policy|privacy\s+policy|terms\s+of\s+use`),
		regexp.MustCompile(`(?i)^(transportation|news|tech|science|entertainment|gaming|reviews|features)(\s+(news|tech|science|entertainment|gaming|reviews|features)){1,}\b`),
		regexp.MustCompile(`(?i)\b(leaked|cracked)\b.*\b(phone|item|fragment|copy|tail)\b`),
		regexp.MustCompile(`(?i)^\s*share\s+this\s+page\s*$`),
		regexp.MustCompile(`(?i)^\s*enter\s+url\s+or\s+id\s+to\s+unroll\b`),
		regexp.MustCompile(`(?i)^\s*how\s+to\s+get\s+url\s+link\s+on\s+x\b`),
		regexp.MustCompile(`(?i)^\s*missing\s+some\s+tweet\s+in\s+this\s+thread\?\s*$`),
		regexp.MustCompile(`(?i)^\s*keep\s+current\s+with\b`),
		regexp.MustCompile(`(?i)^\s*this\s+thread\s+may\s+be\s+removed\s+anytime\b`),
		regexp.MustCompile(`(?i)^\s*support\s+us\s*$`),
		regexp.MustCompile(`(?i)^\s*become\s+a\s+premium\s+member\b`),
		regexp.MustCompile(`(?i)^\s*donate\s+via\s+paypal\b`),
		regexp.MustCompile(`(?i)^\s*(bitcoin|ethereum|usdt|crypto)\s+(donation\s+)?(address|copy)\b`),
		regexp.MustCompile(`(?i)^\s*(copy\s+)?(bc1|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|0x[0-9a-f]{40})\b`),
	}
	readableContaminationPatterns = append(append([]*regexp.Regexp{}, readableTailMarkerPatterns...), readableDropLinePatterns...)
	inlineSocialPromptRE          = regexp.MustCompile(`(?i)\bfollow\s+us\s+on\s+(twitter|x)\s+for\s+more\s+newsletters?\b`)
	repeatedDirtyLeadRE           = regexp.MustCompile(`(?i)\bsummary-like\s+lead\s+repeated\s+by\s+the\s+site\s+summary-like\s+lead\s+repeated\s+by\s+the\s+site\b`)
	pdfPayloadLeadRE              = regexp.MustCompile(`(?i)^%pdf-\d`)
)

func isUnusableReadablePayload(value string) bool {
	words := strings.Fields(strings.ToLower(strings.ReplaceAll(value, "\u00a0", " ")))
	if len(words) == 0 || len(words) > 140 {
		return false
	}
	normalized := strings.Join(words, " ")
	markers := 0
	for _, marker := range []string{
		"javascript is not available",
		"please enable javascript",
		"continue using x. com",
		"continue using x.com",
		"supported browser",
		"help center",
		"© x corp",
		"x corp",
	} {
		if strings.Contains(normalized, marker) {
			markers++
		}
	}
	return markers >= 2 || strings.Contains(normalized, "javascript is not available") && strings.Contains(normalized, "continue using x")
}

func isReadableTextContentType(contentType string) bool {
	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		return true
	}
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	}
	switch strings.ToLower(mediaType) {
	case "text/html", "text/plain", "application/xhtml+xml", "application/xml", "text/xml", "application/rss+xml", "application/atom+xml":
		return true
	default:
		return false
	}
}

func looksLikeBinaryReadablePayload(body []byte) bool {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return false
	}
	if bytes.HasPrefix(bytes.ToLower(trimmed), []byte("%pdf-")) {
		return true
	}
	sample := trimmed
	if len(sample) > 2048 {
		sample = sample[:2048]
	}
	if bytes.IndexByte(sample, 0) >= 0 {
		return true
	}
	if !utf8.Valid(sample) {
		return true
	}
	controlCount := 0
	for _, r := range string(sample) {
		if unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t' {
			controlCount++
		}
	}
	return controlCount > 0 && controlCount*12 > utf8.RuneCount(sample)
}

func sanitizeReadablePayloadText(value string) (string, bool) {
	original := value
	value = normalizeLiteralReadableLineBreaks(value)
	value = strings.TrimSpace(value)
	if value == "" {
		return "", strings.TrimSpace(original) != ""
	}
	if pdfPayloadLeadRE.MatchString(value) || strings.ContainsRune(value, '\uFFFD') {
		return "", true
	}
	if isUnusableReadablePayload(value) {
		return "", true
	}
	paragraphs := splitReadableParagraphs(value)
	kept := make([]string, 0, len(paragraphs))
	contaminated := false
	for _, paragraph := range paragraphs {
		paragraph = cleanInlineReadableBoilerplate(strings.TrimSpace(paragraph))
		if paragraph == "" {
			continue
		}
		if matchesAny(readableTailMarkerPatterns, paragraph) {
			contaminated = true
			break
		}
		if matchesAny(readableDropLinePatterns, paragraph) {
			contaminated = true
			continue
		}
		kept = append(kept, paragraph)
	}
	cleaned := strings.TrimSpace(strings.Join(kept, "\n\n"))
	return cleaned, contaminated || cleaned != original
}

func normalizeLiteralReadableLineBreaks(value string) string {
	value = strings.ReplaceAll(value, `\r\n`, "\n")
	value = strings.ReplaceAll(value, `\n`, "\n")
	value = strings.ReplaceAll(value, `\r`, "\n")
	return value
}

func cleanInlineReadableBoilerplate(value string) string {
	value = inlineSocialPromptRE.ReplaceAllString(value, " ")
	value = repeatedDirtyLeadRE.ReplaceAllString(value, " ")
	return strings.TrimSpace(regexp.MustCompile(`\s+`).ReplaceAllString(value, " "))
}

func sanitizeReadablePayloadPointer(value *string) (*string, bool) {
	if value == nil {
		return nil, false
	}
	cleaned, changed := sanitizeReadablePayloadText(*value)
	if strings.TrimSpace(cleaned) == "" {
		return nil, changed || strings.TrimSpace(*value) != ""
	}
	return &cleaned, changed
}

func sanitizeReadableInsightPointer(value *string) (*string, bool) {
	if value != nil {
		original := strings.TrimSpace(*value)
		if original != "" && (isCategoryHeadlineResidue(original) || matchesAny(readableContaminationPatterns, original)) {
			fallback := contaminatedInsightFallback
			return &fallback, true
		}
	}
	cleaned, changed := sanitizeReadablePayloadPointer(value)
	if cleaned == nil {
		return nil, changed
	}
	if isCategoryHeadlineResidue(*cleaned) || matchesAny(readableContaminationPatterns, *cleaned) {
		fallback := contaminatedInsightFallback
		return &fallback, true
	}
	return cleaned, changed
}

func sanitizeReadableItem(item *Item) {
	if item == nil {
		return
	}
	item.FeedExcerpt, _ = sanitizeReadablePayloadPointer(item.FeedExcerpt)
	item.ExtractedText, _ = sanitizeReadablePayloadPointer(item.ExtractedText)
	item.Summary, _ = sanitizeReadablePayloadPointer(item.Summary)
	item.CoreInsight, _ = sanitizeReadableInsightPointer(item.CoreInsight)
}

func sanitizeReadableDetail(detail *ItemDetail) {
	if detail == nil {
		return
	}
	detail.FeedExcerpt, _ = sanitizeReadablePayloadPointer(detail.FeedExcerpt)
	detail.ExtractedText, _ = sanitizeReadablePayloadPointer(detail.ExtractedText)
	detail.Summary, _ = sanitizeReadablePayloadPointer(detail.Summary)
	detail.CoreInsight, _ = sanitizeReadableInsightPointer(detail.CoreInsight)
}

func sanitizeReadableSummary(summary *ItemSummary) {
	if summary == nil {
		return
	}
	summary.Summary, _ = sanitizeReadablePayloadPointer(summary.Summary)
	summary.CoreInsight, _ = sanitizeReadableInsightPointer(summary.CoreInsight)
	summary.DisplayExcerpt, _ = sanitizeReadablePayloadPointer(summary.DisplayExcerpt)
}

func splitReadableParagraphs(value string) []string {
	lines := strings.Split(strings.ReplaceAll(value, "\r\n", "\n"), "\n")
	paragraphs := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		paragraphs = append(paragraphs, line)
	}
	return paragraphs
}

func matchesAny(patterns []*regexp.Regexp, value string) bool {
	for _, pattern := range patterns {
		if pattern.MatchString(value) {
			return true
		}
	}
	return false
}

func isCategoryHeadlineResidue(value string) bool {
	words := strings.FieldsFunc(strings.ToLower(value), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
	if len(words) < 3 || len(words) > 8 {
		return false
	}
	categories := map[string]bool{
		"transportation": true,
		"news":           true,
		"tech":           true,
		"science":        true,
		"entertainment":  true,
		"gaming":         true,
		"reviews":        true,
		"features":       true,
	}
	categoryCount := 0
	for _, word := range words {
		if categories[word] {
			categoryCount++
		}
	}
	return categoryCount >= 3 && categoryCount*2 >= len(words)
}
