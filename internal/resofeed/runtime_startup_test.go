package resofeed

import (
	"bytes"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestServeStartupValidationFailsBeforeSocketBind(t *testing.T) {
	for _, tc := range []struct {
		name       string
		args       func(t *testing.T, addr string) []string
		wantCode   int
		wantStderr string
	}{
		{
			name: "invalid public url",
			args: func(t *testing.T, addr string) []string {
				t.Helper()
				return []string{"serve", "--addr", addr, "--public-url", "http://127.0.0.1:8080/path", "--db", filepath.Join(t.TempDir(), "resofeed.sqlite3"), "--gemini-api-key", "test-key", "--owner-token", contractOwnerToken}
			},
			wantCode:   2,
			wantStderr: "invalid_public_url",
		},
		{
			name: "invalid gemini config",
			args: func(t *testing.T, addr string) []string {
				t.Helper()
				return []string{"serve", "--addr", addr, "--db", filepath.Join(t.TempDir(), "resofeed.sqlite3"), "--owner-token", contractOwnerToken}
			},
			wantCode:   2,
			wantStderr: "invalid_gemini_api_key",
		},
		{
			name: "invalid owner token",
			args: func(t *testing.T, addr string) []string {
				t.Helper()
				return []string{"serve", "--addr", addr, "--db", filepath.Join(t.TempDir(), "resofeed.sqlite3"), "--gemini-api-key", "test-key", "--owner-token", "short"}
			},
			wantCode:   2,
			wantStderr: "invalid_owner_token",
		},
		{
			name: "invalid db path",
			args: func(t *testing.T, addr string) []string {
				t.Helper()
				parentFile := filepath.Join(t.TempDir(), "not-a-dir")
				if err := os.WriteFile(parentFile, []byte("file"), 0o644); err != nil {
					t.Fatalf("write db parent sentinel: %v", err)
				}
				return []string{"serve", "--addr", addr, "--db", filepath.Join(parentFile, "resofeed.sqlite3"), "--gemini-api-key", "test-key", "--owner-token", contractOwnerToken}
			},
			wantCode:   2,
			wantStderr: "invalid_db",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			addr := unusedTCPAddr(t)
			var stdout, stderr bytes.Buffer
			got := Main(tc.args(t, addr), &stdout, &stderr)
			if got != tc.wantCode {
				t.Fatalf("Main exit code = %d, want %d; stdout=%q stderr=%q", got, tc.wantCode, stdout.String(), stderr.String())
			}
			if !strings.Contains(stderr.String(), tc.wantStderr) {
				t.Fatalf("stderr = %q, want %q", stderr.String(), tc.wantStderr)
			}
			listener, err := net.Listen("tcp", addr)
			if err != nil {
				t.Fatalf("listen after failed startup on %s: %v; startup likely bound before validation", addr, err)
			}
			_ = listener.Close()
		})
	}
}

func TestServeStartupRejectsInvalidAddrBeforeDBAndSocket(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Main([]string{"serve", "--addr", "127.0.0.1", "--db", filepath.Join(t.TempDir(), "resofeed.sqlite3"), "--gemini-api-key", "test-key", "--owner-token", contractOwnerToken}, &stdout, &stderr)
	if code != 2 || !strings.Contains(stderr.String(), "invalid_addr") {
		t.Fatalf("invalid addr code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}

func TestServeFirstRunOwnerTokenGenerationAndReuseAtProcessLevel(t *testing.T) {
	occupied, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve occupied addr: %v", err)
	}
	defer func() { _ = occupied.Close() }()
	addr := occupied.Addr().String()
	dbPath := filepath.Join(t.TempDir(), "resofeed.sqlite3")

	var firstOut, firstErr bytes.Buffer
	firstCode := Main([]string{"serve", "--addr", addr, "--db", dbPath, "--gemini-api-key", "test-key"}, &firstOut, &firstErr)
	if firstCode != 1 || !strings.Contains(firstOut.String(), "owner token generated: rfeed_") || !strings.Contains(firstErr.String(), "runtime_failed") {
		t.Fatalf("first process startup code=%d stdout=%q stderr=%q", firstCode, firstOut.String(), firstErr.String())
	}

	var secondOut, secondErr bytes.Buffer
	secondCode := Main([]string{"serve", "--addr", addr, "--db", dbPath, "--gemini-api-key", "test-key"}, &secondOut, &secondErr)
	if secondCode != 1 || !strings.Contains(secondOut.String(), "owner token reused: stored hash") || !strings.Contains(secondErr.String(), "runtime_failed") {
		t.Fatalf("second process startup code=%d stdout=%q stderr=%q", secondCode, secondOut.String(), secondErr.String())
	}
}

func unusedTCPAddr(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("allocate tcp addr: %v", err)
	}
	addr := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatalf("close tcp addr listener: %v", err)
	}
	return addr
}
