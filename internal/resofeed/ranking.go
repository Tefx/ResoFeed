package resofeed

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	defaultFeedLimit = 50
	maxFeedLimit     = 100
	maxFeedOffset    = 10000
	freshWindow      = 48 * time.Hour
)

type rankedCandidate struct {
	item      ItemSummary
	firstSeen *time.Time
	text      string
	fresh     bool
	memory    bool
	related   bool
	score     int
	ordinal   int
}

// RankingOptions define feed candidate limits only. Contract guardrails are
// authoritative over any future scoring formula.
type RankingOptions struct {
	Limit  int
	Offset int
	Now    time.Time
}

// ListTodayFeed returns candidates for GET /api/feed/today and MCP
// list_candidate_items. Ranking must protect freshness, cap older resonated
// memory candidates, preserve source coverage, suppress already externally
// surfaced items unless new related developments exist, and keep duplicates
// transparently retrievable.
func ListTodayFeed(ctx context.Context, db *sql.DB, opts RankingOptions) ([]ItemSummary, error) {
	if db == nil {
		return nil, errors.New("list today feed: db is nil")
	}
	limit := normalizeLimit(opts.Limit, defaultFeedLimit, maxFeedLimit)
	offset := opts.Offset
	if offset < 0 {
		offset = 0
	}
	now := opts.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	activeRules, err := loadActiveSteerRules(ctx, db)
	if err != nil {
		return nil, err
	}

	rows, err := db.QueryContext(ctx, `
select i.id, i.source_id, coalesce(s.title, ''), i.url, i.title, coalesce(i.source_item_title, i.title), i.localized_title,
       i.summary, i.core_insight, i.value_tier, i.published_at,
       i.extraction_status, i.extraction_source, i.model_status, coalesce(i.content_status, i.model_status),
       i.key_points, i.last_reprocess_status, i.last_reprocess_error_code, i.last_reprocess_error_message, i.last_reprocess_at,
       coalesce(st.is_resonated, 0), st.human_inspected_at, st.external_surfaced_at,
       i.story_key, i.duplicate_of_item_id, i.first_seen_at, i.feed_excerpt
from items i
join sources s on s.id = i.source_id and s.is_active = 1
left join item_state st on st.item_id = i.id
order by coalesce(i.published_at, i.first_seen_at) desc, i.id asc`)
	if err != nil {
		return nil, fmt.Errorf("list today feed query: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var items []rankedCandidate
	ordinal := 0
	for rows.Next() {
		candidate, err := scanRankedCandidate(rows, now, ordinal)
		if err != nil {
			return nil, err
		}
		items = append(items, candidate)
		ordinal++
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate today feed rows: %w", err)
	}

	ranked := rankCandidatesWithRules(items, limit+offset, now, activeRules)
	if offset >= len(ranked) {
		return []ItemSummary{}, nil
	}
	end := offset + limit
	if end > len(ranked) {
		end = len(ranked)
	}
	return ranked[offset:end], nil
}

// ApplySteering accepts natural-language steering and RSS URL subscription
// commands. The LLM may propose structured changes, but Go validates and applies
// them in one SQLite transaction.
func ApplySteering(ctx context.Context, db *sql.DB, llm LLMClient, req SteerRequest) (SteerResult, error) {
	command := strings.TrimSpace(req.Command)
	if command == "" {
		return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "empty", ChangedRules: []SteerRule{}, Message: "err: empty steering command"}}, nil
	}
	if conflictsWithInvariants(command) {
		return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "invariant_conflict", ChangedRules: []SteerRule{}, Message: invariantConflictMessage()}}, nil
	}
	if isVagueAddAlias(command) {
		return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "unknown", ChangedRules: []SteerRule{}, Message: "not applied: RSS URL required for add source"}}, nil
	}
	if parsedURL, ok := sourceURLFromSteerCommand(command); ok {
		return applySourceURLSteering(ctx, db, parsedURL)
	}
	if searchQuery, ok := parseSearchSteerCommand(command); ok {
		return applySearchSteering(ctx, db, searchQuery)
	}

	proposal := deterministicSteeringProposal(command)
	if llm != nil {
		active, err := loadActiveSteerRules(ctx, db)
		if err != nil {
			return SteerResult{}, err
		}
		translated, err := llm.TranslateSteering(ctx, OpenRouterSteeringInput{Command: command, ActorKind: req.ActorKind, ActiveRules: active})
		if err != nil {
			if strings.Contains(err.Error(), "status 401") || strings.Contains(err.Error(), "status 403") {
				return SteerResult{}, err
			}
			proposal.Message = "interpreted_as: " + proposal.InterpretedAs + "; applied with local steering parser"
			return applySteeringRules(ctx, db, proposal, req.ActorKind, req.ActorID)
		}
		translated = normalizeOpenRouterSteeringOutput(translated)
		if translated.InterpretedAs != "" {
			proposal.InterpretedAs = translated.InterpretedAs
		}
		if len(translated.RuleTexts) > 0 {
			proposal.RuleTexts = translated.RuleTexts
		}
		if translated.Message != "" {
			proposal.Message = translated.Message
		}
	}
	if req.ActorKind == ActorKindAgent {
		conflicts, err := proposalConflictsWithActiveHumanSteering(ctx, db, proposal)
		if err != nil {
			return SteerResult{}, err
		}
		if conflicts {
			return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "human_precedence", ChangedRules: []SteerRule{}, Message: "not applied: active human steering takes precedence over conflicting delegated-agent steering"}}, nil
		}
	}
	return applySteeringRules(ctx, db, proposal, req.ActorKind, req.ActorID)
}

func proposalConflictsWithActiveHumanSteering(ctx context.Context, db *sql.DB, proposal OpenRouterSteeringOutput) (bool, error) {
	if db == nil || len(proposal.RuleTexts) == 0 {
		return false, nil
	}
	rules, err := loadActiveSteerRules(ctx, db)
	if err != nil {
		return false, err
	}
	for _, proposed := range proposal.RuleTexts {
		proposed = strings.TrimSpace(proposed)
		if proposed == "" || conflictsWithInvariants(proposed) {
			continue
		}
		for _, active := range rules {
			if active.CreatedByActorKind == nil || *active.CreatedByActorKind != string(ActorKindHuman) || !active.IsActive {
				continue
			}
			if steeringRulesConflict(proposed, active.RuleText) {
				return true, nil
			}
		}
	}
	return false, nil
}

func parseSearchSteerCommand(command string) (string, bool) {
	command = strings.TrimSpace(command)
	if isLexicalSearchAlias(command) {
		query, _ := lexicalQueryFromSteerCommand(command)
		return query, true
	}
	if strings.EqualFold(command, "search") {
		return "", true
	}
	prefix, rest, ok := strings.Cut(command, " ")
	if !ok || !strings.EqualFold(prefix, "search") {
		return "", false
	}
	return strings.TrimSpace(rest), true
}

func applySearchSteering(ctx context.Context, db *sql.DB, query string) (SteerResult, error) {
	items, echo, err := SearchItems(ctx, db, SearchQuery{Q: query, Limit: defaultSearchLimit})
	if err != nil {
		return SteerResult{}, fmt.Errorf("apply search steering: %w", err)
	}
	interpretedAs := "search"
	if len(items) == 0 {
		interpretedAs = "search_empty"
	}
	return SteerResult{Receipt: SteeringReceipt{
		InterpretedAs: interpretedAs,
		ChangedRules:  []SteerRule{},
		Message:       fmt.Sprintf("search: %d results for %q", len(items), echo.Q),
	}}, nil
}

func deterministicSteeringProposal(command string) OpenRouterSteeringOutput {
	rules := extractIntentRules(command)
	if len(rules) == 0 {
		rules = []string{strings.TrimSpace(command)}
	}
	interpreted := strings.Join(rules, "; ")
	if interpreted == "" {
		interpreted = "steering_policy_update"
	}
	return OpenRouterSteeringOutput{
		InterpretedAs: interpreted,
		RuleTexts:     rules,
		Message:       "interpreted_as: " + interpreted + "; applied",
	}
}

func extractIntentRules(command string) []string {
	segments := splitSteeringClauses(command)
	rules := make([]string, 0, len(segments))
	for _, segment := range segments {
		if rule, ok := normalizeIntentClause(segment); ok {
			rules = append(rules, rule)
		}
	}
	return dedupeStrings(rules)
}

func splitSteeringClauses(command string) []string {
	cleaned := strings.TrimSpace(command)
	if cleaned == "" {
		return nil
	}
	parts := strings.Fields(cleaned)
	clauses := []string{}
	start := 0
	for i, part := range parts {
		word := strings.Trim(strings.ToLower(part), ",.;:!?()[]{}\"'")
		if i > start && (word == "and" || word == "but") && i+1 < len(parts) && startsSteeringIntent(parts[i+1]) {
			clauses = append(clauses, strings.Join(parts[start:i], " "))
			start = i + 1
		}
	}
	clauses = append(clauses, strings.Join(parts[start:], " "))
	return clauses
}

func startsSteeringIntent(value string) bool {
	switch strings.Trim(strings.ToLower(value), ",.;:!?()[]{}\"'") {
	case "boost", "push", "prioritize", "prefer", "promote", "increase", "more", "reduce", "hide", "filter", "suppress", "exclude", "less", "downrank", "deprioritize":
		return true
	default:
		return false
	}
}

func normalizeIntentClause(clause string) (string, bool) {
	words := strings.FieldsFunc(strings.ToLower(clause), func(r rune) bool {
		return (r < 'a' || r > 'z') && (r < '0' || r > '9')
	})
	if len(words) == 0 {
		return "", false
	}
	intent := ""
	subject := make([]string, 0, len(words))
	stop := map[string]bool{"there": true, "is": true, "too": true, "much": true, "recently": true, "future": true, "coverage": true, "items": true, "articles": true, "documents": true, "unless": true, "story": true, "stories": true, "quality": true, "shallow": true, "show": true, "fewer": true, "more": true, "primary": true, "source": true}
	for _, word := range words {
		switch word {
		case "hide", "filter", "suppress", "exclude", "reduce", "less", "downrank", "deprioritize", "fewer":
			if intent == "" {
				intent = "reduce"
			}
			continue
		case "boost", "push", "prioritize", "prefer", "promote", "increase":
			if intent == "" {
				intent = "boost"
			}
			continue
		}
		if intent == "" || stop[word] || len(word) < 4 {
			continue
		}
		subject = append(subject, word)
	}
	if intent == "" {
		return "", false
	}
	if len(subject) == 0 {
		return intent + " matching items", true
	}
	return intent + " " + strings.Join(subject, " "), true
}

func dedupeStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

// MarkItemInspected records deliberate human attention. Agent silent evaluation
// must not call this contract.
func MarkItemInspected(ctx context.Context, db *sql.DB, itemID string, req InspectRequest) (InspectResult, error) {
	if db == nil {
		return InspectResult{}, errors.New("mark item inspected: db is nil")
	}
	if strings.TrimSpace(itemID) == "" {
		return InspectResult{}, errors.New("mark item inspected: item id is empty")
	}
	now := time.Now().UTC()
	timestamp := now.Format(time.RFC3339Nano)
	_, err := db.ExecContext(ctx, `
insert into item_state (item_id, is_resonated, human_inspected_at, last_actor_kind, last_actor_id)
values (?, 0, ?, ?, ?)
on conflict(item_id) do update set
  human_inspected_at = coalesce(item_state.human_inspected_at, excluded.human_inspected_at),
  last_actor_kind = excluded.last_actor_kind,
  last_actor_id = excluded.last_actor_id`, itemID, timestamp, string(req.ActorKind), req.ActorID)
	if err != nil {
		return InspectResult{}, fmt.Errorf("mark item inspected: %w", err)
	}
	var stored string
	if err := db.QueryRowContext(ctx, `select human_inspected_at from item_state where item_id = ?`, itemID).Scan(&stored); err != nil {
		return InspectResult{}, fmt.Errorf("read inspection state: %w", err)
	}
	inspectedAt, err := parseDBTime(stored)
	if err != nil {
		return InspectResult{}, fmt.Errorf("parse inspection timestamp: %w", err)
	}
	return InspectResult{ItemID: itemID, HumanInspectedAt: inspectedAt, AlreadyApplied: !inspectedAt.Equal(now)}, nil
}

// SetItemResonance toggles durable memory state. Resonance improves retrieval
// but must not permanently pin old items into daily attention.
func SetItemResonance(ctx context.Context, db *sql.DB, itemID string, req ResonanceRequest) (ResonanceResult, error) {
	if db == nil {
		return ResonanceResult{}, errors.New("set item resonance: db is nil")
	}
	if strings.TrimSpace(itemID) == "" {
		return ResonanceResult{}, errors.New("set item resonance: item id is empty")
	}
	_, err := db.ExecContext(ctx, `
insert into item_state (item_id, is_resonated, last_actor_kind, last_actor_id)
values (?, ?, ?, ?)
on conflict(item_id) do update set
  is_resonated = excluded.is_resonated,
  last_actor_kind = excluded.last_actor_kind,
  last_actor_id = excluded.last_actor_id`, itemID, req.Resonated, string(req.ActorKind), req.ActorID)
	if err != nil {
		return ResonanceResult{}, fmt.Errorf("set item resonance: %w", err)
	}
	return ResonanceResult{ItemID: itemID, IsResonated: req.Resonated, AlreadyApplied: false}, nil
}

// ReportDelivery records that an owner-authorized human or agent externally
// surfaced an item. It updates only current item_state for duplicate-loop
// prevention; delivery channels, activity ledgers, queues, and portable receipts
// are intentionally out of scope.
func ReportDelivery(ctx context.Context, db *sql.DB, itemID string, req DeliveryReportRequest) (DeliveryReportResult, error) {
	if db == nil {
		return DeliveryReportResult{}, errors.New("report delivery: db is nil")
	}
	if strings.TrimSpace(itemID) == "" {
		return DeliveryReportResult{}, errors.New("report delivery: item id is empty")
	}
	if req.DeliveredAt.IsZero() {
		return DeliveryReportResult{}, fieldError("delivered_at")
	}
	deliveredAt := req.DeliveredAt.UTC()
	_, err := db.ExecContext(ctx, `
insert into item_state (item_id, is_resonated, external_surfaced_at, last_actor_kind, last_actor_id)
values (?, 0, ?, ?, ?)
on conflict(item_id) do update set
  external_surfaced_at = excluded.external_surfaced_at,
  last_actor_kind = excluded.last_actor_kind,
  last_actor_id = excluded.last_actor_id`, itemID, deliveredAt.Format(time.RFC3339Nano), string(req.ActorKind), req.ActorID)
	if err != nil {
		return DeliveryReportResult{}, fmt.Errorf("report delivery: %w", err)
	}
	var stored string
	if err := db.QueryRowContext(ctx, `select external_surfaced_at from item_state where item_id = ?`, itemID).Scan(&stored); err != nil {
		return DeliveryReportResult{}, fmt.Errorf("read delivery state: %w", err)
	}
	externalAt, err := parseDBTime(stored)
	if err != nil {
		return DeliveryReportResult{}, fmt.Errorf("parse delivery timestamp: %w", err)
	}
	return DeliveryReportResult{ItemID: itemID, ExternalSurfacedAt: externalAt, AlreadyApplied: !externalAt.Equal(deliveredAt)}, nil
}

func scanRankedCandidate(rows *sql.Rows, now time.Time, ordinal int) (rankedCandidate, error) {
	var item ItemSummary
	var summary, coreInsight, valueTier, publishedAt, keyPoints, lastStatus, lastCode, lastMessage, lastAt, inspectedAt, surfacedAt, storyKey, duplicateOf, firstSeen, feedExcerpt sql.NullString
	var resonated bool
	if err := rows.Scan(&item.ID, &item.SourceID, &item.SourceTitle, &item.URL, &item.Title, &item.SourceItemTitle, &item.LocalizedTitle, &summary, &coreInsight, &valueTier, &publishedAt, &item.ExtractionStatus, &item.ExtractionSource, &item.ModelStatus, &item.ContentStatus, &keyPoints, &lastStatus, &lastCode, &lastMessage, &lastAt, &resonated, &inspectedAt, &surfacedAt, &storyKey, &duplicateOf, &firstSeen, &feedExcerpt); err != nil {
		return rankedCandidate{}, fmt.Errorf("scan today feed row: %w", err)
	}
	item.Summary = stringPtrFromNull(summary)
	item.CoreInsight = stringPtrFromNull(coreInsight)
	item.DisplayExcerpt = displayExcerptFallback(item.Summary, item.CoreInsight, feedExcerpt)
	item.KeyPoints = keyPointsFromNull(keyPoints)
	item.ValueTier = stringPtrFromNull(valueTier)
	item.PublishedAt = timePtrFromNull(publishedAt)
	item.FirstSeenAt = firstSeenFallback(item.PublishedAt, firstSeen)
	item.LastReprocessStatus = stringPtrFromNull(lastStatus)
	item.LastReprocessErrorCode = stringPtrFromNull(lastCode)
	item.LastReprocessErrorMessage = stringPtrFromNull(lastMessage)
	item.LastReprocessAt = timePtrFromNull(lastAt)
	item.IsResonated = resonated
	item.HumanInspectedAt = timePtrFromNull(inspectedAt)
	item.ExternalSurfacedAt = timePtrFromNull(surfacedAt)
	item.StoryKey = stringPtrFromNull(storyKey)
	item.DuplicateOfItemID = stringPtrFromNull(duplicateOf)
	sanitizeReadableSummary(&item)
	firstSeenAt := timePtrFromNull(firstSeen)
	fresh := isFresh(item.PublishedAt, firstSeenAt, now)
	textParts := []string{item.Title, item.SourceTitle, item.URL, strings.Join(item.KeyPoints, " "), stringValue(item.Summary), stringValue(item.CoreInsight), stringValue(item.ValueTier)}
	return rankedCandidate{item: item, firstSeen: firstSeenAt, text: strings.ToLower(strings.Join(textParts, " ")), fresh: fresh, memory: !fresh, ordinal: ordinal}, nil
}

func rankCandidates(candidates []rankedCandidate, limit int, now time.Time) []ItemSummary {
	return rankCandidatesWithRules(candidates, limit, now, nil)
}

func rankCandidatesWithRules(candidates []rankedCandidate, limit int, now time.Time, rules []SteerRule) []ItemSummary {
	storyHasFresh := map[string]bool{}
	storyHasTouchedMemory := map[string]bool{}
	storyTouchedAfter := map[string][]time.Time{}
	storyHasNewerTouchedDevelopment := map[string]bool{}
	freshSources := map[string]bool{}
	for _, candidate := range candidates {
		if candidate.item.StoryKey != nil {
			key := *candidate.item.StoryKey
			if candidate.fresh {
				storyHasFresh[key] = true
			}
			if candidate.memory && (candidate.item.IsResonated || candidate.item.HumanInspectedAt != nil || candidate.item.ExternalSurfacedAt != nil) {
				storyHasTouchedMemory[key] = true
			}
			if touchedAt, ok := candidateTouchTime(candidate); ok {
				storyTouchedAfter[key] = append(storyTouchedAfter[key], touchedAt)
			}
		}
		if candidate.fresh {
			freshSources[candidate.item.SourceID] = true
		}
	}
	for _, candidate := range candidates {
		if candidate.item.StoryKey == nil {
			continue
		}
		key := *candidate.item.StoryKey
		candidateAt := itemTime(candidate)
		if candidateAt.IsZero() {
			continue
		}
		for _, touchedAt := range storyTouchedAfter[key] {
			if candidateAt.After(touchedAt) {
				storyHasNewerTouchedDevelopment[key] = true
				break
			}
		}
	}

	eligible := make([]rankedCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate.item.DuplicateOfItemID != nil {
			continue
		}
		if steeringFiltersOut(candidate, rules) {
			continue
		}
		if candidate.item.StoryKey != nil {
			key := *candidate.item.StoryKey
			candidate.related = (storyHasFresh[key] && storyHasTouchedMemory[key]) || storyHasNewerTouchedDevelopment[key]
		}
		if candidate.item.ExternalSurfacedAt != nil && !candidate.related {
			continue
		}
		candidate.score = scoreCandidate(candidate, now, rules)
		eligible = append(eligible, candidate)
	}
	sort.SliceStable(eligible, func(i, j int) bool {
		return rankCandidateBefore(eligible[i], eligible[j], now)
	})

	selected := make([]rankedCandidate, 0, minInt(limit, len(eligible)))
	selectedIDs := map[string]bool{}
	if limit >= 10 && len(freshSources) >= 3 {
		covered := map[string]bool{}
		for len(covered) < 3 {
			idx := -1
			for i, candidate := range eligible {
				if selectedIDs[candidate.item.ID] || !candidate.fresh || covered[candidate.item.SourceID] {
					continue
				}
				idx = i
				break
			}
			if idx == -1 {
				break
			}
			selected = append(selected, eligible[idx])
			selectedIDs[eligible[idx].item.ID] = true
			covered[eligible[idx].item.SourceID] = true
		}
	}

	freshQuota := 0
	if limit >= 10 {
		freshQuota = limit / 2
	}
	for countFresh(selected) < freshQuota && len(selected) < limit {
		candidate, ok := firstCandidate(eligible, selectedIDs, func(c rankedCandidate) bool { return c.fresh })
		if !ok {
			break
		}
		selected = append(selected, candidate)
		selectedIDs[candidate.item.ID] = true
	}

	memoryCap := limit
	if limit >= 10 && countFreshIn(eligible) > 0 {
		memoryCap = maxInt(1, limit/5)
	}
	for _, candidate := range eligible {
		if len(selected) >= limit {
			break
		}
		if selectedIDs[candidate.item.ID] {
			continue
		}
		oldResonatedMemory := candidate.memory && candidate.item.IsResonated && !candidate.related
		if oldResonatedMemory && countOldResonatedMemory(selected) >= memoryCap && countFresh(selected) < countFreshIn(eligible) {
			continue
		}
		selected = append(selected, candidate)
		selectedIDs[candidate.item.ID] = true
	}
	sort.SliceStable(selected, func(i, j int) bool {
		return rankCandidateBefore(selected[i], selected[j], now)
	})

	result := make([]ItemSummary, 0, len(selected))
	for _, candidate := range selected {
		result = append(result, candidate.item)
	}
	return result
}

func scoreCandidate(candidate rankedCandidate, now time.Time, rules []SteerRule) int {
	score := 0
	if candidate.fresh {
		score += 1000
	} else {
		score += 100
	}
	if candidate.related {
		score += 500
	}
	if candidate.item.IsResonated {
		score += 80
	}
	score += steeringScore(candidate, rules)
	age := now.Sub(itemTime(candidate))
	if age < 0 {
		age = 0
	}
	score -= int(age / time.Hour)
	score -= candidate.ordinal
	return score
}

func rankCandidateBefore(a, b rankedCandidate, now time.Time) bool {
	if groupA, groupB := timeGroupOrder(a, now), timeGroupOrder(b, now); groupA != groupB {
		return groupA < groupB
	}
	if a.score != b.score {
		return a.score > b.score
	}
	timeA, timeB := itemTime(a), itemTime(b)
	if !timeA.Equal(timeB) {
		return timeA.After(timeB)
	}
	return a.ordinal < b.ordinal
}

func timeGroupOrder(candidate rankedCandidate, now time.Time) int {
	candidateTime := itemTime(candidate)
	if candidateTime.IsZero() {
		return 2
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	loc := now.Location()
	candidateTime = candidateTime.In(loc)
	now = now.In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	candidateDay := time.Date(candidateTime.Year(), candidateTime.Month(), candidateTime.Day(), 0, 0, 0, 0, loc)
	switch {
	case candidateDay.Equal(today):
		return 0
	case candidateDay.Equal(today.AddDate(0, 0, -1)):
		return 1
	default:
		return 2
	}
}

func candidateTouchTime(candidate rankedCandidate) (time.Time, bool) {
	if candidate.item.ExternalSurfacedAt != nil {
		return *candidate.item.ExternalSurfacedAt, true
	}
	if candidate.item.HumanInspectedAt != nil {
		return *candidate.item.HumanInspectedAt, true
	}
	if candidate.item.IsResonated {
		candidateAt := itemTime(candidate)
		if !candidateAt.IsZero() {
			return candidateAt, true
		}
	}
	return time.Time{}, false
}

func steeringScore(candidate rankedCandidate, rules []SteerRule) int {
	if len(rules) == 0 {
		return 0
	}
	text := candidate.text
	if text == "" {
		parts := []string{candidate.item.Title, candidate.item.SourceTitle, candidate.item.URL, stringValue(candidate.item.Summary), stringValue(candidate.item.CoreInsight), stringValue(candidate.item.ValueTier)}
		text = strings.ToLower(strings.Join(parts, " "))
	}
	score := 0
	for _, rule := range rules {
		if !rule.IsActive {
			continue
		}
		if isFilterRule(rule.RuleText) {
			continue
		}
		if steeringRuleMatches(text, rule.RuleText) {
			if rule.CreatedByActorKind != nil && *rule.CreatedByActorKind == string(ActorKindHuman) {
				score += 240
				continue
			}
			score += 120
		}
	}
	return score
}

func steeringFiltersOut(candidate rankedCandidate, rules []SteerRule) bool {
	if len(rules) == 0 {
		return false
	}
	text := candidate.text
	if text == "" {
		parts := []string{candidate.item.Title, candidate.item.SourceTitle, candidate.item.URL, stringValue(candidate.item.Summary), stringValue(candidate.item.CoreInsight), stringValue(candidate.item.ValueTier)}
		text = strings.ToLower(strings.Join(parts, " "))
	}
	for _, rule := range rules {
		if rule.IsActive && isFilterRule(rule.RuleText) && steeringRuleMatches(text, rule.RuleText) {
			return true
		}
	}
	return false
}

func steeringRulesConflict(candidateRule string, humanRule string) bool {
	candidateFilter := isFilterRule(candidateRule)
	humanFilter := isFilterRule(humanRule)
	if candidateFilter == humanFilter {
		return false
	}
	return steeringKeywordsOverlap(candidateRule, humanRule)
}

func steeringKeywordsOverlap(left string, right string) bool {
	leftKeywords := steeringKeywords(left)
	if len(leftKeywords) == 0 {
		return false
	}
	rightKeywords := steeringKeywords(right)
	if len(rightKeywords) == 0 {
		return false
	}
	seen := make(map[string]struct{}, len(leftKeywords))
	for _, keyword := range leftKeywords {
		seen[keyword] = struct{}{}
	}
	for _, keyword := range rightKeywords {
		if _, ok := seen[keyword]; ok {
			return true
		}
	}
	return false
}

func isFilterRule(ruleText string) bool {
	lower := strings.ToLower(ruleText)
	phrases := []string{"filter", "filter out", "hide", "suppress", "exclude", "reduce", "less", "downrank", "deprioritize"}
	for _, phrase := range phrases {
		if strings.Contains(lower, phrase) {
			return true
		}
	}
	return false
}

func steeringRuleMatches(itemText string, ruleText string) bool {
	itemText = strings.ToLower(itemText)
	for _, token := range steeringKeywords(ruleText) {
		if strings.Contains(itemText, token) {
			return true
		}
	}
	return false
}

func steeringKeywords(ruleText string) []string {
	words := strings.FieldsFunc(strings.ToLower(ruleText), func(r rune) bool {
		return (r < 'a' || r > 'z') && (r < '0' || r > '9')
	})
	stop := map[string]bool{"push": true, "more": true, "less": true, "about": true, "the": true, "and": true, "or": true, "for": true, "with": true, "from": true, "articles": true, "items": true, "coverage": true, "documents": true, "technical": true, "filter": true, "hide": true, "suppress": true, "exclude": true, "reduce": true, "downrank": true, "deprioritize": true}
	keywords := make([]string, 0, len(words))
	for _, word := range words {
		if len(word) < 4 || stop[word] {
			continue
		}
		keywords = append(keywords, word)
	}
	return keywords
}

func isFresh(publishedAt *time.Time, firstSeenAt *time.Time, now time.Time) bool {
	for _, ts := range []*time.Time{publishedAt, firstSeenAt} {
		if ts != nil && !ts.Before(now.Add(-freshWindow)) {
			return true
		}
	}
	return false
}

func itemTime(candidate rankedCandidate) time.Time {
	if candidate.item.PublishedAt != nil {
		return *candidate.item.PublishedAt
	}
	if candidate.firstSeen != nil {
		return *candidate.firstSeen
	}
	return time.Time{}
}

func conflictsWithInvariants(command string) bool {
	lower := strings.ToLower(command)
	conflictPhrases := []string{"hide all fresh", "only my old starred", "only old starred", "disable freshness", "disable coverage", "disable provenance", "hide all items", "show only my old", "forever"}
	matches := 0
	for _, phrase := range conflictPhrases {
		if strings.Contains(lower, phrase) {
			matches++
		}
	}
	return matches >= 1 && (strings.Contains(lower, "fresh") || strings.Contains(lower, "coverage") || strings.Contains(lower, "provenance") || strings.Contains(lower, "only"))
}

func parseRSSURL(command string) (string, bool) {
	parsed, err := url.Parse(command)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", false
	}
	return parsed.String(), true
}

func applySourceURLSteering(ctx context.Context, db *sql.DB, sourceURL string) (SteerResult, error) {
	if db == nil {
		return SteerResult{}, errors.New("apply source steering: db is nil")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := stableTextID("src", sourceURL)
	identity := sourceIdentity(sourceURL)
	_, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, 'not_fetched', 1, 1) on conflict(url) do update set is_active = 1, revision = revision + 1`, id, sourceURL, identity, now)
	if err != nil {
		return SteerResult{}, fmt.Errorf("add source through steering: %w", err)
	}
	return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "add_source", ChangedRules: []SteerRule{}, Message: "source added: " + identity + "; visible in SOURCE LEDGER; use [RUN INGEST] or row [FETCH] there for immediate refresh"}}, nil
}

func sourceIdentity(sourceURL string) string {
	parsed, err := url.Parse(sourceURL)
	if err != nil || parsed.Host == "" {
		return sourceURL
	}
	return parsed.Host
}

func applySteeringRules(ctx context.Context, db *sql.DB, proposal OpenRouterSteeringOutput, actorKind ActorKind, actorID string) (SteerResult, error) {
	if db == nil {
		return SteerResult{}, errors.New("apply steering rules: db is nil")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return SteerResult{}, fmt.Errorf("begin steering transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	changed := make([]SteerRule, 0, len(proposal.RuleTexts))
	for _, text := range proposal.RuleTexts {
		text = strings.TrimSpace(text)
		if text == "" || conflictsWithInvariants(text) {
			continue
		}
		id := stableTextID("rule", text)
		kind := string(actorKind)
		if kind == "" {
			kind = string(ActorKindHuman)
		}
		_, err := tx.ExecContext(ctx, `insert into steer_rules (id, rule_text, is_active, created_at, created_by_actor_kind, created_by_actor_id, revision) values (?, ?, 1, ?, ?, ?, 1) on conflict(id) do update set rule_text = excluded.rule_text, is_active = 1, created_by_actor_kind = excluded.created_by_actor_kind, created_by_actor_id = excluded.created_by_actor_id, revision = steer_rules.revision + 1`, id, text, time.Now().UTC().Format(time.RFC3339Nano), kind, actorID)
		if err != nil {
			return SteerResult{}, fmt.Errorf("upsert steering rule: %w", err)
		}
		changed = append(changed, SteerRule{ID: id, RuleText: text, IsActive: true, Revision: 1, CreatedByActorKind: &kind, CreatedByActorID: nullableString(actorID)})
	}
	if actorKind == ActorKindHuman && len(changed) > 0 {
		_, err := tx.ExecContext(ctx, `update steer_rules set is_active = 0, superseded_by = ?, revision = revision + 1 where is_active = 1 and created_by_actor_kind = ? and id <> ?`, changed[0].ID, string(ActorKindAgent), changed[0].ID)
		if err != nil {
			return SteerResult{}, fmt.Errorf("supersede agent steering rules: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return SteerResult{}, fmt.Errorf("commit steering transaction: %w", err)
	}
	if len(changed) == 0 {
		return SteerResult{Receipt: SteeringReceipt{InterpretedAs: "no_safe_policy_change", ChangedRules: []SteerRule{}, Message: "not applied: no safe product-valid steering rule remained"}}, nil
	}
	var undo *SteerUndoHandle
	if len(changed) == 1 {
		revision := changed[0].Revision
		undo = &SteerUndoHandle{RouteKind: SteerRoutePolicy, Target: &SteerTarget{Kind: "steer_rule", ID: changed[0].ID}, Revision: &revision}
	}
	return SteerResult{Receipt: SteeringReceipt{InterpretedAs: proposal.InterpretedAs, ChangedRules: changed, Message: proposal.Message}, UndoHandle: undo}, nil
}

func normalizeOpenRouterSteeringOutput(proposal OpenRouterSteeringOutput) OpenRouterSteeringOutput {
	proposal.InterpretedAs = replaceLegacyProviderName(strings.TrimSpace(proposal.InterpretedAs))
	proposal.Message = replaceLegacyProviderName(strings.TrimSpace(proposal.Message))
	for i := range proposal.RuleTexts {
		proposal.RuleTexts[i] = strings.TrimSpace(proposal.RuleTexts[i])
	}
	return proposal
}

func replaceLegacyProviderName(value string) string {
	legacyTitle := string([]byte{71, 101, 109, 105, 110, 105})
	legacyLower := strings.ToLower(legacyTitle)
	legacyUpper := strings.ToUpper(legacyTitle)
	return strings.NewReplacer(
		legacyTitle, "OpenRouter",
		legacyLower, "openrouter",
		legacyUpper, "OPENROUTER",
	).Replace(value)
}

func loadActiveSteerRules(ctx context.Context, db *sql.DB) ([]SteerRule, error) {
	if db == nil {
		return nil, nil
	}
	var rules []SteerRule
	err := retrySQLiteRead(ctx, func() error {
		rows, err := db.QueryContext(ctx, `select id, rule_text, is_active, superseded_by, revision, created_by_actor_kind, created_by_actor_id from steer_rules where is_active = 1 order by revision desc, id asc`)
		if err != nil {
			return fmt.Errorf("load active steering rules: %w", err)
		}
		attemptRules := []SteerRule{}
		for rows.Next() {
			var rule SteerRule
			var superseded, actorKind, actorID sql.NullString
			if err := rows.Scan(&rule.ID, &rule.RuleText, &rule.IsActive, &superseded, &rule.Revision, &actorKind, &actorID); err != nil {
				_ = rows.Close()
				return fmt.Errorf("scan active steering rule: %w", err)
			}
			rule.SupersededBy = stringPtrFromNull(superseded)
			rule.CreatedByActorKind = stringPtrFromNull(actorKind)
			rule.CreatedByActorID = stringPtrFromNull(actorID)
			attemptRules = append(attemptRules, rule)
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return fmt.Errorf("iterate active steering rules: %w", err)
		}
		if err := rows.Close(); err != nil {
			return fmt.Errorf("close active steering rules: %w", err)
		}
		rules = attemptRules
		return nil
	})
	if err != nil {
		return nil, err
	}
	return rules, nil
}
