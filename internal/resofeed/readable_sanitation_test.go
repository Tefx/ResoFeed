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

func TestSanitizeReadablePayloadTextDropsThreadReaderChromeKeepsTweetFacts(t *testing.T) {
	dirty := strings.Join([]string{
		"Share this page",
		"Enter URL or ID to Unroll",
		"MiniMax M3 scored 59. 0% SWE-Bench Pro in the posted comparison.",
		"MiniMax Sparse Attention is described as reducing inference cost.",
		"50% off standard usage was announced for launch week.",
		"How to get URL link on X",
		"Missing some Tweet in this thread?",
		"Keep Current with Thread Reader",
		"This Thread may be Removed Anytime",
		"Support us",
		"Become a Premium Member",
		"Donate via Paypal",
		"Ethereum donation address copy",
		"0x0123456789abcdef0123456789abcdef01234567",
	}, "\n")

	cleaned, changed := sanitizeReadablePayloadText(dirty)
	if !changed {
		t.Fatalf("sanitizeReadablePayloadText changed=false, want ThreadReader chrome removed")
	}
	for _, want := range []string{"MiniMax M3", "59. 0% SWE-Bench Pro", "MiniMax Sparse Attention", "50% off standard usage"} {
		if !strings.Contains(cleaned, want) {
			t.Fatalf("cleaned payload lost fact %q: %q", want, cleaned)
		}
	}
	for _, forbidden := range []string{"Share this page", "Enter URL or ID to Unroll", "How to get URL link on X", "Missing some Tweet", "Keep Current with", "This Thread may be Removed Anytime", "Support us", "Premium Member", "Donate via Paypal", "donation address", "0x012345"} {
		if strings.Contains(cleaned, forbidden) {
			t.Fatalf("cleaned payload still contains chrome %q: %q", forbidden, cleaned)
		}
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
