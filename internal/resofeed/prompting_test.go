package resofeed

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Legacy aliases keep historical test fixtures buildable while production uses
// only the Prompting v2.2 identity. The active-name adapter excludes _test.go.
const PromptingV21SchemaVersion = PromptingV22SchemaVersion
const promptingV21SystemPrompt = promptingV22SystemPrompt

type promptingV21Item = promptingV22Item
type promptingV21UserPayload = promptingV22UserPayload

func compilePromptingV21SummaryPrompt(input OpenRouterSummaryInput) (promptingV22SummaryPrompt, error) {
	return compilePromptingV22SummaryPrompt(input)
}

func promptingV21DocumentedContract() promptingV22Contract {
	return promptingV22DocumentedContract()
}

func promptingV21DocumentedQualityProfile() promptingV22QualityProfile {
	return promptingV22DocumentedQualityProfile()
}

func promptingV21RepairInstruction(code PromptValidationFailureCode) string {
	return promptingV22RepairInstruction(code)
}

func decodeStrictPromptingV21SummaryOutput(text string) (OpenRouterSummaryOutput, error) {
	return decodeStrictPromptingV22SummaryOutput(text)
}

func TestPromptingV22Payload(t *testing.T) {
	compiled, err := compilePromptingV22SummaryPrompt(OpenRouterSummaryInput{
		ItemID: "item-v22", Title: "Literal title", SourceTitle: "Literal source",
		URL: "https://example.test/item", AvailableText: "SQLite FTS5 stores lexical search data.",
		TargetLanguage: ProcessingLanguageEnglish, Prompt: "Focus on persistence.",
	})
	if err != nil {
		t.Fatalf("compile Prompting v2.2: %v", err)
	}
	if compiled.SystemPrompt != promptingV22SystemPrompt || compiled.UserPayload.SchemaVersion != PromptingV22SchemaVersion {
		t.Fatalf("Prompting v2.2 identity drift: %+v", compiled)
	}
	encoded, err := json.Marshal(compiled.UserPayload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	want := []string{"contract", "guidance", "item", "schema_version", "task"}
	got := make([]string, 0, len(payload))
	for key := range payload {
		got = append(got, key)
	}
	for i := 1; i < len(got); i++ {
		for j := i; j > 0 && got[j] < got[j-1]; j-- {
			got[j], got[j-1] = got[j-1], got[j]
		}
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("payload keys = %v, want %v", got, want)
	}
	fixtureData, err := os.ReadFile(filepath.Join("testdata", "prompting_v22", "fixtures.json"))
	if err != nil {
		t.Fatalf("read v2.2 fixtures: %v", err)
	}
	var fixtures []struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(fixtureData, &fixtures); err != nil {
		t.Fatalf("decode v2.2 fixtures: %v", err)
	}
	if len(fixtures) != 13 {
		t.Fatalf("v2.2 fixture count = %d, want 13", len(fixtures))
	}
}

func TestPromptingV22Validation(t *testing.T) {
	_, err := decodeStrictPromptingV22SummaryOutput(`{"localized_title":"Title","summary":"Summary","core_insight":"Insight.","key_points":["Point one.","Point two.","Point three."],"value_tier":"high","model_status":"ok","extra":true}`)
	if err == nil || promptValidationFailureCode(err) != PromptValidationSchemaInvalid {
		t.Fatalf("extra field validation = %v", err)
	}
}

func TestPromptingV22Repair(t *testing.T) {
	instruction := promptingV22RepairInstruction(PromptValidationCoreInsightShapeInvalid)
	if !strings.Contains(instruction, string(PromptValidationCoreInsightShapeInvalid)) || strings.Contains(instruction, "three attempts") {
		t.Fatalf("bounded repair instruction = %q", instruction)
	}
}

func TestPromptingV22Persistence(t *testing.T) {
	out := OpenRouterSummaryOutput{LocalizedTitle: "Title", Summary: "Source-backed summary.", CoreInsight: "Validation precedes persistence.", KeyPoints: []string{"SQLite stores content.", "Go validates output.", "FTS follows item state."}, ValueTier: "high", ModelStatus: modelStatusOK}
	validated, err := validateSummaryOutputForPersistenceWithPrompt(out, promptingV22Item{AvailableTextSource: "fresh_full_text", AvailableText: "SQLite stores content. Go validates output. FTS follows item state.", TargetLanguage: ProcessingLanguageEnglish})
	if err != nil {
		t.Fatalf("validate persistence output: %v", err)
	}
	if validated.Summary != out.Summary || len(validated.KeyPoints) != 3 {
		t.Fatalf("validated output drift: %+v", validated)
	}
}

func TestIngestV22(t *testing.T) {
	if PromptingV22SchemaVersion != "resofeed.summarize.v2.2" {
		t.Fatalf("ingest schema = %q", PromptingV22SchemaVersion)
	}
}

func TestReprocessV22(t *testing.T) {
	if got := promptingV22DocumentedContract().ModelStatusValues; !reflect.DeepEqual(got, []string{"ok", "summary_unavailable"}) {
		t.Fatalf("reprocess statuses = %v", got)
	}
}

func TestReingestV22(t *testing.T) {
	prompt := "  source-backed focus  "
	req, err := itemReingestRequestFromInputs(MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "v22-reingest"}, nil, &prompt, nil)
	if err != nil || req.Prompt == nil || *req.Prompt != "source-backed focus" {
		t.Fatalf("reingest request = %+v err=%v", req, err)
	}
}

func TestHTTPV22(t *testing.T) {
	if ItemReingestHTTPPathPrefix != "/api/items/" || ItemReingestHTTPPathSuffix != "/reingest" {
		t.Fatalf("HTTP reingest path = %q...%q", ItemReingestHTTPPathPrefix, ItemReingestHTTPPathSuffix)
	}
}

func TestMCPV22(t *testing.T) {
	schema := objectSchema([]string{"item_id", "actor_id", "idempotency_key"}, map[string]any{
		"item_id": map[string]any{"type": "string"},
		"model":   nullableStringSchema("Request-scoped model."),
		"prompt":  nullableStringSchema("Request-scoped prompt."),
	})
	properties, _ := schema["properties"].(map[string]any)
	for _, key := range []string{"item_id", "model", "prompt"} {
		if _, ok := properties[key]; !ok {
			t.Fatalf("MCP schema missing %q", key)
		}
	}
}
