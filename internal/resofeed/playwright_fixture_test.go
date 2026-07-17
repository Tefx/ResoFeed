package resofeed

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestPlaywrightFixtureContract(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve fixture contract test location")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))
	files := map[string][]string{
		"web/tests/e2e/fixtures/runtime-fixture.ts": {
			"'serve'", "--owner-token", "randomBytes(32)", "cwd: database.directory",
			"path.join(repoRoot, 'scripts', 'build-resofeed.sh')", "['--e2e', binaryPath]", "RESOFEED_E2E: '1'",
			"createTestDatabase(testInfo)", "captureBrowserDiagnostics(page)",
			"RF-BUG-010_SETUP=ready", "RF-BUG-010_TEARDOWN=", "databaseResidue",
			"database_residue=", "port=${closedPort ? 'closed' : 'open'}",
		},
		"web/tests/e2e/fixtures/test-db.ts": {
			"testInfo.outputPath('runtime')", "resofeed.sqlite3", "-shm", "-wal", "fs.rmSync",
		},
		"scripts/build-resofeed.sh": {
			"resofeed-svelte-build-identity.mjs", "go build -trimpath -tags resofeed_e2e", "go build -trimpath -o",
		},
		"scripts/vectl-check.mjs": {
			"vectl.check.selection.v1", "vectl.check.evidence.v1", "rf_bug_v2_harness_foundation_green",
			"RF-BUG-010 adapter-envelope", "RF-BUG-010 lane-discovery", "selected_ids", "executed_ids",
			"browser-diagnostics.log", "runtime-cleanup.txt", "'--list'", "VECTL_GENERIC_EVIDENCE=valid",
			"function collectArtifactRows", "sha256: artifactDigest(filePath)", "artifacts: artifactRows",
		},
		"scripts/rf-bug-010-standard-json.mjs": {
			"command === 'discover'", "discovery unexpectedly executed tests", "native file discovery",
		},
	}
	for relativePath, required := range files {
		body, err := os.ReadFile(filepath.Join(repoRoot, relativePath))
		if err != nil {
			t.Fatalf("read %s: %v", relativePath, err)
		}
		text := string(body)
		for _, fragment := range required {
			if !strings.Contains(text, fragment) {
				t.Errorf("%s missing contract fragment %q", relativePath, fragment)
			}
		}
		for _, forbidden := range []string{"page.route(", "**/api/**", "RESOFEED_E2E_RESET", "process.env =", "fakeOpenRouterKey"} {
			if strings.Contains(text, forbidden) {
				t.Errorf("%s contains forbidden harness mechanism %q", relativePath, forbidden)
			}
		}
	}

	fixtureBody, err := os.ReadFile(filepath.Join(repoRoot, "web/tests/e2e/fixtures/runtime-fixture.ts"))
	if err != nil {
		t.Fatalf("read canonical runtime fixture: %v", err)
	}
	fixtureText := string(fixtureBody)
	for _, forbidden := range []string{
		"spawnSync('go'", "spawnSync(\"go\"", "['build', '-tags', 'resofeed_e2e'", "['-tags', 'resofeed_e2e'",
	} {
		if strings.Contains(fixtureText, forbidden) {
			t.Errorf("runtime fixture duplicates canonical Go build/tag construction %q", forbidden)
		}
	}

	command := exec.Command(
		"node",
		filepath.Join(repoRoot, "scripts", "vectl-check.mjs"),
		"select",
		"rf-bug-v2-harness-foundation",
		"rf_bug_v2_harness_foundation_green",
	)
	command.Dir = repoRoot
	output, err := command.Output()
	if err != nil {
		t.Fatalf("select generic adapter envelope: %v", err)
	}
	var selection struct {
		SchemaVersion string   `json:"schema_version"`
		CheckID       string   `json:"check_id"`
		Identities    []string `json:"identities"`
		Digest        string   `json:"digest"`
	}
	if err := json.Unmarshal(output, &selection); err != nil {
		t.Fatalf("decode generic adapter envelope: %v", err)
	}
	expectedIdentities := []string{
		"RF-BUG-010 adapter-envelope",
		"RF-BUG-010 artifact-contract",
		"RF-BUG-010 harness-isolation",
		"RF-BUG-010 lane-discovery",
	}
	if selection.SchemaVersion != "vectl.check.selection.v1" || selection.CheckID != "rf_bug_v2_harness_foundation_green" {
		t.Fatalf("unexpected selection envelope: schema=%q check_id=%q", selection.SchemaVersion, selection.CheckID)
	}
	if strings.Join(selection.Identities, "\n") != strings.Join(expectedIdentities, "\n") {
		t.Fatalf("unexpected selection identities: %q", selection.Identities)
	}
	if !strings.HasPrefix(selection.Digest, "sha256:") || len(selection.Digest) != len("sha256:")+64 {
		t.Fatalf("unexpected selection digest: %q", selection.Digest)
	}
}
