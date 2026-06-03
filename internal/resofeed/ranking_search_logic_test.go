package resofeed

import (
	"context"
	"database/sql"
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

func TestRankCandidatesPreservesTimeGroupBeforeScore(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	today := now.Add(-2 * time.Hour)
	yesterday := now.Add(-26 * time.Hour)
	earlier := now.Add(-72 * time.Hour)
	candidates := []rankedCandidate{
		{item: ItemSummary{ID: "earlier_resonated_steered", SourceID: "src_old", PublishedAt: &earlier, IsResonated: true, Summary: ptr("sqlite database internals")}, memory: true, text: "sqlite database internals", ordinal: 0},
		{item: ItemSummary{ID: "today_plain", SourceID: "src_today", PublishedAt: &today, Summary: ptr("ordinary fresh update")}, fresh: true, text: "ordinary fresh update", ordinal: 1},
		{item: ItemSummary{ID: "yesterday_plain", SourceID: "src_yesterday", PublishedAt: &yesterday, Summary: ptr("ordinary yesterday update")}, fresh: true, text: "ordinary yesterday update", ordinal: 2},
	}
	rules := []SteerRule{{RuleText: "Prioritize sqlite database internals.", IsActive: true}}

	items := rankCandidatesWithRules(candidates, 3, now, rules)
	if len(items) != 3 {
		t.Fatalf("len(items) = %d, want 3", len(items))
	}
	got := []string{items[0].ID, items[1].ID, items[2].ID}
	want := []string{"today_plain", "yesterday_plain", "earlier_resonated_steered"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("ranked ids = %v, want time-group order %v", got, want)
		}
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

func TestDelegatedAgentSteeringOnlyRejectedWhenConflictingWithHumanRule(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedActiveSteerRuleForPrecedence(t, ctx, db, "rule_human_sqlite", "Push more SQLite runtime reports.", ActorKindHuman, "owner")

	conflicting, err := ApplySteering(ctx, db, nil, SteerRequest{Command: "Hide sqlite reports", MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: "briefing-agent", IdempotencyKey: "agent-conflicting-sqlite"}})
	if err != nil {
		t.Fatalf("ApplySteering conflicting agent rule returned error: %v", err)
	}
	if conflicting.Receipt.InterpretedAs != "human_precedence" || len(conflicting.Receipt.ChangedRules) != 0 {
		t.Fatalf("conflicting agent result = %+v, want human_precedence with no changed rules", conflicting)
	}
	if !strings.Contains(strings.ToLower(conflicting.Receipt.Message), "conflicting") || !strings.Contains(strings.ToLower(conflicting.Receipt.Message), "human steering") {
		t.Fatalf("conflicting agent message = %q, want conflict-specific human precedence", conflicting.Receipt.Message)
	}
	if got := countActiveSteerRulesForActor(t, ctx, db, ActorKindAgent); got != 0 {
		t.Fatalf("active agent rules after conflicting steer = %d, want 0", got)
	}

	nonConflicting, err := ApplySteering(ctx, db, nil, SteerRequest{Command: "Push more postgresql replication notes", MutationRequestFields: MutationRequestFields{ActorKind: ActorKindAgent, ActorID: "briefing-agent", IdempotencyKey: "agent-nonconflicting-postgresql"}})
	if err != nil {
		t.Fatalf("ApplySteering non-conflicting agent rule returned error: %v", err)
	}
	if nonConflicting.Receipt.InterpretedAs == "human_precedence" || len(nonConflicting.Receipt.ChangedRules) != 1 {
		t.Fatalf("non-conflicting agent result = %+v, want one accepted changed rule and no blanket human_precedence", nonConflicting)
	}
	if got := countActiveSteerRulesForActor(t, ctx, db, ActorKindAgent); got != 1 {
		t.Fatalf("active agent rules after non-conflicting steer = %d, want 1", got)
	}
}

func seedActiveSteerRuleForPrecedence(t *testing.T, ctx context.Context, db *sql.DB, id string, text string, actorKind ActorKind, actorID string) {
	t.Helper()
	if _, err := db.ExecContext(ctx, `insert into steer_rules (id, rule_text, is_active, created_at, created_by_actor_kind, created_by_actor_id, revision) values (?, ?, 1, ?, ?, ?, 1)`, id, text, time.Now().UTC().Format(time.RFC3339Nano), string(actorKind), actorID); err != nil {
		t.Fatalf("seed active steer rule: %v", err)
	}
}

func countActiveSteerRulesForActor(t *testing.T, ctx context.Context, db *sql.DB, actorKind ActorKind) int {
	t.Helper()
	var count int
	if err := db.QueryRowContext(ctx, `select count(*) from steer_rules where is_active = 1 and created_by_actor_kind = ?`, string(actorKind)).Scan(&count); err != nil {
		t.Fatalf("count active steer rules for actor: %v", err)
	}
	return count
}
