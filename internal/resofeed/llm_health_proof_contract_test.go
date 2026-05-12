package resofeed

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestREG2026051206LLMHealthProofContractLocksObligations(t *testing.T) {
	contract := readLLMHealthProofContract(t)

	for _, required := range []string{
		"missing_live_model_configuration",
		"stale_database_prior_failures",
		"openrouter_client_timeout_or_error",
		"unresolved_product_regression",
		"/api/doctor` current response snapshot with any secrets redacted",
		"Current feed sample showing `model_status` and `value_tier`",
		"Deterministic stub control result",
		"Explicit live/stub distinction",
		"Fallback-only excerpt output, including UI text such as `fallback: excerpt-only`, is not live model success.",
		"Passing an isolated deterministic OpenRouter-compatible path proves request/response shape",
		"It does not prove that the current live server has a reachable provider",
		"new LLM orchestration",
		"persistence changes",
		"vector search, embeddings, RAG, or semantic answer engines",
		"app/domain/service/repository layers",
		"sidecar workers",
		"regression-live-llm-health-classification-fix",
		"regression-backend-mcp-llm-liveness-probe",
	} {
		if !strings.Contains(contract, required) {
			t.Fatalf("LLM health proof contract missing required text %q", required)
		}
	}
}

func readLLMHealthProofContract(t *testing.T) string {
	t.Helper()
	root := findLLMHealthProofRepoRoot(t)
	body, err := os.ReadFile(filepath.Join(root, "docs", "audits", "reg-2026-05-12-06-llm-health-proof-contract.md"))
	if err != nil {
		t.Fatalf("read LLM health proof contract: %v", err)
	}
	return string(body)
}

func findLLMHealthProofRepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "docs", "ARCHITECTURE.md")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("repo root with docs/ARCHITECTURE.md not found from %s", dir)
		}
		dir = parent
	}
}
