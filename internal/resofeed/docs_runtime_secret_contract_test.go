package resofeed

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestDocsRuntimeSecretConfigurationGuidance(t *testing.T) {
	root := projectRootForRuntimeSecretDocsTest(t)
	usage := readProjectDocForRuntimeSecretTest(t, root, "docs/USAGE.md")
	architecture := readProjectDocForRuntimeSecretTest(t, root, "docs/ARCHITECTURE.md")

	for _, tc := range []struct {
		name string
		doc  string
		want []string
	}{
		{
			name: "usage prefers env dotenv and warns against shell history",
			doc:  usage,
			want: []string{"Prefer an OS environment variable or a local `.env` file", "do not paste real API keys into commands", "shell history", "Do not commit it"},
		},
		{
			name: "usage documents minimal dotenv parser safety",
			doc:  usage,
			want: []string{"only `KEY=VALUE` lines", "must not source shell scripts", "run commands", "command substitution"},
		},
		{
			name: "architecture locks runtime secret precedence and portability",
			doc:  architecture,
			want: []string{"explicit current `--gemini-api-key` value", "OS environment variable `GEMINI_API_KEY` overrides local `.env`", "State export/import must never include LLM secret values or secret-source metadata"},
		},
		{
			name: "architecture locks future OpenRouter away from CLI secrets",
			doc:  architecture,
			want: []string{"OpenRouter implementation must reuse this same runtime secret-source contract", "Future docs must not regress to examples that require CLI secret flags"},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, want := range tc.want {
				if !strings.Contains(tc.doc, want) {
					t.Fatalf("documentation missing required runtime-secret guidance %q", want)
				}
			}
		})
	}
}

func TestDocsDoNotRequireCLIAPIKeysForGeminiOrOpenRouter(t *testing.T) {
	root := projectRootForRuntimeSecretDocsTest(t)
	for _, rel := range []string{"docs/USAGE.md", "docs/ARCHITECTURE.md"} {
		t.Run(rel, func(t *testing.T) {
			doc := readProjectDocForRuntimeSecretTest(t, root, rel)
			for _, block := range fencedCodeBlocksForRuntimeSecretDocsTest(doc) {
				if strings.Contains(strings.ToLower(block), "openrouter") && regexp.MustCompile(`--[^\s]*api-key`).MatchString(block) {
					t.Fatalf("%s contains an OpenRouter code block requiring a CLI API-key flag", rel)
				}
				if strings.Contains(block, "--gemini-api-key") && !strings.Contains(strings.ToLower(block), "discouraged") {
					t.Fatalf("%s contains a Gemini CLI API-key code block without discouraged transitional context", rel)
				}
			}
		})
	}
}

func projectRootForRuntimeSecretDocsTest(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("could not find project root containing go.mod")
		}
		dir = parent
	}
}

func readProjectDocForRuntimeSecretTest(t *testing.T, root string, rel string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, rel))
	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}
	return string(data)
}

func fencedCodeBlocksForRuntimeSecretDocsTest(doc string) []string {
	parts := strings.Split(doc, "```")
	blocks := make([]string, 0, len(parts)/2)
	for i := 1; i < len(parts); i += 2 {
		blocks = append(blocks, parts[i])
	}
	return blocks
}
