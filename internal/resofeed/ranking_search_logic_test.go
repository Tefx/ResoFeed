package resofeed

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestRankCandidatesGuardrailsWithoutSQLiteOwnership(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	fresh := now.Add(-2 * time.Hour)
	old := now.Add(-7 * 24 * time.Hour)
	story := "story_renewed"
	candidates := []rankedCandidate{}
	for i, sourceID := range []string{"src_01", "src_02", "src_03", "src_04", "src_01", "src_02", "src_03", "src_04"} {
		published := fresh.Add(time.Duration(i) * time.Minute)
		candidates = append(candidates, rankedCandidate{item: ItemSummary{ID: "fresh_" + sourceID + string(rune('a'+i)), SourceID: sourceID, PublishedAt: &published}, fresh: true, ordinal: i})
	}
	for i, sourceID := range []string{"src_01", "src_02", "src_03"} {
		published := old.Add(time.Duration(i) * time.Hour)
		candidates = append(candidates, rankedCandidate{item: ItemSummary{ID: "old_resonated_" + sourceID, SourceID: sourceID, PublishedAt: &published, IsResonated: true}, memory: true, ordinal: 20 + i})
	}
	surfacedPublished := fresh
	candidates = append(candidates, rankedCandidate{item: ItemSummary{ID: "surfaced_without_update", SourceID: "src_04", PublishedAt: &surfacedPublished, ExternalSurfacedAt: &now}, fresh: true, ordinal: 30})
	oldStoryPublished := old
	freshStoryPublished := fresh
	candidates = append(candidates,
		rankedCandidate{item: ItemSummary{ID: "old_story_context", SourceID: "src_01", PublishedAt: &oldStoryPublished, IsResonated: true, ExternalSurfacedAt: &now, StoryKey: &story}, memory: true, ordinal: 31},
		rankedCandidate{item: ItemSummary{ID: "fresh_story_update", SourceID: "src_02", PublishedAt: &freshStoryPublished, StoryKey: &story}, fresh: true, ordinal: 32},
		rankedCandidate{item: ItemSummary{ID: "direct_duplicate", SourceID: "src_03", PublishedAt: &freshStoryPublished, DuplicateOfItemID: ptr("fresh_src_01a")}, fresh: true, ordinal: 33},
	)

	items := rankCandidates(candidates, 10, now)
	if len(items) != 10 {
		t.Fatalf("len(items) = %d, want 10", len(items))
	}
	freshCount, oldResonated, distinctFreshSources := 0, 0, map[string]bool{}
	for _, item := range items {
		if item.ID == "surfaced_without_update" || item.ID == "direct_duplicate" {
			t.Fatalf("suppressed candidate %q returned", item.ID)
		}
		if item.PublishedAt != nil && !item.PublishedAt.Before(now.Add(-48*time.Hour)) {
			freshCount++
			distinctFreshSources[item.SourceID] = true
		}
		if item.IsResonated && item.PublishedAt != nil && item.PublishedAt.Before(now.Add(-48*time.Hour)) && item.StoryKey == nil {
			oldResonated++
		}
	}
	if freshCount < 5 {
		t.Fatalf("fresh items = %d, want at least 5", freshCount)
	}
	if oldResonated > 2 {
		t.Fatalf("old resonated memory items = %d, want at most 2", oldResonated)
	}
	if len(distinctFreshSources) < 3 {
		t.Fatalf("distinct fresh sources = %d, want at least 3", len(distinctFreshSources))
	}
}

func TestSearchSQLPlanCoversLexicalAndMetadataFilters(t *testing.T) {
	t.Parallel()

	source := "src_01"
	from := "2026-05-01"
	to := "2026-05-09"
	resonated := true
	query := SearchQuery{Q: "sqlite fts", Source: &source, From: &from, To: &to, Resonated: &resonated, Limit: 150}
	echo := SearchQueryEcho{Q: query.Q, Source: query.Source, From: query.From, To: query.To, Resonated: query.Resonated, Limit: normalizeLimit(query.Limit, defaultSearchLimit, maxSearchLimit)}
	stmt, args := buildSearchSQL(query, echo)

	for _, fragment := range []string{"search_fts match ?", "i.source_id = ?", "date(coalesce(i.published_at, i.first_seen_at)) >= date(?)", "coalesce(st.is_resonated, 0) = ?", "limit ?"} {
		if !strings.Contains(stmt, fragment) {
			t.Fatalf("search SQL missing %q in %s", fragment, stmt)
		}
	}
	if echo.Limit != 100 {
		t.Fatalf("echo limit = %d, want capped 100", echo.Limit)
	}
	if len(args) == 0 || args[len(args)-1] != 100 {
		t.Fatalf("last arg = %#v, want capped limit 100", args)
	}
}

func TestSteeringConflictReceiptHasNoChangedRules(t *testing.T) {
	t.Parallel()

	result, err := ApplySteering(context.Background(), nil, nil, SteerRequest{Command: "Hide all fresh items and show only my old starred articles forever.", MutationRequestFields: MutationRequestFields{ActorKind: ActorKindHuman, ActorID: "owner", IdempotencyKey: "conflict"}})
	if err != nil {
		t.Fatalf("ApplySteering returned error: %v", err)
	}
	if len(result.Receipt.ChangedRules) != 0 {
		t.Fatalf("changed rules len = %d, want 0", len(result.Receipt.ChangedRules))
	}
	if !strings.Contains(strings.ToLower(result.Receipt.Message), "fresh") {
		t.Fatalf("message = %q, want freshness conflict", result.Receipt.Message)
	}
}
