package resofeed

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestBuildItemUsesPromptingV22Contract(t *testing.T) {
	article := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, `<html><body><article><p>SQLite FTS5 remains the lexical search store.</p><p>OpenRouter transforms bounded JSON responses.</p><p>Go validates output before persistence.</p></article></body></html>`)
	}))
	defer article.Close()

	llm := &ingestV22RecordingLLM{}
	steering := []string{"Prefer implementation constraints when source-backed."}
	item, err := buildItemWithActiveSteering(
		context.Background(),
		Source{ID: "source-ingest-v22", URL: article.URL + "/feed.xml", Title: "Literal Source Ledger"},
		feedEntry{ID: "entry-ingest-v22", Title: "Literal source item title", URL: article.URL + "/article", Description: "RSS excerpt source evidence."},
		llm,
		ProcessingLanguageEnglish,
		steering,
	)
	if err != nil {
		t.Fatalf("build Prompting v2.2 item: %v", err)
	}

	if llm.calls != 1 {
		t.Fatalf("Prompting v2.2 calls = %d, want 1", llm.calls)
	}
	if llm.input.ItemID == "" || llm.input.Title != "Literal source item title" || llm.input.SourceTitle != "Literal Source Ledger" || llm.input.URL != article.URL+"/article" {
		t.Fatalf("Prompting v2.2 provenance input = %+v", llm.input)
	}
	if llm.input.TargetLanguage != ProcessingLanguageEnglish || llm.input.AvailableTextSource != "fresh_full_text" || !strings.Contains(llm.input.AvailableText, "SQLite FTS5") {
		t.Fatalf("Prompting v2.2 evidence input = %+v", llm.input)
	}
	if !reflect.DeepEqual(llm.input.ActiveSteeringRules, steering) {
		t.Fatalf("Prompting v2.2 steering = %v, want %v", llm.input.ActiveSteeringRules, steering)
	}
	if item.ModelStatus != modelStatusOK || item.ContentStatus != modelStatusOK || item.Title != "Processed source item title" {
		t.Fatalf("Prompting v2.2 generated item status/title = %+v", item)
	}
	if item.SourceItemTitle != "Literal source item title" || item.SourceTitle != "Literal Source Ledger" || item.URL != article.URL+"/article" {
		t.Fatalf("Prompting v2.2 mutated literal provenance: %+v", item)
	}
	if item.Summary == nil || item.CoreInsight == nil || len(item.KeyPoints) != 3 {
		t.Fatalf("Prompting v2.2 generated fields = %+v", item)
	}
}

type ingestV22RecordingLLM struct {
	calls int
	input OpenRouterSummaryInput
}

func (l *ingestV22RecordingLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.calls++
	l.input = input
	return OpenRouterSummaryOutput{
		LocalizedTitle: "Processed source item title",
		Title:          "Processed source item title",
		Summary:        "SQLite FTS5 remains the lexical store and OpenRouter transforms bounded JSON.",
		CoreInsight:    "Go must validate transformed output before persistence.",
		KeyPoints: []string{
			"SQLite FTS5 remains the lexical search store.",
			"OpenRouter transforms bounded JSON responses.",
			"Go validates output before persistence.",
		},
		ValueTier:   "high",
		ModelStatus: modelStatusOK,
	}, nil
}

func (*ingestV22RecordingLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}
