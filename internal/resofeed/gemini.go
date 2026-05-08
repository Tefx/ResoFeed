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
	"time"
)

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
	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = DefaultGeminiModel
	}
	return &geminiHTTPClient{
		apiKey:   cfg.APIKey,
		model:    model,
		endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
		client: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

type geminiHTTPClient struct {
	apiKey   string
	model    string
	endpoint string
	client   *http.Client
}

func (c *geminiHTTPClient) SummarizeItem(ctx context.Context, input GeminiSummaryInput) (GeminiSummaryOutput, error) {
	if strings.TrimSpace(input.AvailableText) == "" {
		return GeminiSummaryOutput{ModelStatus: "summary_unavailable"}, errors.New("gemini summarize: available_text required")
	}
	prompt := map[string]any{
		"task": "summarize_rss_item",
		"contract": map[string]any{
			"response_json_only":  true,
			"fields":              []string{"summary", "core_insight", "value_tier", "model_status"},
			"model_status_values": []string{"ok", "summary_unavailable", "model_latency_error"},
		},
		"item": input,
	}
	var out GeminiSummaryOutput
	if err := c.generateJSON(ctx, prompt, &out); err != nil {
		return GeminiSummaryOutput{ModelStatus: "model_latency_error"}, fmt.Errorf("gemini summarize: %w", err)
	}
	out.Summary = strings.TrimSpace(out.Summary)
	out.CoreInsight = strings.TrimSpace(out.CoreInsight)
	out.ValueTier = strings.TrimSpace(out.ValueTier)
	out.ModelStatus = strings.TrimSpace(out.ModelStatus)
	if out.ModelStatus == "" {
		out.ModelStatus = "ok"
	}
	if out.ModelStatus != "ok" && out.ModelStatus != "summary_unavailable" && out.ModelStatus != "model_latency_error" {
		return GeminiSummaryOutput{ModelStatus: "summary_unavailable"}, fmt.Errorf("gemini summarize: invalid model_status %q", out.ModelStatus)
	}
	if out.ModelStatus == "ok" && (out.Summary == "" || out.CoreInsight == "") {
		return GeminiSummaryOutput{ModelStatus: "summary_unavailable"}, errors.New("gemini summarize: summary and core_insight required")
	}
	return out, nil
}

func (c *geminiHTTPClient) TranslateSteering(ctx context.Context, input GeminiSteeringInput) (GeminiSteeringOutput, error) {
	if strings.TrimSpace(input.Command) == "" {
		return GeminiSteeringOutput{}, errors.New("gemini steering: command required")
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
	var out GeminiSteeringOutput
	if err := c.generateJSON(ctx, prompt, &out); err != nil {
		return GeminiSteeringOutput{}, fmt.Errorf("gemini steering: %w", err)
	}
	out.InterpretedAs = strings.TrimSpace(out.InterpretedAs)
	out.Message = strings.TrimSpace(out.Message)
	for i := range out.RuleTexts {
		out.RuleTexts[i] = strings.TrimSpace(out.RuleTexts[i])
	}
	if out.InterpretedAs == "" || out.Message == "" {
		return GeminiSteeringOutput{}, errors.New("gemini steering: interpreted_as and message required")
	}
	return out, nil
}

func (c *geminiHTTPClient) generateJSON(ctx context.Context, payload any, dst any) error {
	if c == nil {
		return errors.New("nil gemini client")
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
	reqBody, err := json.Marshal(geminiGenerateRequest{
		Contents: []geminiContent{{Parts: []geminiPart{{Text: string(promptBytes)}}}},
		GenerationConfig: geminiGenerationConfig{
			ResponseMIMEType: "application/json",
		},
	})
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
			lastErr = fmt.Errorf("status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
			if attempt == 0 {
				continue
			}
			return lastErr
		}
		if resp.StatusCode < 200 || resp.StatusCode > 299 {
			return fmt.Errorf("status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		}
		var generated geminiGenerateResponse
		if err := json.Unmarshal(body, &generated); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
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

func (c *geminiHTTPClient) requestURL() string {
	base := strings.TrimRight(c.endpoint, "/")
	return fmt.Sprintf("%s/%s:generateContent?key=%s", base, c.model, c.apiKey)
}

type geminiGenerateRequest struct {
	Contents         []geminiContent        `json:"contents"`
	GenerationConfig geminiGenerationConfig `json:"generationConfig"`
}

type geminiGenerationConfig struct {
	ResponseMIMEType string `json:"responseMimeType"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiGenerateResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
}

func (r geminiGenerateResponse) firstText() string {
	if len(r.Candidates) == 0 || len(r.Candidates[0].Content.Parts) == 0 {
		return ""
	}
	return strings.TrimSpace(r.Candidates[0].Content.Parts[0].Text)
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
