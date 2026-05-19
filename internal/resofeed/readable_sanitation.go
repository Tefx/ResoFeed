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
	}
	readableContaminationPatterns = append(append([]*regexp.Regexp{}, readableTailMarkerPatterns...), readableDropLinePatterns...)
	inlineSocialPromptRE          = regexp.MustCompile(`(?i)\bfollow\s+us\s+on\s+(twitter|x)\s+for\s+more\s+newsletters?\b`)
	repeatedDirtyLeadRE           = regexp.MustCompile(`(?i)\bsummary-like\s+lead\s+repeated\s+by\s+the\s+site\s+summary-like\s+lead\s+repeated\s+by\s+the\s+site\b`)
	pdfPayloadLeadRE              = regexp.MustCompile(`(?i)^%pdf-\d`)
)

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
	value = strings.TrimSpace(value)
	if value == "" {
		return "", false
	}
	if pdfPayloadLeadRE.MatchString(value) || strings.ContainsRune(value, '\uFFFD') {
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
	return cleaned, contaminated || cleaned != value
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
