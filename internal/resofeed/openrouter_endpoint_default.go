//go:build !resofeed_e2e

package resofeed

// deterministicOpenRouterEndpointForE2E is intentionally inert in normal
// builds: production runtime must use the canonical OpenRouter endpoint unless
// tests inject OpenRouterConfig.Endpoint directly.
func deterministicOpenRouterEndpointForE2E() string {
	return ""
}
