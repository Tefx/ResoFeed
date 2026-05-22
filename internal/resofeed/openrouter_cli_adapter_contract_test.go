package resofeed

// expected_result: red
// OpenRouter CLI/adapter contract tests encode the intended migration surface
// before the product runtime has fully removed legacy Gemini seams.

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

const (
	fakeOpenRouterOSKey     = "orfake_os_secret_for_openrouter_contract_tests_only"
	fakeOpenRouterDotEnvKey = "orfake_dotenv_secret_for_openrouter_contract_tests_only"
	fakeOpenRouterModel     = "openai/gpt-4.1-mini"
)

func TestOpenRouterCLIRejectsLegacyGeminiFlags(t *testing.T) {
	for _, tc := range []struct {
		name string
		args []string
	}{
		{name: "legacy gemini api key flag", args: []string{"--gemini-api-key", "legacy-fake-gemini-key"}},
		{name: "legacy gemini model flag", args: []string{"--gemini-model", "gemini-2.5-flash"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			withoutGeminiAPIKeyEnv(t)
			t.Setenv("OPENROUTER_KEY", fakeOpenRouterOSKey)
			stdout, stderr, code := runOpenRouterServeUntilBindFailure(t, tc.args)
			if code != 2 || !strings.Contains(stderr, "flag provided but not defined") {
				t.Fatalf("legacy Gemini flag should be rejected as unknown after OpenRouter migration: code=%d stdout=%q stderr=%q", code, redactOpenRouterContractOutput(stdout), redactOpenRouterContractOutput(stderr))
			}
			assertOpenRouterContractOutputRedacted(t, stdout, stderr)
		})
	}
}

func TestOpenRouterRuntimeSecretSourceAndModelFlags(t *testing.T) {
	t.Run("local dotenv can satisfy startup without printing key", func(t *testing.T) {
		withoutGeminiAPIKeyEnv(t)
		withoutOpenRouterKeyEnv(t)
		writeLocalDotEnv(t, "# fake local OpenRouter secret\nOPENROUTER_KEY="+fakeOpenRouterDotEnvKey+"\n")

		stdout, stderr, code := runOpenRouterServeUntilBindFailure(t, nil)
		if code != 1 || !strings.Contains(stderr, "runtime_failed") {
			t.Fatalf(".env OPENROUTER_KEY should pass startup validation before bind failure: code=%d stdout=%q stderr=%q", code, redactOpenRouterContractOutput(stdout), redactOpenRouterContractOutput(stderr))
		}
		assertOpenRouterContractOutputRedacted(t, stdout, stderr)
	})

	t.Run("OS environment overrides local dotenv", func(t *testing.T) {
		withoutGeminiAPIKeyEnv(t)
		t.Setenv("OPENROUTER_KEY", fakeOpenRouterOSKey)
		writeLocalDotEnv(t, "OPENROUTER_KEY="+fakeOpenRouterDotEnvKey+"\n")

		stdout, stderr, code := runOpenRouterServeUntilBindFailure(t, nil)
		if code != 1 || !strings.Contains(stderr, "runtime_failed") {
			t.Fatalf("OS OPENROUTER_KEY should take precedence and pass startup validation before bind failure: code=%d stdout=%q stderr=%q", code, redactOpenRouterContractOutput(stdout), redactOpenRouterContractOutput(stderr))
		}
		assertOpenRouterContractOutputRedacted(t, stdout, stderr)
	})

	for _, tc := range []struct {
		name string
		env  string
		dot  string
	}{
		{name: "empty OS env", env: ""},
		{name: "whitespace OS env", env: " \t "},
		{name: "empty dotenv", dot: "OPENROUTER_KEY=\n"},
		{name: "whitespace dotenv", dot: "OPENROUTER_KEY= \t \n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			withoutGeminiAPIKeyEnv(t)
			withoutOpenRouterKeyEnv(t)
			if tc.env != "" || strings.Contains(tc.name, "empty OS") {
				t.Setenv("OPENROUTER_KEY", tc.env)
			}
			if tc.dot != "" {
				writeLocalDotEnv(t, tc.dot)
			}

			stdout, stderr, code := runOpenRouterServeUntilBindFailure(t, nil)
			if code != 2 || !strings.Contains(stderr, "invalid_openrouter_key: value required") {
				t.Fatalf("empty/whitespace OpenRouter key should fail with redacted deterministic error: code=%d stdout=%q stderr=%q", code, redactOpenRouterContractOutput(stdout), redactOpenRouterContractOutput(stderr))
			}
			assertOpenRouterContractOutputRedacted(t, stdout, stderr)
		})
	}

	for _, tc := range []struct {
		name string
		args []string
	}{
		{name: "omitted openrouter model means account default", args: nil},
		{name: "empty openrouter model is accepted", args: []string{"--openrouter-model", ""}},
		{name: "explicit openrouter model is accepted without network validation", args: []string{"--openrouter-model", fakeOpenRouterModel}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			withoutGeminiAPIKeyEnv(t)
			t.Setenv("OPENROUTER_KEY", fakeOpenRouterOSKey)
			stdout, stderr, code := runOpenRouterServeUntilBindFailure(t, tc.args)
			if code != 1 || !strings.Contains(stderr, "runtime_failed") {
				t.Fatalf("OpenRouter model flag should be optional/non-secret and not trigger startup network validation: code=%d stdout=%q stderr=%q", code, redactOpenRouterContractOutput(stdout), redactOpenRouterContractOutput(stderr))
			}
			assertOpenRouterContractOutputRedacted(t, stdout, stderr)
		})
	}
}

func TestOpenRouterAdapterRequestContractWithFakeServer(t *testing.T) {
	for _, tc := range []struct {
		name      string
		model     string
		wantModel bool
	}{
		{name: "empty model omits model field", model: "", wantModel: false},
		{name: "explicit model is passed unchanged", model: fakeOpenRouterModel, wantModel: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var gotPath, gotAuth string
			var gotBody map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodGet && r.URL.Path == "/api/v1/models" {
					writeOpenRouterModelsMetadata(t, w, fakeOpenRouterModel)
					return
				}
				gotPath = r.URL.Path
				gotAuth = r.Header.Get("Authorization")
				if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
					t.Fatalf("decode fake OpenRouter request body: %v", err)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"summary\":\"Dense summary\",\"core_insight\":\"Core insight\",\"value_tier\":\"high\",\"model_status\":\"ok\"}"}]}}]}`))
			}))
			defer server.Close()

			client := &openRouterHTTPClient{apiKey: fakeOpenRouterOSKey, model: tc.model, endpoint: strings.TrimRight(server.URL, "/"), client: server.Client()}
			_, err := client.SummarizeItem(context.Background(), OpenRouterSummaryInput{ItemID: "item_1", Title: "Item", SourceTitle: "Source", URL: "https://example.test/item", AvailableText: "body"})
			if err != nil {
				t.Fatalf("fake OpenRouter summary request should decode JSON-mode response: %v", err)
			}

			if gotPath != "/api/v1/chat/completions" {
				t.Errorf("OpenRouter request path = %q, want /api/v1/chat/completions", gotPath)
			}
			if gotAuth != "Bearer "+fakeOpenRouterOSKey {
				t.Errorf("OpenRouter Authorization header = %q, want bearer token from resolved key", redactOpenRouterContractOutput(gotAuth))
			}
			if _, ok := gotBody["response_format"].(map[string]any); !ok {
				t.Errorf("OpenRouter request body missing response_format JSON-mode object: %#v", gotBody["response_format"])
			}
			model, hasModel := gotBody["model"].(string)
			if tc.wantModel {
				if !hasModel || model != tc.model {
					t.Errorf("OpenRouter model field = %q (present=%v), want unchanged %q", model, hasModel, tc.model)
				}
			} else if _, ok := gotBody["model"]; ok {
				t.Errorf("OpenRouter model field should be omitted when empty; got %#v", gotBody["model"])
			}
		})
	}
}

func TestOpenRouterAdapterRetryAndSafeErrorMapping(t *testing.T) {
	t.Run("429 and 5xx are retried", func(t *testing.T) {
		for _, status := range []int{http.StatusTooManyRequests, http.StatusInternalServerError} {
			t.Run(http.StatusText(status), func(t *testing.T) {
				var attempts atomic.Int32
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if attempts.Add(1) == 1 {
						http.Error(w, `{"error":{"message":"retry later"}}`, status)
						return
					}
					w.Header().Set("Content-Type", "application/json")
					_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"summary\":\"Dense summary\",\"core_insight\":\"Core insight\",\"value_tier\":\"high\",\"model_status\":\"ok\"}"}]}}]}`))
				}))
				defer server.Close()

				client := &openRouterHTTPClient{apiKey: fakeOpenRouterOSKey, model: fakeOpenRouterModel, endpoint: strings.TrimRight(server.URL, "/"), client: server.Client()}
				_, _ = client.SummarizeItem(context.Background(), OpenRouterSummaryInput{ItemID: "item_1", Title: "Item", SourceTitle: "Source", URL: "https://example.test/item", AvailableText: "body"})
				if got := attempts.Load(); got != 2 {
					t.Fatalf("status %d attempts = %d, want one retry", status, got)
				}
			})
		}
	})

	t.Run("invalid JSON and provider error responses return safe errors", func(t *testing.T) {
		for _, tc := range []struct {
			name   string
			status int
			body   string
		}{
			{name: "invalid json", status: http.StatusOK, body: `not-json`},
			{name: "provider error", status: http.StatusBadRequest, body: `{"error":{"message":"bad request"}}`},
		} {
			t.Run(tc.name, func(t *testing.T) {
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.WriteHeader(tc.status)
					_, _ = w.Write([]byte(tc.body))
				}))
				defer server.Close()

				client := &openRouterHTTPClient{apiKey: fakeOpenRouterOSKey, model: fakeOpenRouterModel, endpoint: strings.TrimRight(server.URL, "/"), client: server.Client()}
				out, err := client.SummarizeItem(context.Background(), OpenRouterSummaryInput{ItemID: "item_1", Title: "Item", SourceTitle: "Source", URL: "https://example.test/item", AvailableText: "body"})
				if err == nil {
					t.Fatal("invalid JSON/provider error should return a safe Go error")
				}
				wantStatus := modelStatusProviderError
				if tc.name == "invalid json" {
					wantStatus = modelStatusDecodeError
				}
				if out.ModelStatus != wantStatus {
					t.Fatalf("safe failure model_status = %q, want %q", out.ModelStatus, wantStatus)
				}
				if strings.Contains(err.Error(), fakeOpenRouterOSKey) {
					t.Fatal("safe adapter error leaked fake OpenRouter key")
				}
			})
		}
	})
}

func TestOpenRouterDocsRuntimeSecretContract(t *testing.T) {
	root := findOpenRouterContractRepoRoot(t)
	for _, rel := range []string{"docs/ARCHITECTURE.md", "docs/USAGE.md", "README.md"} {
		t.Run(rel, func(t *testing.T) {
			body := readOpenRouterContractText(t, filepath.Join(root, rel))
			for _, forbidden := range []string{"--gemini-api-key", "--gemini-model", "GEMINI_API_KEY=<", "GEMINI_API_KEY=\"", "GEMINI_API_KEY="} {
				if strings.Contains(body, forbidden) {
					t.Fatalf("%s still documents Gemini runtime secret/model contract via %q", rel, forbidden)
				}
			}
			for _, required := range []string{"OPENROUTER_KEY", ".env", "--openrouter-model"} {
				if !strings.Contains(body, required) {
					t.Fatalf("%s missing OpenRouter docs term %q", rel, required)
				}
			}
			lowerBody := strings.ToLower(body)
			if !strings.Contains(lowerBody, "do not commit") && !strings.Contains(lowerBody, "must not be committed") && !strings.Contains(lowerBody, "never committed") {
				t.Fatalf("%s must reiterate local .env/secrets must not be committed", rel)
			}
			if strings.Contains(body, "--openrouter-api-key") || strings.Contains(body, "OPENROUTER_KEY=sk-") {
				t.Fatalf("%s must not require CLI secret flags or shell-history API key examples", rel)
			}
		})
	}
}

func runOpenRouterServeUntilBindFailure(t *testing.T, extraArgs []string) (string, string, int) {
	t.Helper()
	occupied := reserveRuntimeSecretTestAddr(t)
	defer func() {
		if err := occupied.Close(); err != nil {
			t.Errorf("close occupied listener: %v", err)
		}
	}()

	args := []string{"serve", "--addr", occupied.Addr().String(), "--db", filepath.Join(t.TempDir(), "resofeed.sqlite3"), "--owner-token", contractOwnerToken}
	args = append(args, extraArgs...)
	var stdout, stderr bytes.Buffer
	code := Main(args, &stdout, &stderr)
	return stdout.String(), stderr.String(), code
}

func withoutOpenRouterKeyEnv(t *testing.T) {
	t.Helper()
	old, ok := os.LookupEnv("OPENROUTER_KEY")
	if err := os.Unsetenv("OPENROUTER_KEY"); err != nil {
		t.Fatalf("unset OPENROUTER_KEY for test isolation: %v", err)
	}
	t.Cleanup(func() {
		if ok {
			_ = os.Setenv("OPENROUTER_KEY", old)
			return
		}
		_ = os.Unsetenv("OPENROUTER_KEY")
	})
}

func assertOpenRouterContractOutputRedacted(t *testing.T, outputs ...string) {
	t.Helper()
	for _, output := range outputs {
		for _, secret := range []string{fakeOpenRouterOSKey, fakeOpenRouterDotEnvKey} {
			if strings.Contains(output, secret) {
				t.Fatal("test output leaked a fake OpenRouter secret fixture value")
			}
		}
	}
}

func redactOpenRouterContractOutput(output string) string {
	replacer := strings.NewReplacer(
		fakeOpenRouterOSKey, "<redacted-openrouter-os-key>",
		fakeOpenRouterDotEnvKey, "<redacted-openrouter-dotenv-key>",
	)
	return replacer.Replace(output)
}

func findOpenRouterContractRepoRoot(t *testing.T) string {
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
			t.Fatal("could not locate repository root containing docs/ARCHITECTURE.md")
		}
		dir = parent
	}
}

func readOpenRouterContractText(t *testing.T, path string) string {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(body)
}
