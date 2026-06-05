package resofeed

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestICAItemProcessingContractOneLLMRequestPerNewItemNoBatching(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)

	const itemCount = 3
	feed := icaMultiItemFeedServer(t, "ICA One Request Per Item Source", "one-request-item", itemCount)
	seedSTCSource(t, ctx, db, "src_ica_one_request_per_item", feed.URL+"/feed.xml", "ICA One Request Per Item Fallback", 1)
	llm := &icaSummaryInputRecordingLLM{}

	result, err := ManualFetchSource(ctx, db, IngestConfig{LLM: llm, SourceFetchTimeout: 3 * time.Second}, "src_ica_one_request_per_item")
	if err != nil {
		t.Fatalf("ManualFetchSource one-request-per-item fixture returned error: %v", err)
	}
	if result.ItemsDiscovered != itemCount || result.ItemsUpserted != itemCount {
		t.Fatalf("ManualFetchSource result = %+v, want %d discovered/upserted items", result, itemCount)
	}

	inputs := llm.snapshotInputs()
	if len(inputs) != itemCount {
		t.Fatalf("LLM summary requests = %d, want exactly one request per discovered item (%d), not multi-article batching", len(inputs), itemCount)
	}
	seenItemIDs := map[string]struct{}{}
	for i, input := range inputs {
		if input.ItemID == "" {
			t.Fatalf("LLM request %d has empty item_id; inputs=%+v", i, inputs)
		}
		if _, ok := seenItemIDs[input.ItemID]; ok {
			t.Fatalf("LLM request %d reused item_id %q; inputs=%+v", i, input.ItemID, inputs)
		}
		seenItemIDs[input.ItemID] = struct{}{}
		matchedSlug := ""
		for slugIndex := 0; slugIndex < itemCount; slugIndex++ {
			slug := fmt.Sprintf("one-request-item-%d", slugIndex)
			if strings.Contains(input.Title, slug) || strings.Contains(input.AvailableText, slug) {
				if matchedSlug != "" && matchedSlug != slug {
					t.Fatalf("LLM request %d appears to batch multiple item slugs %q and %q: title=%q available_text=%q", i, matchedSlug, slug, input.Title, input.AvailableText)
				}
				matchedSlug = slug
			}
		}
		if matchedSlug == "" {
			t.Fatalf("LLM request %d did not carry exactly one expected item slug: title=%q available_text=%q", i, input.Title, input.AvailableText)
		}
	}
}

func TestICAItemProcessingContractSourceLanguageSnapshotStableAcrossItems(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)
	icaSetRuntimeLanguageZH(t, ctx, db, "ica-source-language-snapshot-zh")

	const itemCount = 3
	feed := icaMultiItemFeedServer(t, "ICA Language Snapshot Source", "language-snapshot-item", itemCount)
	seedSTCSource(t, ctx, db, "src_ica_language_snapshot", feed.URL+"/feed.xml", "ICA Language Snapshot Fallback", 1)
	llm := newICALanguageSnapshotLLM()

	done := make(chan error, 1)
	go func() {
		result, err := ManualFetchSource(ctx, db, IngestConfig{LLM: llm, SourceFetchTimeout: 3 * time.Second}, "src_ica_language_snapshot")
		if err != nil {
			done <- err
			return
		}
		if result.ItemsDiscovered != itemCount || result.ItemsUpserted != itemCount {
			done <- fmt.Errorf("ManualFetchSource result = %+v, want %d discovered/upserted items", result, itemCount)
			return
		}
		done <- nil
	}()

	select {
	case <-llm.firstCallEntered:
	case err := <-done:
		if err != nil {
			t.Fatalf("ManualFetchSource finished before language snapshot mutation hook: %v", err)
		}
		t.Fatal("ManualFetchSource finished before language snapshot mutation hook")
	case <-ctx.Done():
		t.Fatalf("wait for first LLM call: %v", ctx.Err())
	}

	if err := storeRuntimeMetadata(ctx, db, RuntimeMetadataKeyProcessingLanguage, string(ProcessingLanguageEnglish)); err != nil {
		t.Fatalf("directly mutate runtime language after source snapshot was captured: %v", err)
	}
	close(llm.release)

	if err := <-done; err != nil {
		t.Fatalf("ManualFetchSource with language snapshot fixture returned error: %v", err)
	}
	icaAssertLanguageSnapshotRecordedLanguages(t, llm, []ProcessingLanguage{ProcessingLanguageChinese, ProcessingLanguageChinese, ProcessingLanguageChinese})
}

func TestICAExpectedRedItemLLMConcurrencyBoundedByPerSourceLimit(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)

	const itemCount = 5
	const itemLimit = 2
	feed := icaMultiItemFeedServer(t, "ICA Item Bound Source", "item-bound", itemCount)
	seedSTCSource(t, ctx, db, "src_ica_item_bound", feed.URL+"/feed.xml", "ICA Item Bound Fallback", 1)
	llm := &icaSlowSummaryLLM{delay: 150 * time.Millisecond}

	result, err := ManualFetchSource(ctx, db, IngestConfig{LLM: llm, SourceFetchTimeout: 5 * time.Second, ItemConcurrencyPerSource: itemLimit, GlobalLLMConcurrency: 8}, "src_ica_item_bound")
	if err != nil {
		t.Fatalf("ManualFetchSource item bounded-concurrency fixture returned error: %v", err)
	}
	if result.ItemsDiscovered != itemCount || result.ItemsUpserted != itemCount {
		t.Fatalf("ManualFetchSource result = %+v, want %d discovered/upserted items", result, itemCount)
	}
	if got := llm.calls.Load(); got != itemCount {
		t.Fatalf("bounded item LLM calls = %d, want %d one-item requests", got, itemCount)
	}
	if got := llm.maxConcurrent.Load(); got != itemLimit {
		t.Fatalf("bounded item LLM max concurrent calls = %d, want exactly item_concurrency_per_source=%d", got, itemLimit)
	}
}

func TestICAExpectedRedGlobalLLMSemaphoreBoundsConcurrentSources(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	db := newContractDB(t, ctx)

	const sourceCount = 2
	for i := 0; i < sourceCount; i++ {
		feed := icaMultiItemFeedServer(t, fmt.Sprintf("ICA Global LLM Source %d", i), fmt.Sprintf("global-llm-%d", i), 1)
		seedSTCSource(t, ctx, db, fmt.Sprintf("src_ica_global_llm_%d", i), feed.URL+"/feed.xml", fmt.Sprintf("ICA Global LLM Fallback %d", i), 1)
	}
	llm := &icaSlowSummaryLLM{delay: 200 * time.Millisecond}

	result, err := ManualIngest(ctx, db, IngestConfig{LLM: llm, SourceFetchTimeout: 5 * time.Second, SourceConcurrency: sourceCount, ItemConcurrencyPerSource: 2, GlobalLLMConcurrency: 1})
	if err != nil {
		t.Fatalf("ManualIngest global LLM semaphore fixture returned error: %v", err)
	}
	if result.SourcesFetched != sourceCount || result.ItemsDiscovered != sourceCount || result.ItemsUpserted != sourceCount {
		t.Fatalf("ManualIngest result = %+v, want %d sources/items fetched", result, sourceCount)
	}
	if got := llm.calls.Load(); got != sourceCount {
		t.Fatalf("global LLM fixture calls = %d, want %d one-item requests", got, sourceCount)
	}
	if got := llm.maxConcurrent.Load(); got > 1 {
		t.Fatalf("global LLM max concurrent calls = %d, want <= global_llm_concurrency=1 across concurrent sources", got)
	}
}

type icaSummaryInputRecordingLLM struct {
	mu     sync.Mutex
	inputs []OpenRouterSummaryInput
}

func (l *icaSummaryInputRecordingLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.mu.Lock()
	l.inputs = append(l.inputs, input)
	l.mu.Unlock()
	return icaSummaryOutputForInput(input), nil
}

func (l *icaSummaryInputRecordingLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func (l *icaSummaryInputRecordingLLM) snapshotInputs() []OpenRouterSummaryInput {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]OpenRouterSummaryInput(nil), l.inputs...)
}

type icaLanguageSnapshotLLM struct {
	mu               sync.Mutex
	languages        []ProcessingLanguage
	firstCallEntered chan struct{}
	release          chan struct{}
	once             sync.Once
}

func newICALanguageSnapshotLLM() *icaLanguageSnapshotLLM {
	return &icaLanguageSnapshotLLM{firstCallEntered: make(chan struct{}), release: make(chan struct{})}
}

func (l *icaLanguageSnapshotLLM) SummarizeItem(ctx context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.mu.Lock()
	l.languages = append(l.languages, input.TargetLanguage)
	l.mu.Unlock()
	l.once.Do(func() { close(l.firstCallEntered) })
	select {
	case <-l.release:
	case <-ctx.Done():
		return OpenRouterSummaryOutput{}, fmt.Errorf("language snapshot summary fixture canceled: %w", ctx.Err())
	}
	return icaSummaryOutputForInput(input), nil
}

func (l *icaLanguageSnapshotLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func (l *icaLanguageSnapshotLLM) snapshotLanguages() []ProcessingLanguage {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]ProcessingLanguage(nil), l.languages...)
}

func icaAssertLanguageSnapshotRecordedLanguages(t *testing.T, llm *icaLanguageSnapshotLLM, want []ProcessingLanguage) {
	t.Helper()
	got := llm.snapshotLanguages()
	if len(got) != len(want) {
		t.Fatalf("recorded source snapshot languages = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("recorded source snapshot languages = %v, want %v", got, want)
		}
	}
}

func icaSummaryOutputForInput(input OpenRouterSummaryInput) OpenRouterSummaryOutput {
	return OpenRouterSummaryOutput{
		LocalizedTitle: "localized " + input.Title,
		Title:          "localized " + input.Title,
		Summary:        "Summary with concrete source facts for " + input.Title + ".",
		CoreInsight:    "Core insight grounded in source facts for " + input.Title + ".",
		FeedExcerpt:    "Feed excerpt for " + input.Title + ".",
		ExtractedText:  "Extracted source text for " + input.Title + ".",
		KeyPoints: []string{
			"First source-backed key point.",
			"Second source-backed key point.",
			"Third source-backed key point.",
		},
		ValueTier:   "high",
		ModelStatus: modelStatusOK,
	}
}

var _ LLMClient = (*icaSummaryInputRecordingLLM)(nil)
var _ LLMClient = (*icaLanguageSnapshotLLM)(nil)
