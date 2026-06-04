//go:build resofeed_e2e

package resofeed

import (
	"os"
	"strings"
)

// deterministicOpenRouterEndpointForE2E is compiled only into the Playwright
// e2e binary so the external-process harness can replace OpenRouter with a
// deterministic local server without adding a production endpoint flag.
func deterministicOpenRouterEndpointForE2E() string {
	if os.Getenv("RESOFEED_E2E") != "1" {
		return ""
	}
	return strings.TrimSpace(os.Getenv("RESOFEED_E2E_OPENROUTER_ENDPOINT"))
}
