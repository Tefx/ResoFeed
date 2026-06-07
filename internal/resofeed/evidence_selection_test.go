package resofeed

import (
	"context"
	"database/sql"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEvidenceSelectionNormalOperationPrecedence(t *testing.T) {
	ctx := context.Background()
	localArticle := selectionTestArticleText("normal local article")
	localServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, "<html><body><article>"+localArticle+"</article></body></html>")
	}))
	t.Cleanup(localServer.Close)

	local := selectNormalIngestSourceEvidence(ctx, localServer.URL+"/local", selectionTestArticleText("rss that must lose"), false)
	assertEvidenceSelection(t, local, extractionSourceLocalReadable, availableTextSourceFreshFull, extractionStatusFull, true, "normal local article")

	feed := selectNormalIngestSourceEvidence(ctx, "mailto:not-an-article@example.test", selectionTestArticleText("normal rss fallback"), false)
	assertEvidenceSelection(t, feed, extractionSourceFeedExcerpt, availableTextSourceRSSExcerpt, extractionStatusPartial, false, "normal rss fallback")
}

func TestEvidenceSelectionNormalOperationUsesTavilyAfterLocalAndRSSFail(t *testing.T) {
	tavilyInstallContractHTTPTransport(t)
	provider := newTavilyExpectedRedProvider(t, func(w http.ResponseWriter, _ *http.Request) {
		writeTavilyJSON(t, w, map[string]any{"results": []map[string]any{{"url": "https://article.example/normal-tavily", "raw_content": selectionTestArticleText("normal tavily recovery")}}})
	})
	tavilyConfigureProviderEnv(t, provider.extractEndpoint())

	selection := selectNormalIngestSourceEvidence(context.Background(), "https://article.example/normal-tavily", "", false)
	assertEvidenceSelection(t, selection, extractionSourceExternalTavily, availableTextSourceExternalTavily, extractionStatusFull, true, "normal tavily recovery")
	assertTavilyExpectedRedWireRequest(t, provider.requests(), "https://article.example/normal-tavily")
}

func TestEvidenceSelectionLibraryOperationStoredEvidenceAndRSSFallback(t *testing.T) {
	stored := selectLibrarySelectionForTest(t, reprocessItem{
		url:                "file:///not-an-article",
		extractionSource:   nullStringForSelection(extractionSourceExternalTavily),
		sourceEvidenceText: nullStringForSelection(selectionTestArticleText("stored source evidence")),
		feedExcerpt:        nullStringForSelection(selectionTestArticleText("rss must not win")),
	})
	assertEvidenceSelection(t, stored, extractionSourceExternalTavily, availableTextSourceStoredExtracted, extractionStatusFull, true, "stored source evidence")

	rss := selectLibrarySelectionForTest(t, reprocessItem{
		url:         "file:///not-an-article",
		feedExcerpt: nullStringForSelection(selectionTestArticleText("library rss content fallback")),
	})
	assertEvidenceSelection(t, rss, extractionSourceFeedExcerpt, availableTextSourceRSSExcerpt, extractionStatusPartial, false, "library rss content fallback")
}

func TestEvidenceSelectionSelectedReingestIgnoresStoredGeneratedAndFeedText(t *testing.T) {
	selection := selectSelectedSelectionForTest(t, reprocessItem{
		url:                "file:///not-an-article",
		feedExcerpt:        nullStringForSelection(selectionTestArticleText("stale feed excerpt")),
		extractedText:      nullStringForSelection(selectionTestArticleText("stale generated extracted text")),
		sourceEvidenceText: nullStringForSelection(selectionTestArticleText("stale source evidence text")),
	})
	if selection.ok() {
		t.Fatalf("selected reingest selection unexpectedly reused stale text: %+v", selection)
	}
	if selection.extractionSource != extractionSourceNone || selection.unavailableCode != ReprocessErrorOriginalUnavailable {
		t.Fatalf("selected reingest selection = %+v, want non-source unavailable", selection)
	}
}

func selectLibrarySelectionForTest(t *testing.T, item reprocessItem) selectedSourceEvidence {
	t.Helper()
	withIsolatedTavilyExpectedRedRuntimeInputs(t)
	selection, err := selectLibraryReprocessSourceEvidence(context.Background(), item)
	if err != nil {
		t.Fatalf("selectLibraryReprocessSourceEvidence: %v", err)
	}
	return selection
}

func selectSelectedSelectionForTest(t *testing.T, item reprocessItem) selectedSourceEvidence {
	t.Helper()
	withIsolatedTavilyExpectedRedRuntimeInputs(t)
	selection, err := selectSelectedReingestSourceEvidence(context.Background(), item)
	if err != nil {
		t.Fatalf("selectSelectedReingestSourceEvidence: %v", err)
	}
	return selection
}

func assertEvidenceSelection(t *testing.T, selection selectedSourceEvidence, extractionSource string, availableTextSource string, status string, wantSourceEvidence bool, marker string) {
	t.Helper()
	if !selection.ok() {
		t.Fatalf("selection is not usable: %+v", selection)
	}
	if selection.extractionSource != extractionSource || selection.availableTextSource != availableTextSource || selection.extractionStatus != status {
		t.Fatalf("selection source/status = extraction:%q available:%q status:%q, want extraction:%q available:%q status:%q", selection.extractionSource, selection.availableTextSource, selection.extractionStatus, extractionSource, availableTextSource, status)
	}
	if !strings.Contains(selection.text, marker) {
		t.Fatalf("selection text missing marker %q: %q", marker, selection.text)
	}
	if wantSourceEvidence {
		if selection.sourceEvidenceText == nil || !strings.Contains(*selection.sourceEvidenceText, marker) {
			t.Fatalf("selection source evidence = %v, want marker %q", selection.sourceEvidenceText, marker)
		}
		return
	}
	if selection.sourceEvidenceText != nil {
		t.Fatalf("selection source evidence = %q, want nil for non-source-evidence fallback", *selection.sourceEvidenceText)
	}
}

func selectionTestArticleText(marker string) string {
	paragraphs := []string{
		marker + " paragraph one records concrete facts about operation-specific evidence selection, local readable precedence, and bounded source acquisition for the article under test.",
		marker + " paragraph two explains that feed excerpts remain display and processing fallbacks without being copied into durable source evidence text.",
		marker + " paragraph three preserves enough source-backed detail to satisfy readable sanitation with multiple non-boilerplate paragraphs.",
	}
	return strings.Join(paragraphs, "\n\n") + strings.Repeat(" Additional evidence selection sentence with concrete article detail.", 8)
}

func nullStringForSelection(value string) sql.NullString {
	return sql.NullString{Valid: true, String: value}
}
