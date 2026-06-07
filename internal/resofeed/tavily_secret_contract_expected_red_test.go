package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	fakeTavilyEnvSecret    = "tfake_tavily_env_secret_for_contract_tests_only"
	fakeTavilyDotEnvSecret = "tfake_tavily_dotenv_secret_for_contract_tests_only"
)

func TestTavilyRuntimeSecretInvalidValuesFailBeforeBindExpectedRed(t *testing.T) {
	for _, tc := range []struct {
		name     string
		envSet   bool
		envValue string
		dotenv   string
	}{
		{name: "empty OS environment", envSet: true, envValue: ""},
		{name: "whitespace OS environment", envSet: true, envValue: " \t \n"},
		{name: "empty dotenv fallback", dotenv: "TAVILY_API_KEY=\n"},
		{name: "whitespace dotenv fallback", dotenv: "TAVILY_API_KEY= \t \n"},
		{name: "whitespace OS environment beats valid dotenv fallback", envSet: true, envValue: " \t ", dotenv: "TAVILY_API_KEY=" + fakeTavilyDotEnvSecret + "\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			withIsolatedTavilyExpectedRedRuntimeInputs(t)
			if tc.envSet {
				t.Setenv("TAVILY_API_KEY", tc.envValue)
			}
			if tc.dotenv != "" {
				writeTavilyExpectedRedDotEnv(t, tc.dotenv)
			}

			stdout, stderr, code := runTavilyExpectedRedServeUntilBindFailure(t)
			if code != 2 || !strings.Contains(stderr, "invalid_tavily_key") {
				t.Fatalf("explicit empty/whitespace TAVILY_API_KEY should fail before bind with invalid_tavily_key: code=%d stdout=%q stderr=%q", code, redactTavilyExpectedRedOutput(stdout), redactTavilyExpectedRedOutput(stderr))
			}
			assertNoTavilyExpectedRedSecretOrSourceLeak(t, stdout, stderr)
		})
	}
}

func TestTavilyRuntimeSecretMissingIsNonFatalAndDoctorConfiguredMissingExpectedRed(t *testing.T) {
	withIsolatedTavilyExpectedRedRuntimeInputs(t)

	stdout, stderr, code := runTavilyExpectedRedServeUntilBindFailure(t)
	if code != 1 || !strings.Contains(stderr, "runtime_failed") || strings.Contains(stderr, "invalid_tavily_key") {
		t.Fatalf("missing TAVILY_API_KEY should be non-fatal and reach ordinary bind/runtime failure: code=%d stdout=%q stderr=%q", code, redactTavilyExpectedRedOutput(stdout), redactTavilyExpectedRedOutput(stderr))
	}
	assertNoTavilyExpectedRedSecretOrSourceLeak(t, stdout, stderr)

	ctx := context.Background()
	db := newContractDB(t, ctx)
	doctor := tavilyExpectedRedDoctorOutput(t, ctx, db)
	if !strings.Contains(doctor, "tavily: configured=missing\n") {
		t.Fatalf("/doctor should expose missing Tavily as safe non-fatal source-acquisition state; doctor=%q", redactTavilyExpectedRedOutput(doctor))
	}
	assertNoTavilyExpectedRedSecretOrSourceLeak(t, doctor)
}

func TestTavilyRuntimeSecretPrecedenceFallbackAndRedactionExpectedRed(t *testing.T) {
	for _, tc := range []struct {
		name         string
		configureEnv bool
		dotenv       string
	}{
		{name: "OS environment configures Tavily and suppresses dotenv source leakage", configureEnv: true, dotenv: "TAVILY_API_KEY=" + fakeTavilyDotEnvSecret + "\n"},
		{name: "local dotenv fallback configures Tavily when OS environment is absent", dotenv: "TAVILY_API_KEY=" + fakeTavilyDotEnvSecret + "\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			withIsolatedTavilyExpectedRedRuntimeInputs(t)
			if tc.configureEnv {
				t.Setenv("TAVILY_API_KEY", fakeTavilyEnvSecret)
			}
			if tc.dotenv != "" {
				writeTavilyExpectedRedDotEnv(t, tc.dotenv)
			}

			stdout, stderr, code := runTavilyExpectedRedServeUntilBindFailure(t)
			if code == 2 && strings.Contains(stderr, "invalid_tavily_key") {
				t.Fatalf("valid Tavily key source should not fail startup validation: code=%d stdout=%q stderr=%q", code, redactTavilyExpectedRedOutput(stdout), redactTavilyExpectedRedOutput(stderr))
			}
			assertNoTavilyExpectedRedSecretOrSourceLeak(t, stdout, stderr)

			ctx := context.Background()
			db := newContractDB(t, ctx)
			doctor := tavilyExpectedRedDoctorOutput(t, ctx, db)
			if !strings.Contains(doctor, "tavily: configured=present\n") {
				t.Fatalf("/doctor should expose only safe Tavily configured=present state; doctor=%q", redactTavilyExpectedRedOutput(doctor))
			}
			assertNoTavilyExpectedRedSecretOrSourceLeak(t, doctor)
		})
	}
}

func runTavilyExpectedRedServeUntilBindFailure(t *testing.T) (string, string, int) {
	t.Helper()
	listener := reserveTavilyExpectedRedAddr(t)
	defer func() {
		if err := listener.Close(); err != nil {
			t.Errorf("close occupied listener: %v", err)
		}
	}()

	args := []string{"serve", "--addr", listener.Addr().String(), "--db", filepath.Join(t.TempDir(), "resofeed.sqlite3"), "--owner-token", contractOwnerToken}
	var stdout, stderr bytes.Buffer
	code := Main(args, &stdout, &stderr)
	return stdout.String(), stderr.String(), code
}

func reserveTavilyExpectedRedAddr(t *testing.T) *net.TCPListener {
	t.Helper()
	addr, err := net.ResolveTCPAddr("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("resolve local tcp addr: %v", err)
	}
	listener, err := net.ListenTCP("tcp", addr)
	if err != nil {
		t.Fatalf("reserve occupied tcp listener: %v", err)
	}
	return listener
}

func tavilyExpectedRedDoctorOutput(t *testing.T, ctx context.Context, db *sql.DB) string {
	t.Helper()
	var out bytes.Buffer
	if err := WriteDoctor(ctx, db, &out); err != nil {
		t.Fatalf("WriteDoctor returned error: %v", err)
	}
	return out.String()
}

func withIsolatedTavilyExpectedRedRuntimeInputs(t *testing.T) {
	t.Helper()
	withoutTavilyExpectedRedEnv(t, "TAVILY_API_KEY")
	withoutTavilyExpectedRedEnv(t, "OPENROUTER_KEY")
	withoutTavilyExpectedRedEnv(t, "GEMINI_API_KEY")
	dir := t.TempDir()
	oldDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory before Tavily fixture: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("enter isolated Tavily fixture directory: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(oldDir); err != nil {
			t.Errorf("restore working directory after Tavily fixture: %v", err)
		}
	})
}

func withoutTavilyExpectedRedEnv(t *testing.T, key string) {
	t.Helper()
	oldValue, hadValue := os.LookupEnv(key)
	if err := os.Unsetenv(key); err != nil {
		t.Fatalf("unset %s for Tavily test isolation: %v", key, err)
	}
	t.Cleanup(func() {
		if hadValue {
			_ = os.Setenv(key, oldValue)
			return
		}
		_ = os.Unsetenv(key)
	})
}

func writeTavilyExpectedRedDotEnv(t *testing.T, content string) {
	t.Helper()
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("get Tavily fixture cwd: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cwd, ".env"), []byte(content), 0o600); err != nil {
		t.Fatalf("write Tavily .env fixture: %v", err)
	}
}

func assertNoTavilyExpectedRedSecretOrSourceLeak(t *testing.T, outputs ...string) {
	t.Helper()
	for _, output := range outputs {
		for _, forbidden := range []string{
			fakeTavilyEnvSecret,
			fakeTavilyDotEnvSecret,
			"env:TAVILY_API_KEY",
			"cwd:.env",
			"TAVILY_API_KEY=",
			"Authorization: Bearer",
			"Bearer " + fakeTavilyEnvSecret,
			"Bearer " + fakeTavilyDotEnvSecret,
		} {
			if strings.Contains(output, forbidden) {
				t.Fatalf("Tavily runtime output leaked forbidden secret/source token %q in %q", forbidden, redactTavilyExpectedRedOutput(output))
			}
		}
		if strings.Contains(output, ".env") {
			t.Fatalf("Tavily runtime output leaked local .env source/path metadata in %q", redactTavilyExpectedRedOutput(output))
		}
	}
}

func redactTavilyExpectedRedOutput(output string) string {
	replacer := strings.NewReplacer(
		fakeTavilyEnvSecret, "<redacted-tavily-env-secret>",
		fakeTavilyDotEnvSecret, "<redacted-tavily-dotenv-secret>",
	)
	return replacer.Replace(output)
}
