package resofeed

import "context"

// GeminiClient is defined at the use boundary for the external JSON transformer.
// Gemini never owns durable state, orchestration, or direct database writes.
type GeminiClient interface {
	SummarizeItem(ctx context.Context, input GeminiSummaryInput) (GeminiSummaryOutput, error)
	TranslateSteering(ctx context.Context, input GeminiSteeringInput) (GeminiSteeringOutput, error)
}

// GeminiConfig contains Gemini request/response JSON transformer configuration.
type GeminiConfig struct {
	APIKey string
	Model  string
}

// NewGeminiClient constructs the Gemini JSON transformer client.
func NewGeminiClient(cfg GeminiConfig) GeminiClient {
	panic("TODO contract stub: construct Gemini client")
}

// GeminiSummaryInput is the summary transform request. It is populated only
// after source text or fallback feed text exists.
type GeminiSummaryInput struct {
	ItemID        string `json:"item_id"`
	Title         string `json:"title"`
	SourceTitle   string `json:"source_title"`
	URL           string `json:"url"`
	AvailableText string `json:"available_text"`
}

// GeminiSummaryOutput is validated before saving summary metadata.
type GeminiSummaryOutput struct {
	Summary     string `json:"summary"`
	CoreInsight string `json:"core_insight"`
	ValueTier   string `json:"value_tier"`
	ModelStatus string `json:"model_status"`
}

// GeminiSteeringInput asks Gemini to translate natural language only when Go
// cannot deterministically classify a source URL or command.
type GeminiSteeringInput struct {
	Command     string      `json:"command"`
	ActorKind   ActorKind   `json:"actor_kind"`
	ActiveRules []SteerRule `json:"active_rules"`
}

// GeminiSteeringOutput is a proposal; Go validates product invariants and owns
// the final SQLite transaction.
type GeminiSteeringOutput struct {
	InterpretedAs string   `json:"interpreted_as"`
	RuleTexts     []string `json:"rule_texts"`
	Message       string   `json:"message"`
}
