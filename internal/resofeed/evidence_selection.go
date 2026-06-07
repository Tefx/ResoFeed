package resofeed

import (
	"context"
	"errors"
	"strings"
)

const (
	extractionSourceLocalReadable  = "local_readable"
	extractionSourceFeedExcerpt    = "feed_excerpt"
	extractionSourceExternalTavily = "external_tavily"
	extractionSourceNone           = "none"

	availableTextSourceFreshFull       = "fresh_full_text"
	availableTextSourceStoredExtracted = "stored_extracted_text"
	availableTextSourceRSSExcerpt      = "rss_excerpt"
	availableTextSourceExternalTavily  = "external_tavily"
	availableTextSourceUnavailable     = "unavailable"
)

type selectedSourceEvidence struct {
	url                 string
	text                string
	availableTextSource string
	extractionSource    string
	extractionStatus    string
	sourceEvidenceText  *string
	unavailableCode     ReprocessErrorCode
	failureCode         ReprocessErrorCode
	failureStatus       string
}

func (s selectedSourceEvidence) ok() bool {
	return strings.TrimSpace(s.text) != "" && strings.TrimSpace(s.availableTextSource) != ""
}

func selectNormalIngestSourceEvidence(ctx context.Context, itemURL string, feedExcerpt string, generatedFallbackURL bool) selectedSourceEvidence {
	itemURL = strings.TrimSpace(itemURL)
	if !generatedFallbackURL {
		text, status := extractArticleText(ctx, itemURL, "")
		if status == extractionStatusFull && strings.TrimSpace(text) != "" {
			return sourceEvidenceFromLocal(itemURL, text)
		}
	}
	if text, ok := sanitizeEvidenceSelectionReadableText(feedExcerpt); ok {
		return selectedSourceEvidence{url: itemURL, text: text, availableTextSource: availableTextSourceRSSExcerpt, extractionSource: extractionSourceFeedExcerpt, extractionStatus: extractionStatusPartial}
	}
	if !generatedFallbackURL {
		return selectTavilySourceEvidence(ctx, itemURL)
	}
	return unavailableSourceEvidence(itemURL, ReprocessErrorOriginalUnavailable)
}

func selectLibraryReprocessSourceEvidence(ctx context.Context, item reprocessItem) (selectedSourceEvidence, error) {
	local, err := selectFreshReprocessSourceEvidence(ctx, item)
	if err != nil {
		return selectedSourceEvidence{}, err
	}
	if local.ok() {
		return local, nil
	}
	if stored, ok := sourceEvidenceFromStoredItem(item); ok {
		return stored, nil
	}
	if tavily := selectTavilyFromCandidates(ctx, item); tavily.ok() || tavily.failureCode != "" || tavily.unavailableCode != "" {
		return tavily, nil
	}
	if _, fallbackText, fallbackSource, ok := reprocessStoredTextFallback(item); ok {
		switch fallbackSource {
		case availableTextSourceStoredExtracted:
			return legacyStoredExtractedTextSelection(item, fallbackText), nil
		case availableTextSourceRSSExcerpt:
			return rssExcerptContentFallbackSelection(item, fallbackText), nil
		}
	}
	return unavailableSourceEvidence(fallbackReprocessSourceURL(item), ReprocessErrorOriginalUnavailable), nil
}

func selectSelectedReingestSourceEvidence(ctx context.Context, item reprocessItem) (selectedSourceEvidence, error) {
	local, err := selectFreshReprocessSourceEvidence(ctx, item)
	if err != nil {
		return selectedSourceEvidence{}, err
	}
	if local.ok() {
		return local, nil
	}
	if tavily := selectTavilyFromCandidates(ctx, item); tavily.ok() || tavily.failureCode != "" || tavily.unavailableCode != "" {
		return tavily, nil
	}
	return unavailableSourceEvidence(fallbackReprocessSourceURL(item), ReprocessErrorOriginalUnavailable), nil
}

func selectFreshReprocessSourceEvidence(ctx context.Context, item reprocessItem) (selectedSourceEvidence, error) {
	for _, candidate := range reprocessCandidateURLs(item) {
		text, err := fetchArticleReadableText(ctx, candidate)
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return selectedSourceEvidence{}, err
		}
		if err != nil {
			continue
		}
		return sourceEvidenceFromLocal(candidate, text), nil
	}
	return selectedSourceEvidence{}, nil
}

func sourceEvidenceFromLocal(rawURL string, text string) selectedSourceEvidence {
	cleaned, ok := sanitizeEvidenceSelectionReadableText(text)
	if !ok {
		return unavailableSourceEvidence(rawURL, ReprocessErrorOriginalUnavailable)
	}
	return selectedSourceEvidence{url: strings.TrimSpace(rawURL), text: cleaned, availableTextSource: availableTextSourceFreshFull, extractionSource: extractionSourceLocalReadable, extractionStatus: extractionStatusFull, sourceEvidenceText: nullableString(cleaned)}
}

func sourceEvidenceFromStoredItem(item reprocessItem) (selectedSourceEvidence, bool) {
	if !item.sourceEvidenceText.Valid {
		return selectedSourceEvidence{}, false
	}
	text, ok := sanitizeEvidenceSelectionReadableText(item.sourceEvidenceText.String)
	if !ok {
		return selectedSourceEvidence{}, false
	}
	extractionSource := normalizeExtractionSource(item.extractionSource.String)
	if extractionSource == extractionSourceNone {
		extractionSource = extractionSourceLocalReadable
	}
	return selectedSourceEvidence{url: fallbackReprocessSourceURL(item), text: text, availableTextSource: availableTextSourceStoredExtracted, extractionSource: extractionSource, extractionStatus: extractionStatusFull, sourceEvidenceText: nullableString(text)}, true
}

func selectTavilyFromCandidates(ctx context.Context, item reprocessItem) selectedSourceEvidence {
	for _, candidate := range tavilyReprocessCandidateURLs(item) {
		selection := selectTavilySourceEvidence(ctx, candidate)
		if selection.ok() || selection.failureCode != "" || selection.unavailableCode != "" {
			return selection
		}
	}
	return selectedSourceEvidence{}
}

func selectTavilySourceEvidence(ctx context.Context, articleURL string) selectedSourceEvidence {
	articleURL = strings.TrimSpace(articleURL)
	if !isTavilyEligibleArticleURL(articleURL) {
		return unavailableSourceEvidence(articleURL, ReprocessErrorOriginalUnavailable)
	}
	text, err := tryTavilyExtractArticleText(ctx, articleURL)
	if err == nil {
		return selectedSourceEvidence{url: articleURL, text: text, availableTextSource: availableTextSourceExternalTavily, extractionSource: extractionSourceExternalTavily, extractionStatus: extractionStatusFull, sourceEvidenceText: nullableString(text)}
	}
	return tavilySelectionError(articleURL, err)
}

func tavilySelectionError(rawURL string, err error) selectedSourceEvidence {
	if errors.Is(err, errTavilyKeyMissing) || errors.Is(err, errTavilyURLIneligible) {
		return unavailableSourceEvidence(rawURL, ReprocessErrorOriginalUnavailable)
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return failedSourceEvidence(rawURL, ReprocessErrorTimeout, modelStatusTimeout)
	}
	var tavilyErr *tavilyExtractError
	if errors.As(err, &tavilyErr) {
		switch tavilyErr.code {
		case ReprocessErrorProviderError:
			return failedSourceEvidence(rawURL, ReprocessErrorProviderError, modelStatusProviderError)
		case ReprocessErrorTimeout:
			return failedSourceEvidence(rawURL, ReprocessErrorTimeout, modelStatusTimeout)
		default:
			return unavailableSourceEvidence(rawURL, ReprocessErrorOriginalUnavailable)
		}
	}
	return failedSourceEvidence(rawURL, ReprocessErrorProviderError, modelStatusProviderError)
}

func unavailableSourceEvidence(rawURL string, code ReprocessErrorCode) selectedSourceEvidence {
	return selectedSourceEvidence{url: strings.TrimSpace(rawURL), availableTextSource: availableTextSourceUnavailable, extractionSource: extractionSourceNone, extractionStatus: extractionStatusOriginalNA, unavailableCode: code}
}

func failedSourceEvidence(rawURL string, code ReprocessErrorCode, modelStatus string) selectedSourceEvidence {
	return selectedSourceEvidence{url: strings.TrimSpace(rawURL), availableTextSource: availableTextSourceUnavailable, extractionSource: extractionSourceNone, extractionStatus: extractionStatusSummaryNA, failureCode: code, failureStatus: modelStatus}
}

func legacyStoredExtractedTextSelection(item reprocessItem, text string) selectedSourceEvidence {
	return selectedSourceEvidence{url: fallbackReprocessSourceURL(item), text: text, availableTextSource: availableTextSourceStoredExtracted, extractionSource: extractionSourceNone, extractionStatus: extractionStatusFull}
}

func rssExcerptContentFallbackSelection(item reprocessItem, text string) selectedSourceEvidence {
	return selectedSourceEvidence{url: fallbackReprocessSourceURL(item), text: text, availableTextSource: availableTextSourceRSSExcerpt, extractionSource: extractionSourceFeedExcerpt, extractionStatus: extractionStatusPartial}
}

func sanitizeEvidenceSelectionReadableText(value string) (string, bool) {
	cleaned, _ := sanitizeReadablePayloadText(value)
	cleaned = strings.TrimSpace(cleaned)
	if cleaned == "" || isUnusableReadablePayload(cleaned) || isLowInformationReadablePayload(cleaned) {
		return "", false
	}
	return cleaned, true
}

func normalizeExtractionSource(value string) string {
	switch strings.TrimSpace(value) {
	case extractionSourceLocalReadable, extractionSourceFeedExcerpt, extractionSourceExternalTavily:
		return strings.TrimSpace(value)
	default:
		return extractionSourceNone
	}
}
