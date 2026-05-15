package resofeed

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"
)

func TestDoctorSearchFTSStatusLineOKStaleAndRuntimeLanguageRedaction(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedSource(t, ctx, db, "src_doctor_runtime_language", "https://doctor.example/feed.xml", "Doctor Source")
	now := time.Now().UTC().Format(time.RFC3339)
	const targetLanguageItemText = "中文运行时项目文本不得出现在doctor"
	if _, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, summary, core_insight, feed_excerpt, extracted_text, first_seen_at, extraction_status, model_status) values ('item_doctor_language', 'src_doctor_runtime_language', 'https://doctor.example/feed.xml', 'https://doctor.example/item', ?, ?, ?, ?, ?, ?, 'full', 'ok')`, targetLanguageItemText, targetLanguageItemText, targetLanguageItemText, targetLanguageItemText, targetLanguageItemText, now); err != nil {
		t.Fatalf("seed target-language item: %v", err)
	}
	if err := storeRuntimeMetadata(ctx, db, RuntimeMetadataKeyProcessingLanguage, string(ProcessingLanguageChinese)); err != nil {
		t.Fatalf("seed processing language: %v", err)
	}

	var ok bytes.Buffer
	if err := WriteDoctor(ctx, db, &ok); err != nil {
		t.Fatalf("WriteDoctor ok: %v", err)
	}
	if !strings.Contains(ok.String(), DoctorSearchFTSOKLinePrefix) {
		t.Fatalf("doctor missing ok search FTS line; body=%s", ok.String())
	}
	assertDoctorOmitsRuntimeLanguageContent(t, ok.String(), targetLanguageItemText)

	staleSince := time.Date(2026, 5, 9, 14, 0, 0, 0, time.UTC)
	if err := setSearchFTSStaleSince(ctx, db, staleSince); err != nil {
		t.Fatalf("set stale marker: %v", err)
	}
	var stale bytes.Buffer
	if err := WriteDoctor(ctx, db, &stale); err != nil {
		t.Fatalf("WriteDoctor stale: %v", err)
	}
	wantStale := DoctorSearchFTSStaleLinePrefix + staleSince.Format(time.RFC3339)
	if !strings.Contains(stale.String(), wantStale) {
		t.Fatalf("doctor missing stale search FTS line %q; body=%s", wantStale, stale.String())
	}
	assertDoctorOmitsRuntimeLanguageContent(t, stale.String(), targetLanguageItemText)
}

func assertDoctorOmitsRuntimeLanguageContent(t *testing.T, body string, targetLanguageItemText string) {
	t.Helper()
	for _, forbidden := range []string{
		RuntimeMetadataKeyProcessingLanguage,
		string(ProcessingLanguageChinese),
		targetLanguageItemText,
		"raw model output",
		"OPENROUTER_KEY",
		"sk-test-secret",
	} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("doctor leaked runtime-language/redacted content %q; body=%s", forbidden, body)
		}
	}
}
