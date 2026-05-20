package resofeed

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMaliciousFakeLLMRejectedBeforeOKPersistenceInBuildItem(t *testing.T) {
	ctx := context.Background()
	valid := OpenRouterSummaryOutput{Summary: "Dense source backed summary.", CoreInsight: "One source backed insight.", ValueTier: "high", ModelStatus: modelStatusOK}
	for _, tc := range []struct {
		name string
		out  OpenRouterSummaryOutput
	}{
		{name: "empty summary", out: withSummaryOutput(valid, func(out *OpenRouterSummaryOutput) { out.Summary = "" })},
		{name: "empty core insight", out: withSummaryOutput(valid, func(out *OpenRouterSummaryOutput) { out.CoreInsight = "" })},
		{name: "invalid value tier", out: withSummaryOutput(valid, func(out *OpenRouterSummaryOutput) { out.ValueTier = "viral" })},
	} {
		t.Run(tc.name, func(t *testing.T) {
			item, err := buildItem(ctx, Source{ID: "src_malicious", URL: "https://feed.example/rss.xml", Title: "Malicious Feed"}, feedEntry{ID: tc.name, Title: "Boundary", URL: "urn:malicious:" + strings.ReplaceAll(tc.name, " ", "-"), Description: "fallback text for model boundary validation"}, fakeSummaryLLM{out: tc.out}, ProcessingLanguageEnglish)
			if err != nil {
				t.Fatalf("buildItem returned error: %v", err)
			}
			if item.ModelStatus == modelStatusOK {
				t.Fatalf("buildItem persisted ok model status for invalid output: %+v", item)
			}
			if item.Summary != nil || item.CoreInsight != nil || item.ValueTier != nil {
				t.Fatalf("buildItem retained invalid LLM fields: summary=%v core=%v value_tier=%v", item.Summary, item.CoreInsight, item.ValueTier)
			}
		})
	}
}

func TestMaliciousFakeLLMRejectedBeforeOKPersistenceInReprocess(t *testing.T) {
	ctx := context.Background()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `<html><body><article>available body for reprocess boundary validation</article></body></html>`)
	}))
	t.Cleanup(server.Close)

	valid := OpenRouterSummaryOutput{Title: "Processed title", Summary: "Dense source backed summary.", CoreInsight: "One source backed insight.", FeedExcerpt: "Processed excerpt.", ExtractedText: "Processed body.", ValueTier: "high", ModelStatus: modelStatusOK}
	for _, tc := range []struct {
		name string
		out  OpenRouterSummaryOutput
	}{
		{name: "empty summary", out: withSummaryOutput(valid, func(out *OpenRouterSummaryOutput) { out.Summary = "" })},
		{name: "empty core insight", out: withSummaryOutput(valid, func(out *OpenRouterSummaryOutput) { out.CoreInsight = "" })},
		{name: "invalid value tier", out: withSummaryOutput(valid, func(out *OpenRouterSummaryOutput) { out.ValueTier = "viral" })},
	} {
		t.Run(tc.name, func(t *testing.T) {
			outcome, err := processReprocessItem(ctx, reprocessItem{id: "item_" + strings.ReplaceAll(tc.name, " ", "_"), sourceTitle: "Malicious Feed", title: "Stored title", url: server.URL + "/article"}, fakeSummaryLLM{out: tc.out}, ProcessingLanguageEnglish)
			if err != nil {
				t.Fatalf("processReprocessItem returned error: %v", err)
			}
			if outcome.writable() || outcome.modelStatus == modelStatusOK {
				t.Fatalf("processReprocessItem produced writable ok outcome for invalid output: %+v", outcome)
			}
			if !outcome.unavailable || outcome.errorCode != ReprocessErrorSummaryUnavailable {
				t.Fatalf("processReprocessItem outcome = %+v, want summary-unavailable preservation path", outcome)
			}
		})
	}
}

func TestArchitectureRecognizedServeFlagsIncludesFirstFetchLimit(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "docs", "ARCHITECTURE.md"))
	if err != nil {
		t.Fatalf("read docs/ARCHITECTURE.md: %v", err)
	}
	doc := string(data)
	if !strings.Contains(doc, "Required/recognized flags:") || !strings.Contains(doc, "`--first-fetch-limit`") {
		t.Fatalf("docs/ARCHITECTURE.md recognized serve flags must include --first-fetch-limit")
	}
}

type fakeSummaryLLM struct {
	out OpenRouterSummaryOutput
}

func (f fakeSummaryLLM) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return f.out, nil
}

func (f fakeSummaryLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

func withSummaryOutput(base OpenRouterSummaryOutput, mutate func(*OpenRouterSummaryOutput)) OpenRouterSummaryOutput {
	mutate(&base)
	return base
}
