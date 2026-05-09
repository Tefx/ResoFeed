package resofeed

import (
	"bytes"
	"context"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	fakeCLISecret    = "rfake_cli_secret_for_runtime_resolution_tests_only"
	fakeEnvSecret    = "rfake_env_secret_for_runtime_resolution_tests_only"
	fakeDotEnvSecret = "rfake_dotenv_secret_for_runtime_resolution_tests_only"
)

func TestOpenRouterRuntimeSecretResolutionFromOSEnvironment(t *testing.T) {
	t.Setenv("OPENROUTER_KEY", fakeEnvSecret)
	stdout, stderr, code := runServeUntilBindFailure(t, nil)

	if code != 1 || !strings.Contains(stderr, "runtime_failed") {
		t.Fatalf("OS environment OpenRouter key should pass startup validation before bind failure: code=%d stdout=%q stderr=%q", code, redactRuntimeSecretTestOutput(stdout), redactRuntimeSecretTestOutput(stderr))
	}
	assertRuntimeSecretTestOutputRedacted(t, stdout, stderr)
}

func TestOpenRouterRuntimeSecretResolutionFromLocalDotEnvFallback(t *testing.T) {
	withoutGeminiAPIKeyEnv(t)
	withoutOpenRouterKeyEnv(t)
	writeLocalDotEnv(t, "# local runtime secret fallback\n\nOPENROUTER_KEY="+fakeDotEnvSecret+"\n")

	stdout, stderr, code := runServeUntilBindFailure(t, nil)
	if code != 1 || !strings.Contains(stderr, "runtime_failed") {
		t.Fatalf("local .env OpenRouter key should pass startup validation before bind failure: code=%d stdout=%q stderr=%q", code, redactRuntimeSecretTestOutput(stdout), redactRuntimeSecretTestOutput(stderr))
	}
	assertRuntimeSecretTestOutputRedacted(t, stdout, stderr)
}

func TestOpenRouterRuntimeSecretPrecedenceAndEmptyValues(t *testing.T) {
	t.Run("OS environment beats local dotenv", func(t *testing.T) {
		t.Setenv("OPENROUTER_KEY", fakeEnvSecret)
		writeLocalDotEnv(t, "OPENROUTER_KEY="+fakeDotEnvSecret+"\n")
		stdout, stderr, code := runServeUntilBindFailure(t, nil)
		if code != 1 || !strings.Contains(stderr, "runtime_failed") {
			t.Fatalf("OS environment should take precedence over local .env before bind failure: code=%d stdout=%q stderr=%q", code, redactRuntimeSecretTestOutput(stdout), redactRuntimeSecretTestOutput(stderr))
		}
		assertRuntimeSecretTestOutputRedacted(t, stdout, stderr)
	})

	for _, tc := range []struct {
		name string
		env  string
		dot  string
	}{
		{name: "empty OS environment", env: ""},
		{name: "whitespace OS environment", env: " \t "},
		{name: "empty dotenv", dot: "OPENROUTER_KEY=\n"},
		{name: "whitespace dotenv", dot: "OPENROUTER_KEY= \t \n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			withoutOpenRouterKeyEnv(t)
			if tc.env != "" || strings.Contains(tc.name, "empty OS") {
				t.Setenv("OPENROUTER_KEY", tc.env)
			}
			if tc.dot != "" {
				writeLocalDotEnv(t, tc.dot)
			}
			stdout, stderr, code := runServeUntilBindFailure(t, nil)
			if code != 2 || !strings.Contains(stderr, "invalid_openrouter_key") {
				t.Fatalf("empty/whitespace OpenRouter key should fail deterministically: code=%d stdout=%q stderr=%q", code, redactRuntimeSecretTestOutput(stdout), redactRuntimeSecretTestOutput(stderr))
			}
			assertRuntimeSecretTestOutputRedacted(t, stdout, stderr)
		})
	}
}

func TestOpenRouterRuntimeSecretMissingFailureIsDeterministicAndRedacted(t *testing.T) {
	withoutOpenRouterKeyEnv(t)
	stdout, stderr, code := runServeUntilBindFailure(t, nil)
	if code != 2 || !strings.Contains(stderr, "invalid_openrouter_key: value required") {
		t.Fatalf("missing OpenRouter key should fail with deterministic validation error: code=%d stdout=%q stderr=%q", code, redactRuntimeSecretTestOutput(stdout), redactRuntimeSecretTestOutput(stderr))
	}
	assertRuntimeSecretTestOutputRedacted(t, stdout, stderr)
}

func TestDotEnvParserSafetyContract(t *testing.T) {
	t.Run("comments and blank lines ignored with minimal key value parsing", func(t *testing.T) {
		withoutOpenRouterKeyEnv(t)
		writeLocalDotEnv(t, "\n# comment before key\n   # indented comment\nOPENROUTER_KEY="+fakeDotEnvSecret+"\n")
		stdout, stderr, code := runServeUntilBindFailure(t, nil)
		if code != 1 || !strings.Contains(stderr, "runtime_failed") {
			t.Fatalf("minimal .env KEY=VALUE parser should accept comments and blank lines: code=%d stdout=%q stderr=%q", code, redactRuntimeSecretTestOutput(stdout), redactRuntimeSecretTestOutput(stderr))
		}
		assertRuntimeSecretTestOutputRedacted(t, stdout, stderr)
	})

	t.Run("shell command substitution is not executed", func(t *testing.T) {
		withoutOpenRouterKeyEnv(t)
		sentinel := filepath.Join(t.TempDir(), "dotenv-command-substitution-sentinel")
		writeLocalDotEnv(t, "OPENROUTER_KEY=$(touch "+sentinel+")\n")
		stdout, stderr, code := runServeUntilBindFailure(t, nil)
		if code != 1 || !strings.Contains(stderr, "runtime_failed") {
			t.Fatalf(".env command substitution text should be treated without shell execution: code=%d stdout=%q stderr=%q", code, redactRuntimeSecretTestOutput(stdout), redactRuntimeSecretTestOutput(stderr))
		}
		if _, err := os.Stat(sentinel); err == nil {
			t.Fatal(".env parser executed command substitution and created sentinel file")
		} else if !os.IsNotExist(err) {
			t.Fatalf("check command substitution sentinel: %v", err)
		}
		assertRuntimeSecretTestOutputRedacted(t, stdout, stderr)
	})

	t.Run("unsupported shell syntax does not set secret and does not leak value", func(t *testing.T) {
		withoutOpenRouterKeyEnv(t)
		writeLocalDotEnv(t, "export OPENROUTER_KEY="+fakeDotEnvSecret+"\n")
		stdout, stderr, code := runServeUntilBindFailure(t, nil)
		if code != 2 || !strings.Contains(stderr, "invalid_openrouter_key") {
			t.Fatalf("unsupported .env shell syntax should not configure OpenRouter key: code=%d stdout=%q stderr=%q", code, redactRuntimeSecretTestOutput(stdout), redactRuntimeSecretTestOutput(stderr))
		}
		assertRuntimeSecretTestOutputRedacted(t, stdout, stderr)
	})
}

func TestStatePortabilityExcludesRuntimeLLMSecretConfiguration(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	if _, err := db.ExecContext(ctx, `insert into runtime_metadata (key, value, updated_at) values (?, ?, unixepoch()), (?, ?, unixepoch()), (?, ?, unixepoch())`, "gemini_api_key", fakeEnvSecret, "gemini_secret_source", ".env", "openrouter_api_key", "rfake_openrouter_secret_for_runtime_tests_only"); err != nil {
		t.Fatalf("seed runtime secret metadata sentinels: %v", err)
	}

	var exported bytes.Buffer
	if err := ExportState(ctx, db, &exported); err != nil {
		t.Fatalf("ExportState returned error: %v", err)
	}
	exportedState := exported.String()
	for _, forbidden := range []string{"runtime_metadata", "gemini_api_key", "gemini_secret_source", "openrouter_api_key", ".env", fakeEnvSecret} {
		if strings.Contains(exportedState, forbidden) {
			t.Fatalf("portable state leaked runtime secret configuration token %q in %s", forbidden, redactRuntimeSecretTestOutput(exportedState))
		}
	}
	for _, required := range []string{"sources", "steer_rules", "resonated_items"} {
		if !strings.Contains(exportedState, required) {
			t.Fatalf("portable state missing required current-state field %q: %s", required, exportedState)
		}
	}
}

func runServeUntilBindFailure(t *testing.T, extraArgs []string) (string, string, int) {
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

func reserveRuntimeSecretTestAddr(t *testing.T) *net.TCPListener {
	t.Helper()
	addr, err := net.ResolveTCPAddr("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("resolve local tcp addr: %v", err)
	}
	listener, err := net.ListenTCP("tcp", addr)
	if err != nil {
		t.Fatalf("reserve occupied tcp addr: %v", err)
	}
	return listener
}

func writeLocalDotEnv(t *testing.T, content string) {
	t.Helper()
	dir := t.TempDir()
	oldDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory before local .env fixture: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("enter local .env fixture directory: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(oldDir); err != nil {
			t.Errorf("restore working directory after local .env fixture: %v", err)
		}
	})
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(content), 0o600); err != nil {
		t.Fatalf("write local .env fixture: %v", err)
	}
}

func withoutGeminiAPIKeyEnv(t *testing.T) {
	t.Helper()
	old, ok := os.LookupEnv("GEMINI_API_KEY")
	if err := os.Unsetenv("GEMINI_API_KEY"); err != nil {
		t.Fatalf("unset GEMINI_API_KEY for test isolation: %v", err)
	}
	t.Cleanup(func() {
		if ok {
			_ = os.Setenv("GEMINI_API_KEY", old)
			return
		}
		_ = os.Unsetenv("GEMINI_API_KEY")
	})
}

func assertRuntimeSecretTestOutputRedacted(t *testing.T, outputs ...string) {
	t.Helper()
	for _, output := range outputs {
		for _, secret := range []string{fakeCLISecret, fakeEnvSecret, fakeDotEnvSecret, "rfake_openrouter_secret_for_runtime_tests_only"} {
			if strings.Contains(output, secret) {
				t.Fatal("runtime output leaked a fake secret fixture value")
			}
		}
	}
}

func redactRuntimeSecretTestOutput(output string) string {
	replacer := strings.NewReplacer(
		fakeCLISecret, "<redacted-cli-secret>",
		fakeEnvSecret, "<redacted-env-secret>",
		fakeDotEnvSecret, "<redacted-dotenv-secret>",
		"rfake_openrouter_secret_for_runtime_tests_only", "<redacted-openrouter-secret>",
	)
	return replacer.Replace(output)
}
