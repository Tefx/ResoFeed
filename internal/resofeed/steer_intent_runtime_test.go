package resofeed

import (
	"context"
	"testing"
)

func TestSteerPreviewOpenRouterBoundary(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	llm := &srdctCountingSteeringLLM{out: OpenRouterSteeringOutput{InterpretedAs: "policy", RuleTexts: []string{"Prefer SQLite runtime reports."}, Message: "policy proposed"}}

	for _, command := range []string{
		"/doctor",
		"https://example.test/rss.xml",
		"add https://example.test/rss.xml",
		"添加 https://example.test/rss.xml",
		"search sqlite",
		"搜索 sqlite",
		"find sqlite",
		"add that blog I mentioned",
		"hide all fresh items",
	} {
		if _, err := PreviewSteering(ctx, db, llm, SteerPreviewRequest{Command: command, ActorKind: ActorKindHuman, ActorID: "owner"}); err != nil {
			t.Fatalf("PreviewSteering(%q): %v", command, err)
		}
	}
	if llm.calls != 0 {
		t.Fatalf("deterministic preview routes called OpenRouter %d times, want 0", llm.calls)
	}

	if _, err := PreviewSteering(ctx, db, llm, SteerPreviewRequest{Command: "push more source-backed SQLite runtime analysis", ActorKind: ActorKindHuman, ActorID: "owner"}); err != nil {
		t.Fatalf("PreviewSteering(policy): %v", err)
	}
	if llm.calls != 1 {
		t.Fatalf("unmatched policy preview OpenRouter calls = %d, want 1", llm.calls)
	}
}
