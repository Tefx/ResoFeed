package resofeed

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
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

func TestSanitizeReadablePayloadTextRejectsShortLoadingChrome(t *testing.T) {
	for _, dirty := range []string{"Back to all posts", "Loading", "Loading font.", "OK"} {
		cleaned, changed := sanitizeReadablePayloadText(dirty)
		if !changed || strings.TrimSpace(cleaned) != "" {
			t.Fatalf("sanitizeReadablePayloadText(%q) = changed:%v cleaned:%q, want rejected", dirty, changed, cleaned)
		}
	}
}

func TestExtractArticleTextChoosesDenseWebflowBodyOverShortPostContentWrapper(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!doctype html><html><body>
			<div class="post-content-wrapper">
				<div class="back-link-wrapper"><a href="/blog"><div class="mono">Back to all posts</div></a></div>
				<h1>Introducing 1-bit and Ternary Bonsai Image 4B: Image Generation for Local Devices</h1>
				<div class="rich-text w-richtext">
					<p>Today we are releasing Bonsai Image 4B, a family of compact image-generation models designed to run high-quality diffusion inference on local hardware from laptops to phones.</p>
					<p>The 1-bit variant uses binary transformer weights for maximum compression, while the ternary variant keeps more representational flexibility for visual quality and prompt fidelity.</p>
					<p>The result is practical local image generation on devices that were previously out of reach for this class of model.</p>
				</div>
			</div>
		</body></html>`))
	}))
	defer server.Close()

	text, status := extractArticleText(context.Background(), server.URL, "RSS fallback excerpt")
	if status != extractionStatusFull {
		t.Fatalf("extraction status = %q, want %q; text=%q", status, extractionStatusFull, text)
	}
	if strings.Contains(text, "Back to all posts") {
		t.Fatalf("extracted text kept navigation fragment: %q", text)
	}
	for _, want := range []string{"Bonsai Image 4B", "1-bit variant", "ternary variant", "local image generation"} {
		if !strings.Contains(text, want) {
			t.Fatalf("extracted text missing %q: %q", want, text)
		}
	}
}

func TestSanitizeReadablePayloadTextRejectsMetadataOnlyArticleChrome(t *testing.T) {
	dirty := strings.Join([]string{
		"2,075 reads",
		"How AI Quietly Changed Modern UX Patterns",
		"by Artem Ivanov",
		"Translations",
		"EN KO ES VI JA RO LT GL PL KM ID ZU SK",
		"Your browser does not support the audio element.",
		"Story's Credibility",
		"About Author",
		"Read my stories Learn More",
		"Comments",
		"TOPICS ai-and-ml # ai # ux # product-design",
		"THIS ARTICLE WAS FEATURED IN",
		"Terminal Lite Threads Bsky",
	}, "\n")
	cleaned, _ := sanitizeReadablePayloadText(dirty)
	if !isLowInformationReadablePayload(cleaned) {
		t.Fatalf("metadata-only article chrome not recognized as low information: %q", cleaned)
	}
}

func TestSanitizeReadablePayloadTextDropsCSSBeforeArticleBody(t *testing.T) {
	dirty := strings.Join([]string{
		`#filter')}. widget-drilldown . refine-filters-toggle. fa . fa:after,. widget-drilldown . refine-filters-toggle. fa . fa:before{width:25px}. widget-dynamic . tabs-content{color:#171e2f;font-size:13px}. widget-customwidgets . bg-white{background-color:rgb(255 255 255)}. widget-customwidgets . transition-all{transition-property:all}`,
		"Wendy's new branding commits a cardinal design sin",
		"Fast food chain Wendy's is rolling out a new restaurant look that's breaking all the rules. Forget about hunger-inducing, attention-grabbing red; Wendy's global chains are feeling blue.",
		"The new blue restaurants were recently introduced as part of Wendy's Future Fresh initiative after debuting in the Philippines.",
	}, "\n")
	cleaned, changed := sanitizeReadablePayloadText(dirty)
	if !changed {
		t.Fatalf("sanitizeReadablePayloadText changed=false, want CSS line dropped")
	}
	if strings.Contains(cleaned, "widget-drilldown") || strings.Contains(cleaned, "transition-property") || strings.Contains(cleaned, "var(--") {
		t.Fatalf("cleaned payload kept CSS chrome: %q", cleaned)
	}
	for _, want := range []string{"Wendy's new branding", "Future Fresh", "Philippines"} {
		if !strings.Contains(cleaned, want) {
			t.Fatalf("cleaned payload missing %q: %q", want, cleaned)
		}
	}
}

func TestSanitizeReadablePayloadTextRejectsJavaScriptRequiredAndBrowserChrome(t *testing.T) {
	tests := []string{
		"This page requires JavaScript.\nPlease turn on JavaScript in your browser and refresh the page to view its content.",
		"Skip to Main Content\nAccessibility Overview\nSupport\nEnglish\nEnglish\nEspañol\nDeutsch\nPrivacy & Legal Policies\nDo Not Sell My Personal Information\nCookie Preferences",
	}
	for _, dirty := range tests {
		cleaned, _ := sanitizeReadablePayloadText(dirty)
		if strings.TrimSpace(cleaned) != "" && !isLowInformationReadablePayload(cleaned) {
			t.Fatalf("chrome payload accepted as usable evidence: %q", cleaned)
		}
	}
}

func TestExtractArticleTextRejectsJavaScriptRequiredChromeWithFallback(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><body><main>This page requires JavaScript. Please turn on JavaScript in your browser and refresh the page to view its content.</main></body></html>`))
	}))
	defer server.Close()

	text, status := extractArticleText(context.Background(), server.URL, "RSS fallback excerpt remains available")
	if status != extractionStatusPartial || strings.TrimSpace(text) != "" {
		t.Fatalf("extractArticleText status=%q text=%q, want partial with empty local text", status, text)
	}
}

func TestExtractArticleTextRejectsBrowserChromeOnlyPage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><body><main>Skip to Main Content Accessibility Overview Support English English Español Deutsch 简体中文 繁體中文 Français Português 日本語 Русский 한국어 Italian Tiếng Việt Privacy & Legal Policies Do Not Sell My Personal Information Cookie Preferences</main></body></html>`))
	}))
	defer server.Close()

	text, status := extractArticleText(context.Background(), server.URL, "")
	if status != extractionStatusOriginalNA || strings.TrimSpace(text) != "" {
		t.Fatalf("extractArticleText status=%q text=%q, want original unavailable for browser chrome", status, text)
	}
}

func TestExtractArticleTextRejectsTitleAndLoadingChrome(t *testing.T) {
	tests := []struct {
		name     string
		html     string
		fallback string
		want     string
	}{
		{name: "title-loading", html: `<html><head><title>UX Case Study: How Hinge Keeps You Engaged</title></head><body><main>Loading</main></body></html>`, fallback: "RSS excerpt exists", want: extractionStatusPartial},
		{name: "title-loading-font", html: `<html><head><title>Letterbox — Letters made of letters</title></head><body><main>Loading font.</main></body></html>`, fallback: "RSS excerpt exists", want: extractionStatusPartial},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				_, _ = w.Write([]byte(tt.html))
			}))
			defer server.Close()
			text, status := extractArticleText(context.Background(), server.URL, tt.fallback)
			if status != tt.want || strings.TrimSpace(text) != "" {
				t.Fatalf("extractArticleText status=%q text=%q, want status=%q empty text", status, text, tt.want)
			}
		})
	}
}

func TestSanitizeReadablePayloadTextNormalizesLiteralEscapedLineBreaks(t *testing.T) {
	dirty := `First generated paragraph.\n\nSecond generated paragraph.\r\nThird generated paragraph.\rFourth generated paragraph.`
	cleaned, changed := sanitizeReadablePayloadText(dirty)
	if !changed {
		t.Fatalf("sanitizeReadablePayloadText changed=false, want literal escaped line breaks normalized")
	}
	if strings.Contains(cleaned, `\n`) || strings.Contains(cleaned, `\r`) {
		t.Fatalf("cleaned payload still contains visible escaped line breaks: %q", cleaned)
	}
	for _, want := range []string{"First generated paragraph.", "Second generated paragraph.", "Third generated paragraph.", "Fourth generated paragraph."} {
		if !strings.Contains(cleaned, want) {
			t.Fatalf("cleaned payload lost paragraph %q: %q", want, cleaned)
		}
	}
	if !strings.Contains(cleaned, "\n\n") {
		t.Fatalf("cleaned payload = %q, want normalized paragraph separators", cleaned)
	}
}

func TestSanitizeReadableItemNormalizesGeneratedReadableFields(t *testing.T) {
	feed := `Feed lead.\n\nFeed continuation.`
	extracted := `Extracted lead.\n\nExtracted continuation.`
	summary := `Summary lead.\n\nSummary continuation.`
	core := `Core lead.\n\nCore continuation.`
	item := &Item{
		FeedExcerpt:   &feed,
		ExtractedText: &extracted,
		Summary:       &summary,
		CoreInsight:   &core,
	}

	sanitizeReadableItem(item)

	fields := map[string]*string{
		"feed_excerpt":   item.FeedExcerpt,
		"extracted_text": item.ExtractedText,
		"summary":        item.Summary,
		"core_insight":   item.CoreInsight,
	}
	for name, got := range fields {
		if got == nil {
			t.Fatalf("%s sanitized to nil, want normalized text", name)
		}
		if strings.Contains(*got, `\n`) || strings.Contains(*got, `\r`) {
			t.Fatalf("%s still contains visible escaped line break sequence: %q", name, *got)
		}
		if !strings.Contains(*got, "\n\n") {
			t.Fatalf("%s = %q, want normalized paragraph separator", name, *got)
		}
	}
}

func TestUpsertIngestedItemPersistsNormalizedReadableFieldsAndSearchIndex(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values ('src_literal_breaks', 'https://literal.example/feed.xml', 'Literal Breaks', ?, 'ok', 1, 1)`, now); err != nil {
		t.Fatalf("insert source: %v", err)
	}

	feed := `Feed lead.\n\nFeed continuation.`
	extracted := `Extracted lead.\n\nExtracted continuation.`
	summary := `Summary lead.\n\nSummary continuation.`
	core := `Core lead.\n\nCore continuation.`
	valueTier := "high"
	inserted, err := upsertIngestedItem(ctx, db, Item{
		ID:               "item_literal_breaks",
		SourceID:         "src_literal_breaks",
		SourceTitle:      "Literal Breaks",
		URL:              "https://literal.example/item",
		Title:            "Literal escaped line breaks",
		SourceItemTitle:  "Literal escaped line breaks",
		Summary:          &summary,
		CoreInsight:      &core,
		KeyPoints:        []string{"first source point", "second source point", "third source point"},
		ValueTier:        &valueTier,
		ContentStatus:    modelStatusOK,
		ExtractionStatus: extractionStatusFull,
		ModelStatus:      modelStatusOK,
		FeedExcerpt:      &feed,
		ExtractedText:    &extracted,
		Provenance: Provenance{
			SourceURL:   "https://literal.example/feed.xml",
			OriginalURL: "https://literal.example/item",
		},
	})
	if err != nil {
		t.Fatalf("upsertIngestedItem: %v", err)
	}
	if !inserted {
		t.Fatalf("upsertIngestedItem inserted=false, want true")
	}

	var storedFeed, storedExtracted, storedSummary, storedCore string
	if err := db.QueryRowContext(ctx, `select coalesce(feed_excerpt, ''), coalesce(extracted_text, ''), coalesce(summary, ''), coalesce(core_insight, '') from items where id = 'item_literal_breaks'`).Scan(&storedFeed, &storedExtracted, &storedSummary, &storedCore); err != nil {
		t.Fatalf("query item: %v", err)
	}
	for name, got := range map[string]string{
		"stored feed_excerpt":   storedFeed,
		"stored extracted_text": storedExtracted,
		"stored summary":        storedSummary,
		"stored core_insight":   storedCore,
	} {
		assertNoVisibleEscapedLineBreaks(t, name, got)
	}

	var indexedFeed, indexedExtracted, indexedSummary, indexedCore string
	if err := db.QueryRowContext(ctx, `select feed_excerpt, extracted_text, summary, core_insight from search_fts where item_id = 'item_literal_breaks'`).Scan(&indexedFeed, &indexedExtracted, &indexedSummary, &indexedCore); err != nil {
		t.Fatalf("query search_fts: %v", err)
	}
	for name, got := range map[string]string{
		"indexed feed_excerpt":   indexedFeed,
		"indexed extracted_text": indexedExtracted,
		"indexed summary":        indexedSummary,
		"indexed core_insight":   indexedCore,
	} {
		assertNoVisibleEscapedLineBreaks(t, name, got)
	}
}

func TestRunMigrationsRepairsPersistedReadableLiteralEscapedLineBreaks(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values ('src_repair_literal_breaks', 'https://repair.example/feed.xml', 'Repair Feed', ?, 'ok', 1, 1)`, now); err != nil {
		t.Fatalf("insert source: %v", err)
	}
	if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, source_item_title, localized_title, summary, core_insight, key_points, value_tier, content_status, first_seen_at, extraction_status, model_status, feed_excerpt, extracted_text) values ('item_repair_literal_breaks', 'src_repair_literal_breaks', 'https://repair.example/feed.xml', 'https://repair.example/item', 'Repair title', 'Repair title', 'Repair localized', ?, ?, ?, 'high', 'ok', ?, 'full', 'ok', ?, ?)`, `Summary lead.\n\nSummary continuation.`, `Core lead.\n\nCore continuation.`, `["Point lead.\\n\\nPoint continuation.","Point two remains clean.","Point three remains clean."]`, now, `Feed lead.\n\nFeed continuation.`, `Extracted lead.\n\nExtracted continuation.`); err != nil {
		t.Fatalf("insert dirty item: %v", err)
	}
	if _, err := db.ExecContext(ctx, `insert into search_fts (item_id, title, source_item_title, localized_title, source_title, feed_excerpt, summary, core_insight, key_points, extracted_text, provenance) values ('item_repair_literal_breaks', 'Repair title', 'Repair title', 'Repair localized', 'Repair Feed', ?, ?, ?, ?, ?, 'https://repair.example/item')`, `Feed lead.\n\nFeed continuation.`, `Summary lead.\n\nSummary continuation. high`, `Core lead.\n\nCore continuation.`, `["Point lead.\\n\\nPoint continuation.","Point two remains clean.","Point three remains clean."]`, `Extracted lead.\n\nExtracted continuation.`); err != nil {
		t.Fatalf("insert dirty search index: %v", err)
	}

	if err := RunMigrations(ctx, db); err != nil {
		t.Fatalf("RunMigrations repair: %v", err)
	}

	var storedFeed, storedExtracted, storedSummary, storedCore, storedKeyPoints string
	if err := db.QueryRowContext(ctx, `select coalesce(feed_excerpt, ''), coalesce(extracted_text, ''), coalesce(summary, ''), coalesce(core_insight, ''), coalesce(key_points, '') from items where id = 'item_repair_literal_breaks'`).Scan(&storedFeed, &storedExtracted, &storedSummary, &storedCore, &storedKeyPoints); err != nil {
		t.Fatalf("query repaired item: %v", err)
	}
	for name, got := range map[string]string{
		"stored feed_excerpt":   storedFeed,
		"stored extracted_text": storedExtracted,
		"stored summary":        storedSummary,
		"stored core_insight":   storedCore,
	} {
		if strings.Contains(got, `\n`) || strings.Contains(got, `\r`) {
			t.Fatalf("%s still contains visible escaped line break sequence after repair: %q", name, got)
		}
	}
	assertDecodedKeyPointsHaveNoVisibleEscapedLineBreaks(t, "stored key_points", storedKeyPoints)

	var indexedFeed, indexedExtracted, indexedSummary, indexedCore, indexedKeyPoints string
	if err := db.QueryRowContext(ctx, `select feed_excerpt, extracted_text, summary, core_insight, key_points from search_fts where item_id = 'item_repair_literal_breaks'`).Scan(&indexedFeed, &indexedExtracted, &indexedSummary, &indexedCore, &indexedKeyPoints); err != nil {
		t.Fatalf("query repaired search index: %v", err)
	}
	for name, got := range map[string]string{
		"indexed feed_excerpt":   indexedFeed,
		"indexed extracted_text": indexedExtracted,
		"indexed summary":        indexedSummary,
		"indexed core_insight":   indexedCore,
	} {
		if strings.Contains(got, `\n`) || strings.Contains(got, `\r`) {
			t.Fatalf("%s still contains visible escaped line break sequence after repair: %q", name, got)
		}
	}
	assertDecodedKeyPointsHaveNoVisibleEscapedLineBreaks(t, "indexed key_points", indexedKeyPoints)
}

func assertDecodedKeyPointsHaveNoVisibleEscapedLineBreaks(t *testing.T, name string, raw string) {
	t.Helper()
	var points []string
	if err := json.Unmarshal([]byte(raw), &points); err != nil {
		t.Fatalf("decode %s: %v raw=%q", name, err, raw)
	}
	if len(points) == 0 {
		t.Fatalf("%s decoded empty key_points", name)
	}
	for i, point := range points {
		if strings.Contains(point, `\n`) || strings.Contains(point, `\r`) {
			t.Fatalf("%s[%d] still contains visible escaped line break sequence after repair: %q", name, i, point)
		}
	}
}

func assertNoVisibleEscapedLineBreaks(t *testing.T, name string, got string) {
	t.Helper()
	if strings.Contains(got, `\n`) || strings.Contains(got, `\r`) {
		t.Fatalf("%s still contains visible escaped line break sequence: %q", name, got)
	}
	if !strings.Contains(got, "\n\n") {
		t.Fatalf("%s = %q, want normalized paragraph separator", name, got)
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
