package resofeed

import (
	"bytes"
	"context"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
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
				t.Setenv("OPENROUTER_KEY", "test-key")
				return []string{"serve", "--addr", addr, "--public-url", "http://127.0.0.1:8080/path", "--db", filepath.Join(t.TempDir(), "resofeed.sqlite3"), "--owner-token", contractOwnerToken}
			},
			wantCode:   2,
			wantStderr: "invalid_public_url",
		},
		{
			name: "empty openrouter config",
			args: func(t *testing.T, addr string) []string {
				t.Helper()
				t.Setenv("OPENROUTER_KEY", " ")
				return []string{"serve", "--addr", addr, "--db", filepath.Join(t.TempDir(), "resofeed.sqlite3"), "--owner-token", contractOwnerToken}
			},
			wantCode:   2,
			wantStderr: "invalid_openrouter_key",
		},
		{
			name: "invalid owner token",
			args: func(t *testing.T, addr string) []string {
				t.Helper()
				t.Setenv("OPENROUTER_KEY", "test-key")
				return []string{"serve", "--addr", addr, "--db", filepath.Join(t.TempDir(), "resofeed.sqlite3"), "--owner-token", "short"}
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
				t.Setenv("OPENROUTER_KEY", "test-key")
				return []string{"serve", "--addr", addr, "--db", filepath.Join(parentFile, "resofeed.sqlite3"), "--owner-token", contractOwnerToken}
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
	t.Setenv("OPENROUTER_KEY", "test-key")
	code := Main([]string{"serve", "--addr", "127.0.0.1", "--db", filepath.Join(t.TempDir(), "resofeed.sqlite3"), "--owner-token", contractOwnerToken}, &stdout, &stderr)
	if code != 2 || !strings.Contains(stderr.String(), "invalid_addr") {
		t.Fatalf("invalid addr code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}

func TestServeStartupValidationOrdersLocalConfigBeforeMissingOpenRouterKey(t *testing.T) {
	for _, tc := range []struct {
		name       string
		args       []string
		wantStderr string
	}{
		{
			name:       "invalid addr before missing openrouter key",
			args:       []string{"serve", "--addr", "bad", "--db", "resofeed.sqlite3", "--owner-token", contractOwnerToken},
			wantStderr: "invalid_addr: expected HOST:PORT",
		},
		{
			name:       "invalid public url before missing openrouter key",
			args:       []string{"serve", "--addr", "127.0.0.1:18080", "--public-url", "http://127.0.0.1:8080/path", "--db", "resofeed.sqlite3", "--owner-token", contractOwnerToken},
			wantStderr: "invalid_public_url: expected absolute http(s) URL without path/query/fragment",
		},
		{
			name:       "invalid owner token before missing openrouter key",
			args:       []string{"serve", "--addr", "127.0.0.1:18080", "--db", "resofeed.sqlite3", "--owner-token", "short"},
			wantStderr: "invalid_owner_token: expected at least 32 visible non-whitespace characters",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			withoutRuntimeStartupOpenRouterSecretSources(t)

			var stdout, stderr bytes.Buffer
			code := Main(tc.args, &stdout, &stderr)
			if code != 2 {
				t.Fatalf("Main exit code = %d, want 2; stdout=%q stderr=%q", code, stdout.String(), stderr.String())
			}
			if !strings.Contains(stderr.String(), tc.wantStderr) {
				t.Fatalf("stderr = %q, want %q", stderr.String(), tc.wantStderr)
			}
			if strings.Contains(stderr.String(), "invalid_openrouter_key") {
				t.Fatalf("local config validation was masked by missing OpenRouter key: stderr=%q", stderr.String())
			}
		})
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
	t.Setenv("OPENROUTER_KEY", "test-key")
	firstCode := Main([]string{"serve", "--addr", addr, "--db", dbPath}, &firstOut, &firstErr)
	if firstCode != 1 || !strings.Contains(firstOut.String(), "owner token generated: rfeed_") || !strings.Contains(firstErr.String(), "runtime_failed") {
		t.Fatalf("first process startup code=%d stdout=%q stderr=%q", firstCode, firstOut.String(), firstErr.String())
	}

	var secondOut, secondErr bytes.Buffer
	secondCode := Main([]string{"serve", "--addr", addr, "--db", dbPath}, &secondOut, &secondErr)
	if secondCode != 1 || !strings.Contains(secondOut.String(), "owner token reused: stored hash") || !strings.Contains(secondErr.String(), "runtime_failed") {
		t.Fatalf("second process startup code=%d stdout=%q stderr=%q", secondCode, secondOut.String(), secondErr.String())
	}
}

func TestServeReadinessBeforeBackgroundIngest(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	db, err := OpenDB(ctx, filepath.Join(t.TempDir(), "resofeed.sqlite3"))
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	defer func() { _ = db.Close() }()
	if err := RunMigrations(ctx, db); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}

	recorder := &testRuntimeLifecycleRecorder{events: make(chan RuntimeLifecycleEvent, 3)}
	ingestStarted := make(chan struct{})
	done := make(chan error, 1)
	cfg := HTTPServerConfig{
		Addr:       "127.0.0.1:0",
		PublicURL:  "http://127.0.0.1",
		DB:         db,
		OwnerToken: contractOwnerToken,
		LLM:        nil,
		Lifecycle:  recorder,
	}

	go func() {
		done <- ServeHTTPAndIngestRuntime(ctx, cfg, func(runCtx context.Context) error {
			close(ingestStarted)
			<-runCtx.Done()
			return nil
		})
	}()

	ordered := make([]RuntimeLifecycleEvent, 0, 3)
	for len(ordered) < 3 {
		select {
		case event := <-recorder.events:
			ordered = append(ordered, event)
		case <-time.After(3 * time.Second):
			t.Fatalf("timed out waiting for lifecycle proof; got events %v", ordered)
		}
	}

	assertRuntimeEventOrder(t, ordered, []RuntimeLifecycleEvent{
		RuntimeLifecycleBindReady,
		RuntimeLifecycleHTTPMCPReady,
		RuntimeLifecycleIngestStart,
	})
	t.Logf("ordered lifecycle proof: %s -> %s -> %s", ordered[0], ordered[1], ordered[2])

	select {
	case <-ingestStarted:
	case <-time.After(time.Second):
		t.Fatalf("ingest did not start after readiness; events %v", ordered)
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("ServeHTTPAndIngestRuntime returned error: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatalf("runtime did not shut down after lifecycle proof")
	}
}

type testRuntimeLifecycleRecorder struct {
	mu     sync.Mutex
	seen   []RuntimeLifecycleEvent
	events chan RuntimeLifecycleEvent
}

func (r *testRuntimeLifecycleRecorder) RecordRuntimeLifecycleEvent(event RuntimeLifecycleEvent) {
	r.mu.Lock()
	r.seen = append(r.seen, event)
	r.mu.Unlock()
	r.events <- event
}

func assertRuntimeEventOrder(t *testing.T, got []RuntimeLifecycleEvent, want []RuntimeLifecycleEvent) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("lifecycle events = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("lifecycle events = %v, want ordered %v", got, want)
		}
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

func withoutRuntimeStartupOpenRouterSecretSources(t *testing.T) {
	t.Helper()
	withoutOpenRouterKeyEnv(t)
	withoutGeminiAPIKeyEnv(t)
	dir := t.TempDir()
	oldDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory before startup validation fixture: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("enter startup validation fixture directory: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(oldDir); err != nil {
			t.Errorf("restore working directory after startup validation fixture: %v", err)
		}
	})
}
