package tests

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

type canonicalDocumentContract struct {
	path      string
	required  []string
	forbidden []string
}

func TestRFBugCanonicalContracts(t *testing.T) {
	root := rfBugRepositoryRoot(t)

	canonicalDocuments := []canonicalDocumentContract{
		{
			path: "README.md",
			required: []string{
				"an immediate source-backed preview that remains readable while detail and inspection requests complete independently",
				"import-only OPML intake, JSON State export/import",
				"Portable JSON State** — atomic replacement backup/restore",
				"one embedded deployable command",
				"OpenRouter performs Prompting System v2.2 request/response JSON transformation only; Go validates and persists atomically",
				"Go owns one effective CSP, `nosniff`, `no-referrer`, and `DENY` framing value",
			},
		},
		{
			path: "docs/ARCHITECTURE.md",
			required: []string{
				"Version: 1.3",
				"## RF-BUG Canonical Runtime Contract",
				"ui_assets=ready",
				"ui_asset_source=embedded",
				"one effective `Content-Security-Policy`",
				"Initial route resolution controls the first visible surface and document title before token hydration",
				"Feed and Search selection immediately render a readable Inspector preview",
				"Idle Steer exposes no missing-URL error",
				"separately labelled Source List and Portable State groups",
				"identifies and enforces Prompting System v2.2 (`resofeed.summarize.v2.2`)",
				"Mutating cases receive case-local SQLite state and clean browser contexts",
				"`GET /api/sources/export-opml` is retired and is not a public capability",
			},
		},
		{
			path: "docs/CONTAINER.md",
			required: []string{
				"one Go binary that serves static UI assets, JSON HTTP, MCP Streamable HTTP at `/mcp`, SQLite migrations, and the background ingest loop",
				"## Application-Owned Browser Security",
				"The Go binary emits one effective value for each browser security header",
				"`Content-Security-Policy`",
				"`X-Content-Type-Options: nosniff`",
				"`Referrer-Policy: no-referrer`",
				"`X-Frame-Options: DENY`",
				"Caddy and other reverse proxies must pass these application-owned values unchanged",
			},
		},
		{
			path: "docs/DESIGN.md",
			required: []string{
				"## RF-BUG Canonical Interaction Contract",
				"Route resolution owns the first visible surface and title before token hydration",
				"`RESOFEED · TODAY`",
				"`RESOFEED · SOURCE LEDGER`",
				"`RESOFEED · SEARCH`",
				"`RESOFEED · INSPECTOR`",
				"`RESOFEED · /doctor`",
				"Selecting a Feed or Search row immediately opens a readable Inspector preview",
				"A matching invalid submission exposes one localized accessible error",
				"`SOURCE LIST` and `PORTABLE STATE` as separately labelled groups",
				"at least 44 by 44 CSS pixels",
			},
		},
		{
			path: "docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md",
			required: []string{
				"These cases run with zero retries and without live LLM credentials",
				"build and launch the real embedded Go binary from a working directory outside the repository",
				"no mocked product runtime or product API interception is used",
				"**Route and title matrix:**",
				"**Inspector selection:**",
				"**Steer accessibility:**",
				"separately labelled Source List and Portable State groups",
				"Chromium boots under Go-owned security headers",
				"**Prompting v2.2:**",
				"every mutating test owns case-local SQLite state, a clean browser context, an allocated port, and its launched process",
				"the CI-safe smoke lane completes under two minutes",
				"one deliberate assertion failure retains the ordinary Playwright report, trace, screenshot, video",
			},
		},
		{
			path: "docs/PRD.md",
			required: []string{
				"It contains only active Source Ledger rows, current active steering policy rules, and currently resonated items",
				"OPML is import-only source intake",
				"State import validates before one atomic replacement transaction and never merges local and imported state",
				"selecting a Feed or Search item immediately opens a readable Inspector preview",
				"route-correct from the first visible frame",
				"idle Steer exposes no missing-URL error",
				"Source List and Portable State stay separately labelled",
				"A failed State import leaves the prior portable state unchanged",
			},
		},
		{
			path: "docs/PROMPTING_SYSTEM.md",
			required: []string{
				"Every canonical ingest and reprocess transform identifies and enforces this v2.2 contract",
				"schema_version: \"resofeed.summarize.v2.2\"",
				"Go semantic validation before one atomic item/FTS persistence operation",
				"Active runtime identities, errors, tests, and aligned documentation must not use an earlier Prompting System identity",
				"OpenRouter is a request/response JSON transformer only",
				"malformed, unavailable, retry, and fallback outcomes cannot partially update generated item text or FTS state",
			},
		},
		{
			path: "docs/USAGE.md",
			required: []string{
				"Cold load, refresh, Back, and Forward must show the requested surface from the first visible frame",
				"`RESOFEED · INSPECTOR`",
				"Selecting a Feed or Search item immediately opens a readable Inspector preview",
				"ResoFeed moves portable active state through JSON State only",
				"Import validates the bundle before one atomic replacement transaction",
				"OPML remains import-only source intake",
				"`[IMPORT OPML]` under Source List",
				"`[EXPORT STATE]` / `[IMPORT STATE]` under the separately labelled Portable State group",
				"`ui_assets=ready` and `ui_asset_source=embedded`",
			},
		},
		{
			path: "docs/ui-preview.html",
			required: []string{
				"<title>RESOFEED · SOURCE LEDGER</title>",
				"role=\"group\" aria-label=\"来源列表操作\"",
				"role=\"group\" aria-label=\"状态迁移操作\"",
				">[IMPORT OPML]</button>",
				">[EXPORT STATE]</button>",
				">[IMPORT STATE]</button>",
			},
		},
	}

	for i := range canonicalDocuments {
		canonicalDocuments[i].forbidden = append(canonicalDocuments[i].forbidden,
			"[EXPORT OPML]",
			"### Export OPML",
			"OPML import/export remains",
			"OPML export/import remains",
			"export the active Source Ledger as OPML",
		)
	}

	for _, contract := range canonicalDocuments {
		contract := contract
		t.Run(contract.path, func(t *testing.T) {
			body := rfBugReadFile(t, root, contract.path)
			for _, required := range contract.required {
				if !strings.Contains(body, required) {
					t.Errorf("%s missing canonical contract fragment %q", contract.path, required)
				}
			}
			for _, forbidden := range contract.forbidden {
				if strings.Contains(body, forbidden) {
					t.Errorf("%s retains prohibited OPML capability fragment %q", contract.path, forbidden)
				}
			}
		})
	}

	opmlExclusions := []struct {
		path   string
		sha256 string
	}{
		{
			path:   "docs/BUG_FIX_PLAN_2026-07-12.md",
			sha256: "185a27df2aedc353efa607a47bf44f0d87dd61d5a457e1a2909f9dc757582464",
		},
		{
			path:   "docs/BUG_REPORT_2026-07-11.md",
			sha256: "017580ff159170ac65154903001982441b969b687425d4402bbd3eed94fa4f27",
		},
	}
	if len(opmlExclusions) != 2 {
		t.Fatalf("OPML exclusion set must contain exactly two protected authority documents, got %d", len(opmlExclusions))
	}
	for _, exclusion := range opmlExclusions {
		body := []byte(rfBugReadFile(t, root, exclusion.path))
		actual := fmt.Sprintf("%x", sha256.Sum256(body))
		if actual != exclusion.sha256 {
			t.Errorf("protected authority document %s changed byte-for-byte: got sha256 %s, want %s", exclusion.path, actual, exclusion.sha256)
		}
	}

	t.Logf("RF_BUG_CANONICAL_DOCUMENTS=%d", len(canonicalDocuments))
	t.Logf("OPML_EXCLUSIONS=%d", len(opmlExclusions))
}

func rfBugRepositoryRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate RF-BUG canonical contract test source")
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(filename), ".."))
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("locate repository root from %s: %v", filename, err)
	}
	return root
}

func rfBugReadFile(t *testing.T, root, relativePath string) string {
	t.Helper()
	body, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(relativePath)))
	if err != nil {
		t.Fatalf("read %s: %v", relativePath, err)
	}
	return string(body)
}
