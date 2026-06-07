package resofeed

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	tavilyExtractEndpointEnvName = "RESOFEED_TAVILY_EXTRACT_ENDPOINT"
	tavilyDefaultExtractEndpoint = "https://api.tavily.com/extract"
	tavilyExtractTimeoutSeconds  = 30
	tavilyMaxResponseBytes       = 1 << 20
)

var errTavilyURLIneligible = errors.New("tavily url ineligible")

type tavilyExtractError struct {
	code    ReprocessErrorCode
	message string
}

func (e *tavilyExtractError) Error() string {
	if e == nil || strings.TrimSpace(e.message) == "" {
		return "tavily extract failed"
	}
	return "tavily extract: " + e.message
}

func tryTavilyExtractArticleText(ctx context.Context, articleURL string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	articleURL = strings.TrimSpace(articleURL)
	if !isTavilyEligibleArticleURL(articleURL) {
		return "", errTavilyURLIneligible
	}
	secret, configured, err := ResolveTavilyRuntimeSecretOptional()
	if err != nil {
		return "", err
	}
	if !configured {
		return "", errTavilyKeyMissing
	}
	apiKey := secret.Value
	endpoint := strings.TrimSpace(os.Getenv(tavilyExtractEndpointEnvName))
	if endpoint == "" {
		endpoint = tavilyDefaultExtractEndpoint
	}
	return tavilyExtractArticleText(ctx, http.DefaultClient, endpoint, apiKey, articleURL)
}

func tavilyExtractArticleText(ctx context.Context, client *http.Client, endpoint string, apiKey string, articleURL string) (text string, retErr error) {
	if client == nil {
		client = http.DefaultClient
	}
	ctx, cancel := context.WithTimeout(ctx, tavilyExtractTimeoutSeconds*time.Second)
	defer cancel()

	body, err := json.Marshal(map[string]any{
		"urls":           []string{articleURL},
		"extract_depth":  "advanced",
		"format":         "markdown",
		"include_images": false,
		"timeout":        tavilyExtractTimeoutSeconds,
	})
	if err != nil {
		return "", fmt.Errorf("tavily extract: marshal request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", &tavilyExtractError{code: ReprocessErrorProviderError, message: string(ReprocessErrorProviderError)}
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.DeadlineExceeded) || errors.Is(ctx.Err(), context.Canceled) {
			return "", err
		}
		return "", &tavilyExtractError{code: ReprocessErrorProviderError, message: string(ReprocessErrorProviderError)}
	}
	defer func() {
		if err := resp.Body.Close(); err != nil && retErr == nil {
			retErr = &tavilyExtractError{code: ReprocessErrorProviderError, message: string(ReprocessErrorProviderError)}
		}
	}()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return "", &tavilyExtractError{code: ReprocessErrorProviderError, message: string(ReprocessErrorProviderError)}
	}
	payload, err := io.ReadAll(io.LimitReader(resp.Body, tavilyMaxResponseBytes+1))
	if err != nil {
		return "", &tavilyExtractError{code: ReprocessErrorProviderError, message: string(ReprocessErrorProviderError)}
	}
	if len(payload) > tavilyMaxResponseBytes {
		return "", &tavilyExtractError{code: ReprocessErrorProviderError, message: string(ReprocessErrorProviderError)}
	}
	var decoded tavilyExtractResponse
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return "", &tavilyExtractError{code: ReprocessErrorProviderError, message: string(ReprocessErrorProviderError)}
	}
	if len(decoded.Results) == 0 {
		return "", &tavilyExtractError{code: ReprocessErrorProviderError, message: string(ReprocessErrorProviderError)}
	}
	raw := strings.TrimSpace(decoded.Results[0].RawContent)
	if raw == "" {
		return "", &tavilyExtractError{code: ReprocessErrorOriginalUnavailable, message: string(ReprocessErrorOriginalUnavailable)}
	}
	cleaned, ok := sanitizeExternalEvidenceText(raw)
	if !ok {
		return "", &tavilyExtractError{code: ReprocessErrorOriginalUnavailable, message: string(ReprocessErrorOriginalUnavailable)}
	}
	return cleaned, nil
}

type tavilyExtractResponse struct {
	Results []struct {
		URL        string `json:"url"`
		RawContent string `json:"raw_content"`
	} `json:"results"`
	FailedResults []struct {
		URL   string `json:"url"`
		Error string `json:"error"`
	} `json:"failed_results"`
}

func isTavilyEligibleArticleURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed == nil {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}
	if parsed.User != nil {
		return false
	}
	host := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	if host == "" || host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return false
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return true
	}
	return isPublicTavilyIP(ip)
}

func isPublicTavilyIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	return !ip.IsLoopback() && !ip.IsPrivate() && !ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast() && !ip.IsMulticast() && !ip.IsUnspecified()
}
