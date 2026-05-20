package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
)

const firstFetchLimitSecretSentinel = "rfake_first_fetch_limit_openrouter_secret_must_not_leak"

func TestFirstFetchLimitDefaultsToFiftyForBrandNewSource(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	feed := newFirstFetchLimitFeedServer(t, func() int { return 60 })
	defer feed.Close()
	seedSource(t, ctx, db, "src_first_fetch_default_limit", feed.URL+"/feed.xml", "Backfill Default")

	result, err := ManualFetchSource(ctx, db, IngestConfig{}, "src_first_fetch_default_limit")
	if err != nil {
		t.Fatalf("ManualFetchSource: %v", err)
	}
	if result.ItemsDiscovered != 60 {
		t.Fatalf("ItemsDiscovered = %d, want full feed discovery count 60", result.ItemsDiscovered)
	}
	if result.ItemsUpserted != 50 {
		t.Fatalf("ItemsUpserted = %d, want default first-fetch limit 50 for brand-new source", result.ItemsUpserted)
	}
	if got := countItemsForSource(t, ctx, db, "src_first_fetch_default_limit"); got != 50 {
		t.Fatalf("persisted items = %d, want 50 capped first-fetch items", got)
	}
}

func TestFirstFetchLimitZeroUnlimitedAndIncrementalFetchesUncapped(t *testing.T) {
	t.Run("zero means unlimited for brand-new source", func(t *testing.T) {
		ctx := context.Background()
		db := newContractDB(t, ctx)
		feed := newFirstFetchLimitFeedServer(t, func() int { return 60 })
		defer feed.Close()
		seedSource(t, ctx, db, "src_first_fetch_zero_unlimited", feed.URL+"/feed.xml", "Backfill Unlimited")

		cfg := IngestConfig{}
		setIntFieldForExpectedRedContract(t, &cfg, "FirstFetchMaxItems", 0)
		result, err := ManualFetchSource(ctx, db, cfg, "src_first_fetch_zero_unlimited")
		if err != nil {
			t.Fatalf("ManualFetchSource: %v", err)
		}
		if result.ItemsDiscovered != 60 || result.ItemsUpserted != 60 {
			t.Fatalf("manual fetch result = %+v, want unlimited first fetch to discover/upsert all 60 items", result)
		}
		if got := countItemsForSource(t, ctx, db, "src_first_fetch_zero_unlimited"); got != 60 {
			t.Fatalf("persisted items = %d, want 60 when first-fetch limit is explicitly 0", got)
		}
	})

	t.Run("subsequent incremental fetches are not capped after any items exist", func(t *testing.T) {
		ctx := context.Background()
		db := newContractDB(t, ctx)
		itemCount := 4
		feed := newFirstFetchLimitFeedServer(t, func() int { return itemCount })
		defer feed.Close()
		seedSource(t, ctx, db, "src_first_fetch_incremental_uncapped", feed.URL+"/feed.xml", "Backfill Incremental")

		cfg := IngestConfig{}
		setIntFieldForExpectedRedContract(t, &cfg, "FirstFetchMaxItems", 2)
		first, err := ManualFetchSource(ctx, db, cfg, "src_first_fetch_incremental_uncapped")
		if err != nil {
			t.Fatalf("first ManualFetchSource: %v", err)
		}
		if first.ItemsDiscovered != 4 || first.ItemsUpserted != 2 {
			t.Fatalf("first fetch result = %+v, want cap of 2 applied only to brand-new source", first)
		}

		itemCount = 7
		second, err := ManualFetchSource(ctx, db, cfg, "src_first_fetch_incremental_uncapped")
		if err != nil {
			t.Fatalf("second ManualFetchSource: %v", err)
		}
		if second.ItemsDiscovered != 7 || second.ItemsUpserted != 5 {
			t.Fatalf("second fetch result = %+v, want all 5 new items upserted once source already has persisted items", second)
		}
		if got := countItemsForSource(t, ctx, db, "src_first_fetch_incremental_uncapped"); got != 7 {
			t.Fatalf("persisted items = %d, want 7 after uncapped incremental fetch", got)
		}
	})
}

func TestFirstFetchLimitFlagEnvDefaultPrecedenceAndValidation(t *testing.T) {
	t.Run("default env and cli precedence", func(t *testing.T) {
		withoutFirstFetchLimitEnv(t)
		cfg := parseServeFlagsForFirstFetchLimitContract(t, nil)
		assertIntFieldForExpectedRedContract(t, cfg, "FirstFetchMaxItems", 50)

		t.Setenv("RESOFEED_FIRST_FETCH_LIMIT", "75")
		cfg = parseServeFlagsForFirstFetchLimitContract(t, nil)
		assertIntFieldForExpectedRedContract(t, cfg, "FirstFetchMaxItems", 75)

		cfg = parseServeFlagsForFirstFetchLimitContract(t, []string{"--first-fetch-limit", "25"})
		assertIntFieldForExpectedRedContract(t, cfg, "FirstFetchMaxItems", 25)
	})

	for _, tc := range []struct {
		name string
		env  string
		args []string
	}{
		{name: "negative env", env: "-1"},
		{name: "non integer env", env: "not-an-int"},
		{name: "above maximum env", env: "501"},
		{name: "negative cli", env: "75", args: []string{"--first-fetch-limit", "-1"}},
		{name: "non integer cli", env: "75", args: []string{"--first-fetch-limit", "not-an-int"}},
		{name: "above maximum cli", env: "75", args: []string{"--first-fetch-limit", "501"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("RESOFEED_FIRST_FETCH_LIMIT", tc.env)
			var stdout, stderr bytes.Buffer
			_, code, ok := parseServeFlags(append([]string{"--db", "resofeed.sqlite3"}, tc.args...), &stdout, &stderr)
			if ok || code != 2 {
				t.Fatalf("parseServeFlags ok=%v code=%d stdout=%q stderr=%q, want validation failure", ok, code, stdout.String(), stderr.String())
			}
			if !strings.Contains(stderr.String(), "first-fetch-limit") && !strings.Contains(stderr.String(), "first_fetch_limit") {
				t.Fatalf("stderr = %q, want first-fetch-limit validation diagnostic", stderr.String())
			}
			if strings.Contains(stderr.String(), "flag provided but not defined") {
				t.Fatalf("stderr = %q, want implemented first-fetch-limit validation, not unknown flag parsing", stderr.String())
			}
		})
	}
}

func TestStartupConsoleAndDoctorExposeFirstFetchLimitWithoutSecretLeak(t *testing.T) {
	t.Run("startup console", func(t *testing.T) {
		cfg := ServeConfig{
			Addr:                "127.0.0.1:8080",
			PublicURL:           "http://127.0.0.1:8080",
			DBPath:              "data/resofeed.sqlite3",
			OpenRouterKey:       firstFetchLimitSecretSentinel,
			OpenRouterKeySource: openRouterKeySourceEnv,
			OwnerToken:          contractOwnerToken,
		}
		setIntFieldForExpectedRedContract(t, &cfg, "FirstFetchMaxItems", 50)
		var stdout bytes.Buffer
		printServeStartupConsole(&stdout, cfg, cfg.PublicURL, OwnerTokenResolution{WasExplicit: true})
		output := stdout.String()
		if !strings.Contains(output, "first-fetch-limit: 50") {
			t.Fatalf("startup output missing first-fetch-limit line; output=%q", redactFirstFetchLimitSecret(output))
		}
		assertFirstFetchLimitOutputDoesNotLeakSecrets(t, output)
	})

	t.Run("doctor", func(t *testing.T) {
		ctx := context.Background()
		db := newContractDB(t, ctx)
		cfg := DoctorConfig{ConfiguredOpenRouterModel: "account_default"}
		setIntFieldForExpectedRedContract(t, &cfg, "FirstFetchMaxItems", 50)
		var body bytes.Buffer
		if err := WriteDoctorWithConfig(ctx, db, cfg, &body); err != nil {
			t.Fatalf("WriteDoctorWithConfig: %v", err)
		}
		output := body.String()
		if !strings.Contains(output, "ingest: first_fetch_limit=50") {
			t.Fatalf("doctor output missing effective first-fetch limit; output=%q", redactFirstFetchLimitSecret(output))
		}
		assertFirstFetchLimitOutputDoesNotLeakSecrets(t, output)
	})
}

func parseServeFlagsForFirstFetchLimitContract(t *testing.T, extraArgs []string) ServeConfig {
	t.Helper()
	var stdout, stderr bytes.Buffer
	cfg, code, ok := parseServeFlags(append([]string{"--db", "resofeed.sqlite3"}, extraArgs...), &stdout, &stderr)
	if !ok || code != 0 {
		t.Fatalf("parseServeFlags ok=%v code=%d stdout=%q stderr=%q, want success", ok, code, stdout.String(), stderr.String())
	}
	return cfg
}

func newFirstFetchLimitFeedServer(t *testing.T, itemCount func() int) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/feed.xml" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
		_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>Backfill Fixture</title>`)
		for i := 0; i < itemCount(); i++ {
			_, _ = fmt.Fprintf(w, `<item><guid>item-%03d</guid><title>Item %03d</title><link>urn:first-fetch-limit:item-%03d</link><description>fallback excerpt %03d</description></item>`, i, i, i, i)
		}
		_, _ = io.WriteString(w, `</channel></rss>`)
	}))
	return server
}

func countItemsForSource(t *testing.T, ctx context.Context, db *sql.DB, sourceID string) int {
	t.Helper()
	var count int
	if err := db.QueryRowContext(ctx, `select count(*) from items where source_id = ?`, sourceID).Scan(&count); err != nil {
		t.Fatalf("count items for source %s: %v", sourceID, err)
	}
	return count
}

func setIntFieldForExpectedRedContract(t *testing.T, target any, fieldName string, value int) {
	t.Helper()
	v := reflect.ValueOf(target)
	if v.Kind() != reflect.Pointer || v.IsNil() {
		t.Fatalf("set %s: target must be non-nil pointer", fieldName)
	}
	field := v.Elem().FieldByName(fieldName)
	if !field.IsValid() {
		t.Fatalf("%T missing %s field required by first-fetch/backfill limit contract", target, fieldName)
	}
	if !field.CanSet() || field.Kind() != reflect.Int {
		t.Fatalf("%T.%s must be settable int field", target, fieldName)
	}
	field.SetInt(int64(value))
}

func assertIntFieldForExpectedRedContract(t *testing.T, target any, fieldName string, want int) {
	t.Helper()
	field := reflect.ValueOf(target).FieldByName(fieldName)
	if !field.IsValid() {
		t.Fatalf("%T missing %s field required by first-fetch/backfill limit contract", target, fieldName)
	}
	if field.Kind() != reflect.Int {
		t.Fatalf("%T.%s kind = %s, want int", target, fieldName, field.Kind())
	}
	if got := int(field.Int()); got != want {
		t.Fatalf("%T.%s = %d, want %d", target, fieldName, got, want)
	}
}

func withoutFirstFetchLimitEnv(t *testing.T) {
	t.Helper()
	old, ok := os.LookupEnv("RESOFEED_FIRST_FETCH_LIMIT")
	if err := os.Unsetenv("RESOFEED_FIRST_FETCH_LIMIT"); err != nil {
		t.Fatalf("unset RESOFEED_FIRST_FETCH_LIMIT: %v", err)
	}
	t.Cleanup(func() {
		if ok {
			_ = os.Setenv("RESOFEED_FIRST_FETCH_LIMIT", old)
			return
		}
		_ = os.Unsetenv("RESOFEED_FIRST_FETCH_LIMIT")
	})
}

func assertFirstFetchLimitOutputDoesNotLeakSecrets(t *testing.T, output string) {
	t.Helper()
	for _, forbidden := range []string{firstFetchLimitSecretSentinel} {
		if strings.Contains(output, forbidden) {
			t.Fatalf("runtime output leaked secret/config source %q; output=%q", forbidden, redactFirstFetchLimitSecret(output))
		}
	}
}

func redactFirstFetchLimitSecret(output string) string {
	return strings.ReplaceAll(output, firstFetchLimitSecretSentinel, "<redacted-first-fetch-secret>")
}
