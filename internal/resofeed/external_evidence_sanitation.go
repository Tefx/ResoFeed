package resofeed

import (
	"regexp"
	"strings"
	"unicode"
)

const (
	externalEvidenceMinNonWhitespace = 500
	externalEvidenceMinUnits         = 3
)

var externalEvidenceDropLinePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\b(window\.__|__nuxt__|__next_data__|document\.|function\s*\(|<script\b)`),
	regexp.MustCompile(`(?i)^\s*(javascript is not available|please enable javascript|we have detected that javascript is disabled|you need to enable javascript|loading(?: font)?\.?)\b`),
	regexp.MustCompile(`(?i)\b(supported browsers?|help center|continue using x\.com|continue using x\. com|©\s*x corp|x corp\.)\b`),
	regexp.MustCompile(`(?i)\b(terms of service privacy policy cookie policy|privacy policy cookie policy|cookie settings privacy policy terms of use|all rights reserved)\b`),
	regexp.MustCompile(`(?i)^\s*[\d,.]+\s+reads\s*$`),
	regexp.MustCompile(`(?i)^\s*translations(\s|$)`),
	regexp.MustCompile(`(?i)^\s*(?:[a-z]{2}\s+){3,}[a-z]{2}\s*$`),
	regexp.MustCompile(`(?i)\b(your browser does not support the audio element|story's credibility|about author|read my stories learn more|comments\s+topics|this article was featured in|terminal lite threads bsky)\b`),
	regexp.MustCompile(`(?i)^\s*(trending now|relevant people|subscribe to our newsletter|footer links|sidebar|more from this site|most read stories|share this page|cookie settings|privacy policy|terms of use|contact us|navigation|menu)\b`),
	regexp.MustCompile(`(?i)^\s*(log in|login|sign in|sign up|create account|register|subscribe)\b`),
}

// sanitizeExternalEvidenceText is the stricter gate for provider-extracted article
// text. It allows dense article prose while rejecting login shells, navigation,
// footer/sidebar widgets, metadata-only fragments, and JS hydration chrome before
// the text can become OpenRouter evidence or durable source text.
func sanitizeExternalEvidenceText(value string) (string, bool) {
	value = normalizeLiteralReadableLineBreaks(value)
	value = strings.TrimSpace(value)
	if value == "" {
		return "", false
	}
	if strings.Contains(value, "<") && strings.Contains(value, ">") {
		value = cleanPromptSourceHTML(value)
	}
	value, _ = sanitizeReadablePayloadText(value)
	value = strings.TrimSpace(value)
	if value == "" || isUnusableReadablePayload(value) || isLowInformationReadablePayload(value) {
		return "", false
	}

	paragraphs := splitExternalEvidenceParagraphs(value)
	kept := make([]string, 0, len(paragraphs))
	for _, paragraph := range paragraphs {
		cleaned := cleanExternalEvidenceParagraph(paragraph)
		if cleaned == "" || isExternalEvidenceDropUnit(cleaned) {
			continue
		}
		kept = append(kept, cleaned)
	}
	cleaned := strings.TrimSpace(strings.Join(kept, "\n\n"))
	if cleaned == "" || isUnusableReadablePayload(cleaned) || isLowInformationReadablePayload(cleaned) {
		return "", false
	}
	if retainedExternalEvidenceChromeDominated(cleaned) || externalEvidenceChromeBlockDominated(cleaned) {
		return "", false
	}
	if countNonWhitespaceRunes(cleaned) < externalEvidenceMinNonWhitespace {
		return "", false
	}
	if externalEvidenceNonBoilerplateUnitCount(cleaned) < externalEvidenceMinUnits {
		return "", false
	}
	return cleaned, true
}

func splitExternalEvidenceParagraphs(value string) []string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	chunks := regexp.MustCompile(`\n\s*\n+`).Split(value, -1)
	paragraphs := make([]string, 0, len(chunks))
	for _, chunk := range chunks {
		chunk = strings.TrimSpace(chunk)
		if chunk != "" {
			paragraphs = append(paragraphs, chunk)
		}
	}
	return paragraphs
}

func cleanExternalEvidenceParagraph(value string) string {
	lines := strings.Split(strings.ReplaceAll(value, "\r\n", "\n"), "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		line = cleanExternalEvidenceLine(line)
		if line != "" {
			kept = append(kept, line)
		}
	}
	return strings.TrimSpace(strings.Join(kept, " "))
}

func cleanExternalEvidenceLine(line string) string {
	line = strings.TrimSpace(line)
	line = strings.TrimLeft(line, "#> \t")
	line = strings.TrimSpace(line)
	if line == "" || isExternalEvidenceChromeLine(line) {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(line), "by ") && len(strings.Fields(line)) <= 5 {
		return ""
	}
	line = cleanInlineReadableBoilerplate(line)
	line = regexp.MustCompile(`\s+`).ReplaceAllString(line, " ")
	return strings.TrimSpace(line)
}

func isExternalEvidenceChromeLine(line string) bool {
	line = strings.TrimSpace(line)
	if line == "" {
		return true
	}
	if matchesAny(externalEvidenceDropLinePatterns, line) {
		return true
	}
	if isExternalEvidenceLinkOnlyLine(line) {
		return true
	}
	return false
}

func isExternalEvidenceDropUnit(unit string) bool {
	unit = strings.TrimSpace(unit)
	if unit == "" {
		return true
	}
	if isExternalEvidenceChromeLine(unit) {
		return true
	}
	words := strings.Fields(unit)
	if len(words) <= 12 && externalEvidenceChromeMarkerScore(unit) > 0 {
		return true
	}
	return externalEvidenceChromeMarkerScore(unit) >= 3 && countNonWhitespaceRunes(unit) < 220
}

func retainedExternalEvidenceChromeDominated(value string) bool {
	lines := externalEvidenceLines(value)
	if len(lines) == 0 {
		return true
	}
	chrome := 0
	for _, line := range lines {
		if isExternalEvidenceChromeLine(line) || isExternalEvidenceDropUnit(line) {
			chrome++
		}
	}
	return chrome*2 > len(lines)
}

func externalEvidenceChromeBlockDominated(value string) bool {
	units := splitExternalEvidenceParagraphs(value)
	if len(units) == 0 {
		return true
	}
	chrome := 0
	for _, unit := range units {
		if externalEvidenceChromeMarkerScore(unit) >= 2 && countNonWhitespaceRunes(unit) < 320 {
			chrome++
		}
	}
	return chrome*2 > len(units)
}

func externalEvidenceNonBoilerplateUnitCount(value string) int {
	paragraphs := splitExternalEvidenceParagraphs(value)
	count := 0
	for _, paragraph := range paragraphs {
		paragraph = strings.TrimSpace(paragraph)
		if paragraph == "" || externalEvidenceBoilerplateUnit(paragraph) {
			continue
		}
		if countNonWhitespaceRunes(paragraph) >= 80 {
			count++
		}
	}
	if count > 0 || len(paragraphs) != 1 {
		return count
	}
	for _, sentence := range splitExternalEvidenceSentences(paragraphs[0]) {
		if !externalEvidenceBoilerplateUnit(sentence) && countNonWhitespaceRunes(sentence) >= 80 {
			count++
		}
	}
	return count
}

func externalEvidenceBoilerplateUnit(unit string) bool {
	unit = strings.TrimSpace(unit)
	if unit == "" {
		return true
	}
	if isExternalEvidenceChromeLine(unit) {
		return true
	}
	return externalEvidenceChromeMarkerScore(unit) >= 2
}

func externalEvidenceChromeMarkerScore(value string) int {
	lower := strings.ToLower(value)
	score := 0
	for _, marker := range []string{
		"cookie", "privacy", "terms", "trending", "relevant people", "subscribe", "javascript", "loading", "footer", "sidebar", "share this page", "login", "log in", "sign up", "sign in", "navigation", "help center", "about author", "comments topics", "most read", "more from this site",
	} {
		if strings.Contains(lower, marker) {
			score++
		}
	}
	return score
}

func splitExternalEvidenceSentences(value string) []string {
	parts := regexp.MustCompile(`[.!?]\s+`).Split(value, -1)
	sentences := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			sentences = append(sentences, part)
		}
	}
	return sentences
}

func externalEvidenceLines(value string) []string {
	raw := strings.Split(strings.ReplaceAll(value, "\r\n", "\n"), "\n")
	lines := make([]string, 0, len(raw))
	for _, line := range raw {
		line = strings.TrimSpace(line)
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

func isExternalEvidenceLinkOnlyLine(line string) bool {
	line = strings.TrimSpace(line)
	if line == "" {
		return false
	}
	fields := strings.Fields(line)
	if len(fields) == 0 || len(fields) > 6 {
		return false
	}
	linkish := 0
	for _, field := range fields {
		trimmed := strings.Trim(field, "[]()<>.,;:!")
		lower := strings.ToLower(trimmed)
		if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "www.") || strings.HasPrefix(lower, "#") || strings.HasPrefix(lower, "@") {
			linkish++
		}
	}
	return linkish > 0 && linkish*2 >= len(fields)
}

func countNonWhitespaceRunes(value string) int {
	count := 0
	for _, r := range value {
		if !unicode.IsSpace(r) {
			count++
		}
	}
	return count
}
