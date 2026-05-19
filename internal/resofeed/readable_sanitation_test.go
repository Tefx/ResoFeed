package resofeed

import (
	"strings"
	"testing"
)

func TestSanitizeReadablePayloadTextCoversAuditedVergeTail(t *testing.T) {
	dirty := strings.Join([]string{
		"The actual article conclusion remains available for inspection.",
		"Follow topics and authors from this story to personalize your feed.",
		"Transportation News Tech",
		"More from The Verge",
		"This related-story title should not appear after the article conclusion.",
	}, "\n")

	cleaned, changed := sanitizeReadablePayloadText(dirty)
	if !changed {
		t.Fatalf("sanitizeReadablePayloadText changed=false, want true for audited The Verge tail")
	}
	if !strings.Contains(cleaned, "actual article conclusion") {
		t.Fatalf("cleaned payload lost article body: %q", cleaned)
	}
	for _, forbidden := range []string{"follow topics", "authors from this story", "personalize your feed", "Transportation News Tech", "More from The Verge", "related-story title"} {
		if strings.Contains(strings.ToLower(cleaned), strings.ToLower(forbidden)) {
			t.Fatalf("cleaned payload still contains %q: %q", forbidden, cleaned)
		}
	}
}

func TestSanitizeReadableInsightLabelsAuditedGMResidueFallback(t *testing.T) {
	dirty := "Transportation News Tech"
	cleaned, changed := sanitizeReadableInsightPointer(&dirty)
	if !changed {
		t.Fatalf("sanitizeReadableInsightPointer changed=false, want fallback label for category/headline residue")
	}
	if cleaned == nil || *cleaned != contaminatedInsightFallback {
		t.Fatalf("cleaned insight = %v, want explicit contaminated fallback label", cleaned)
	}
}

func TestSanitizeReadablePayloadTextKeepsCleanArticleBody(t *testing.T) {
	body := "The committee approved the procurement timeline after reviewing safety data. Engineers said the finding changes launch sequencing but not the program budget."
	cleaned, changed := sanitizeReadablePayloadText(body)
	if changed {
		t.Fatalf("clean article changed unexpectedly: %q", cleaned)
	}
	if cleaned != body {
		t.Fatalf("cleaned body = %q, want original", cleaned)
	}
}

func TestSanitizeReadablePayloadTextRejectsPDFGarbage(t *testing.T) {
	pdfLike := "%PDF-1.7\n%����\n1 0 obj\n<< /Type /Catalog >>\nendobj"
	cleaned, changed := sanitizeReadablePayloadText(pdfLike)
	if !changed {
		t.Fatalf("sanitizeReadablePayloadText changed=false, want binary/PDF rejection")
	}
	if cleaned != "" {
		t.Fatalf("cleaned PDF payload = %q, want empty", cleaned)
	}
}

func TestSanitizeReadableInsightRejectsPDFGarbage(t *testing.T) {
	pdfLike := "%PDF-1.7\n%����\nstream"
	cleaned, changed := sanitizeReadableInsightPointer(&pdfLike)
	if !changed {
		t.Fatalf("sanitizeReadableInsightPointer changed=false, want binary/PDF rejection")
	}
	if cleaned != nil {
		t.Fatalf("cleaned PDF insight = %q, want nil", *cleaned)
	}
}
