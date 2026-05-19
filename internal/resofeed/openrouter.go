package resofeed

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// LLMClient is defined at the use boundary for the external JSON transformer.
// The model never owns durable state, orchestration, or direct database writes.
type LLMClient interface {
	SummarizeItem(ctx context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error)
	TranslateSteering(ctx context.Context, input OpenRouterSteeringInput) (OpenRouterSteeringOutput, error)
}

// OpenRouterConfig contains OpenRouter request/response JSON transformer configuration.
type OpenRouterConfig struct {
	APIKey string
	Model  string
	// Endpoint is only set by test harnesses that replace the external
	// OpenRouter transport with a deterministic local HTTP server. Production
	// runtime leaves this empty and uses the canonical OpenRouter endpoint.
	Endpoint string
}

// NewOpenRouterClient constructs the OpenRouter JSON transformer client.
func NewOpenRouterClient(cfg OpenRouterConfig) LLMClient {
	endpoint := strings.TrimSpace(cfg.Endpoint)
	if endpoint == "" {
		endpoint = "https://openrouter.ai"
	}
	return &openRouterHTTPClient{
		apiKey:   cfg.APIKey,
		model:    cfg.Model,
		endpoint: endpoint,
		client: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

type openRouterHTTPClient struct {
	apiKey        string
	model         string
	endpoint      string
	client        *http.Client
	resolvedMu    sync.Mutex
	resolvedModel string
}

func (c *openRouterHTTPClient) ConfiguredModel() string {
	if c == nil {
		return ""
	}
	return strings.TrimSpace(c.model)
}

func (c *openRouterHTTPClient) ResolvedModel() string {
	if c == nil {
		return ""
	}
	c.resolvedMu.Lock()
	defer c.resolvedMu.Unlock()
	return c.resolvedModel
}

func (c *openRouterHTTPClient) setResolvedModel(model string) {
	trimmed := strings.TrimSpace(model)
	if c == nil || trimmed == "" {
		return
	}
	c.resolvedMu.Lock()
	c.resolvedModel = trimmed
	c.resolvedMu.Unlock()
}

func (c *openRouterHTTPClient) SummarizeItem(ctx context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	if strings.TrimSpace(input.AvailableText) == "" {
		return OpenRouterSummaryOutput{ModelStatus: "summary_unavailable"}, errors.New("openrouter summarize: available_text required")
	}
	prompt := map[string]any{
		"task": "summarize_rss_item",
		"contract": map[string]any{
			"response_json_only":   true,
			"fields":               []string{"title", "feed_excerpt", "extracted_text", "summary", "core_insight", "value_tier", "model_status"},
			"model_status_values":  []string{"ok", "summary_unavailable", "model_latency_error"},
			"target_language_rule": "Write all user-readable output fields in item.target_language. When available_text exists and model_status is ok, translate title, feed_excerpt, extracted_text, summary, and core_insight into item.target_language; do not copy original-language body or excerpt text for feed_excerpt/extracted_text. Keep URLs, source identifiers, and provenance literal and untranslated; source titles also remain literal.",
		},
		"item": input,
	}
	var out OpenRouterSummaryOutput
	if err := c.generateJSON(ctx, prompt, &out); err != nil {
		return OpenRouterSummaryOutput{ModelStatus: "model_latency_error"}, fmt.Errorf("openrouter summarize: %w", err)
	}
	out.Summary = strings.TrimSpace(out.Summary)
	out.CoreInsight = strings.TrimSpace(out.CoreInsight)
	out.ValueTier = strings.TrimSpace(out.ValueTier)
	out.Title = strings.TrimSpace(out.Title)
	out.FeedExcerpt = strings.TrimSpace(out.FeedExcerpt)
	out.ExtractedText = strings.TrimSpace(out.ExtractedText)
	out.ModelStatus = strings.TrimSpace(out.ModelStatus)
	if out.ModelStatus == "" {
		out.ModelStatus = "ok"
	}
	if out.ModelStatus != "ok" && out.ModelStatus != "summary_unavailable" && out.ModelStatus != "model_latency_error" {
		return OpenRouterSummaryOutput{ModelStatus: "summary_unavailable"}, fmt.Errorf("openrouter summarize: invalid model_status %q", out.ModelStatus)
	}
	if out.ModelStatus == "ok" && (out.Summary == "" || out.CoreInsight == "") {
		return OpenRouterSummaryOutput{ModelStatus: "summary_unavailable"}, errors.New("openrouter summarize: summary and core_insight required")
	}
	return out, nil
}

func (c *openRouterHTTPClient) TranslateSteering(ctx context.Context, input OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	if strings.TrimSpace(input.Command) == "" {
		return OpenRouterSteeringOutput{}, errors.New("openrouter steering: command required")
	}
	prompt := map[string]any{
		"task": "translate_steering",
		"contract": map[string]any{
			"response_json_only": true,
			"fields":             []string{"interpreted_as", "rule_texts", "message"},
			"note":               "proposal only; Go validates invariants and writes state",
		},
		"steering": input,
	}
	var out OpenRouterSteeringOutput
	if err := c.generateJSON(ctx, prompt, &out); err != nil {
		return OpenRouterSteeringOutput{}, fmt.Errorf("openrouter steering: %w", err)
	}
	out.InterpretedAs = strings.TrimSpace(out.InterpretedAs)
	out.Message = strings.TrimSpace(out.Message)
	for i := range out.RuleTexts {
		out.RuleTexts[i] = strings.TrimSpace(out.RuleTexts[i])
	}
	if out.InterpretedAs == "" || out.Message == "" {
		return OpenRouterSteeringOutput{}, errors.New("openrouter steering: interpreted_as and message required")
	}
	return out, nil
}

func (c *openRouterHTTPClient) generateJSON(ctx context.Context, payload any, dst any) error {
	if c == nil {
		return errors.New("nil openrouter client")
	}
	if strings.TrimSpace(c.apiKey) == "" {
		return errors.New("api key required")
	}
	client := c.client
	if client == nil {
		client = http.DefaultClient
	}
	promptBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal prompt: %w", err)
	}
	reqPayload := openRouterChatRequest{
		Messages: []openRouterMessage{{Role: "user", Content: string(promptBytes)}},
		ResponseFormat: map[string]string{
			"type": "json_object",
		},
	}
	if strings.TrimSpace(c.model) != "" {
		reqPayload.Model = strings.TrimSpace(c.model)
	}
	reqBody, err := json.Marshal(reqPayload)
	if err != nil {
		return fmt.Errorf("marshal request: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.requestURL(), bytes.NewReader(reqBody))
		if err != nil {
			return fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(c.apiKey))
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			if attempt == 0 && ctx.Err() == nil {
				continue
			}
			return err
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		closeErr := resp.Body.Close()
		if readErr != nil {
			return fmt.Errorf("read response: %w", readErr)
		}
		if closeErr != nil {
			return fmt.Errorf("close response: %w", closeErr)
		}
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("status %d", resp.StatusCode)
			if attempt == 0 {
				continue
			}
			return lastErr
		}
		if resp.StatusCode < 200 || resp.StatusCode > 299 {
			return fmt.Errorf("status %d", resp.StatusCode)
		}
		var providerErr openRouterErrorResponse
		if err := json.Unmarshal(body, &providerErr); err == nil && providerErr.Error.Message != "" {
			return fmt.Errorf("provider error status %d", resp.StatusCode)
		}
		var generated openRouterChatResponse
		if err := json.Unmarshal(body, &generated); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
		c.setResolvedModel(generated.Model)
		text := generated.firstText()
		if text == "" {
			return errors.New("empty response text")
		}
		if err := json.Unmarshal([]byte(stripJSONFence(text)), dst); err != nil {
			return fmt.Errorf("decode model json: %w", err)
		}
		return nil
	}
	return lastErr
}

func (c *openRouterHTTPClient) requestURL() string {
	base := strings.TrimRight(c.endpoint, "/")
	if strings.HasSuffix(base, "/api/v1/chat/completions") {
		return base
	}
	return base + "/api/v1/chat/completions"
}

type openRouterChatRequest struct {
	Model          string              `json:"model,omitempty"`
	Messages       []openRouterMessage `json:"messages"`
	ResponseFormat map[string]string   `json:"response_format"`
}

type openRouterMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openRouterChatResponse struct {
	Model   string `json:"model"`
	Choices []struct {
		Message openRouterMessage `json:"message"`
	} `json:"choices"`
	Candidates []struct {
		Content openRouterCandidateContent `json:"content"`
	} `json:"candidates"`
}

func (r openRouterChatResponse) firstText() string {
	if len(r.Choices) > 0 {
		return strings.TrimSpace(r.Choices[0].Message.Content)
	}
	if len(r.Candidates) > 0 && len(r.Candidates[0].Content.Parts) > 0 {
		return strings.TrimSpace(r.Candidates[0].Content.Parts[0].Text)
	}
	return ""
}

type openRouterErrorResponse struct {
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

type openRouterCandidateContent struct {
	Parts []openRouterCandidatePart `json:"parts"`
}

type openRouterCandidatePart struct {
	Text string `json:"text"`
}

func stripJSONFence(text string) string {
	trimmed := strings.TrimSpace(text)
	if !strings.HasPrefix(trimmed, "```") {
		return trimmed
	}
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(trimmed), "json"))
	if idx := strings.LastIndex(trimmed, "```"); idx >= 0 {
		trimmed = trimmed[:idx]
	}
	return strings.TrimSpace(trimmed)
}

// OpenRouterSummaryInput is the summary transform request. It is populated only
// after source text or fallback feed text exists.
type OpenRouterSummaryInput struct {
	ItemID         string             `json:"item_id"`
	Title          string             `json:"title"`
	SourceTitle    string             `json:"source_title"`
	URL            string             `json:"url"`
	AvailableText  string             `json:"available_text"`
	TargetLanguage ProcessingLanguage `json:"target_language"`
}

// OpenRouterSummaryOutput is validated before saving summary metadata.
type OpenRouterSummaryOutput struct {
	Title         string `json:"title"`
	FeedExcerpt   string `json:"feed_excerpt"`
	ExtractedText string `json:"extracted_text"`
	Summary       string `json:"summary"`
	CoreInsight   string `json:"core_insight"`
	ValueTier     string `json:"value_tier"`
	ModelStatus   string `json:"model_status"`
}

// OpenRouterSteeringInput asks OpenRouter to translate natural language only
// when Go cannot deterministically classify a source URL or command.
type OpenRouterSteeringInput struct {
	Command     string      `json:"command"`
	ActorKind   ActorKind   `json:"actor_kind"`
	ActiveRules []SteerRule `json:"active_rules"`
}

// OpenRouterSteeringOutput is a proposal; Go validates product invariants and
// owns the final SQLite transaction.
type OpenRouterSteeringOutput struct {
	InterpretedAs string   `json:"interpreted_as"`
	RuleTexts     []string `json:"rule_texts"`
	Message       string   `json:"message"`
}
