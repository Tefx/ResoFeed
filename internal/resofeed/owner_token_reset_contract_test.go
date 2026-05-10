package resofeed

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestOwnerTokenResetCLIContractPinsGrammarAndRequiredFlags(t *testing.T) {
	for _, tc := range []struct {
		name       string
		args       []string
		wantCode   int
		wantStderr string
	}{
		{
			name:       "db is required",
			args:       []string{"owner-token", "reset", "--confirm-reset"},
			wantCode:   2,
			wantStderr: "--db is required",
		},
		{
			name:       "confirmation is required",
			args:       []string{"owner-token", "reset", "--db", "resofeed.sqlite3"},
			wantCode:   2,
			wantStderr: "--confirm-reset is required",
		},
		{
			name:       "serve reset flag is forbidden",
			args:       []string{"serve", "--reset-owner-token", "--db", "resofeed.sqlite3"},
			wantCode:   2,
			wantStderr: "flag provided but not defined",
		},
		{
			name:       "replacement plaintext flag is forbidden",
			args:       []string{"owner-token", "reset", "--db", "resofeed.sqlite3", "--confirm-reset", "--owner-token", contractOwnerToken},
			wantCode:   2,
			wantStderr: "flag provided but not defined",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			code := Main(tc.args, &stdout, &stderr)
			if code != tc.wantCode {
				t.Fatalf("Main exit code = %d, want %d; stdout=%q stderr=%q", code, tc.wantCode, stdout.String(), stderr.String())
			}
			if !strings.Contains(stderr.String(), tc.wantStderr) {
				t.Fatalf("stderr = %q, want substring %q", stderr.String(), tc.wantStderr)
			}
			assertOwnerTokenResetDoesNotExposeReplacementToken(t, stdout.String(), stderr.String())
		})
	}
}

func TestOwnerTokenResetHelpPinsForbiddenSurfacesAndReplacementSemantics(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Main([]string{"owner-token", "reset", "--help"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("Main help exit code = %d, want 0; stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	help := stdout.String()
	for _, want := range []string{
		"Usage: resofeed owner-token reset --db PATH --confirm-reset",
		"deletes only runtime_metadata.key='owner_token_sha256'",
		"must not start serve, bind HTTP/MCP, run UI",
		"generate, print, accept, or",
		"Replacement token setup remains solely in",
		"serve startup paths",
		"--db",
		"--confirm-reset",
	} {
		if !strings.Contains(help, want) {
			t.Fatalf("help missing %q; help=%q", want, help)
		}
	}
	if strings.Contains(help, "serve --reset-owner-token") {
		t.Fatalf("help exposed forbidden serve reset surface: %q", help)
	}
}

func TestOwnerTokenResetValidGrammarIsStubOnlyAndDoesNotMutateDatabase(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	if _, err := db.ExecContext(ctx, `insert into runtime_metadata (key, value, updated_at) values ('owner_token_sha256', 'contract_hash', 1)`); err != nil {
		t.Fatalf("seed owner token hash: %v", err)
	}

	var stdout, stderr bytes.Buffer
	code := Main([]string{"owner-token", "reset", "--db", "resofeed.sqlite3", "--confirm-reset"}, &stdout, &stderr)
	if code != 1 || !strings.Contains(stderr.String(), "owner_token_reset_not_implemented") {
		t.Fatalf("valid reset grammar should be contract stub only: code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	var got string
	if err := db.QueryRowContext(ctx, `select value from runtime_metadata where key = 'owner_token_sha256'`).Scan(&got); err != nil {
		t.Fatalf("read owner token hash after stub command: %v", err)
	}
	if got != "contract_hash" {
		t.Fatalf("owner token hash mutated by contract stub: got %q", got)
	}
	assertOwnerTokenResetDoesNotExposeReplacementToken(t, stdout.String(), stderr.String())
}

func assertOwnerTokenResetDoesNotExposeReplacementToken(t *testing.T, outputs ...string) {
	t.Helper()
	for _, output := range outputs {
		for _, forbidden := range []string{"owner token generated:", "owner token explicit:", "rfeed_"} {
			if strings.Contains(output, forbidden) {
				t.Fatalf("owner-token reset contract exposed replacement token behavior %q in output %q", forbidden, output)
			}
		}
	}
}
