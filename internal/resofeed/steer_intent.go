package resofeed

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ClassifySteerRoute pins the Go-side classifier signature for Steer preview,
// commit routing, lexical search aliasing, /doctor, source subscription, policy
// updates, and invariant-conflict receipts. It performs only local route
// classification; it writes no database rows and creates no durable receipts.
func ClassifySteerRoute(command string) SteerRouteKind {
	command = strings.TrimSpace(command)
	switch {
	case command == "":
		return SteerRouteUnknown
	case strings.EqualFold(command, "/doctor"):
		return SteerRouteDoctor
	case conflictsWithInvariants(command):
		return SteerRouteInvariantConflict
	case isVagueAddAlias(command):
		return SteerRouteUnknown
	case hasSourceAddURL(command):
		return SteerRouteSource
	case isLexicalSearchAlias(command):
		return SteerRouteSearch
	case looksLikeRSSURL(command):
		return SteerRouteSource
	default:
		return SteerRoutePolicy
	}
}

// PreviewSteering pins the non-mutating preview signature. It must remain safe
// to call without an idempotency key and must not write SQLite state, create
// receipts, enqueue jobs, or update an undo stack. WillMutate describes whether
// this preview call mutates durable state, so preview responses always leave it
// false even when a later commit for the same route could mutate.
func PreviewSteering(ctx context.Context, db *sql.DB, llm LLMClient, req SteerPreviewRequest) (SteerPreviewResult, error) {
	if err := ctx.Err(); err != nil {
		return SteerPreviewResult{}, fmt.Errorf("preview steering: %w", err)
	}
	command := strings.TrimSpace(req.Command)
	preview := SteerPreview{RouteKind: ClassifySteerRoute(command), ChangedRules: []SteerRule{}, Message: "not applied: no safe product-valid steering rule remained"}
	switch preview.RouteKind {
	case SteerRouteDoctor:
		preview.InterpretedAs = "doctor"
		preview.Message = "preview: /doctor diagnostics; no mutation"
	case SteerRouteSource:
		sourceURL, _ := sourceURLFromSteerCommand(command)
		preview.InterpretedAs = "add_source"
		preview.Message = "preview: syntactic RSS URL accepted; commit can add source without fetching or guessing: " + sourceURL
	case SteerRouteSearch:
		query, alias := lexicalQueryFromSteerCommand(command)
		preview.InterpretedAs = "lexical_search"
		preview.LexicalSearchQuery = &SearchQueryEcho{Q: query, Limit: defaultSearchLimit}
		preview.Message = "preview: lexical search only; no vector DB, embeddings, RAG, hidden retrieval expansion, or generated answer"
		if strings.EqualFold(alias, "find") {
			preview.Message = "warning: find is treated as lexical search; no generated answer, vector DB, embeddings, RAG, or hidden retrieval expansion"
		}
	case SteerRouteInvariantConflict:
		preview.InterpretedAs = "invariant_conflict"
		preview.Message = invariantConflictMessage()
	case SteerRouteUnknown:
		preview.InterpretedAs = "unknown"
		preview.Message = "not applied: RSS URL required for add source"
	case SteerRoutePolicy:
		preview.InterpretedAs = "no_safe_policy_change"
		if llm != nil {
			active, err := loadActiveSteerRules(ctx, db)
			if err != nil {
				return SteerPreviewResult{}, err
			}
			translated, err := llm.TranslateSteering(ctx, OpenRouterSteeringInput{Command: command, ActorKind: req.ActorKind, ActiveRules: active})
			if err != nil {
				return SteerPreviewResult{Preview: preview}, nil
			}
			translated = normalizeOpenRouterSteeringOutput(translated)
			if translated.InterpretedAs != "" {
				preview.InterpretedAs = translated.InterpretedAs
			}
			if translated.Message != "" {
				preview.Message = translated.Message
			}
		}
	}
	return SteerPreviewResult{Preview: preview}, nil
}

// UndoSteering pins target-specific undo. Future implementation must use the
// supplied handle target only and must not maintain command history, a global
// undo stack, jobs, queues, sync state, or an activity ledger.
func UndoSteering(ctx context.Context, db *sql.DB, req SteerUndoRequest) (SteerUndoResult, error) {
	if err := ctx.Err(); err != nil {
		return SteerUndoResult{}, fmt.Errorf("undo steering: %w", err)
	}
	if db == nil {
		return SteerUndoResult{}, errors.New("undo steering: db is nil")
	}
	if req.UndoHandle.Target == nil || strings.TrimSpace(req.UndoHandle.Target.ID) == "" {
		return SteerUndoResult{}, fieldError("undo_handle")
	}
	target := req.UndoHandle.Target
	result := SteerUndoResult{RouteKind: req.UndoHandle.RouteKind, Target: target, Message: "target already inactive or unchanged", AlreadyApplied: false}
	switch target.Kind {
	case "steer_rule":
		rule, active, err := loadSteerRuleByID(ctx, db, target.ID)
		if err != nil {
			return SteerUndoResult{}, err
		}
		if active {
			if _, err := db.ExecContext(ctx, `update steer_rules set is_active = 0, revision = revision + 1 where id = ?`, target.ID); err != nil {
				return SteerUndoResult{}, fmt.Errorf("undo steer rule: %w", err)
			}
			result.Undone = true
			result.Message = "undone: target steer rule disabled"
		}
		result.RestoredRule = &rule
	case "source":
		source, active, err := loadSourceAnyStatus(ctx, db, target.ID)
		if err != nil {
			return SteerUndoResult{}, err
		}
		if active {
			if _, err := db.ExecContext(ctx, `update sources set is_active = 0, revision = revision + 1 where id = ?`, target.ID); err != nil {
				return SteerUndoResult{}, fmt.Errorf("undo source: %w", err)
			}
			result.Undone = true
			result.Message = "undone: target source disabled"
		}
		result.RestoredSource = &source
	default:
		return SteerUndoResult{}, fieldError("undo_handle.target.kind")
	}
	return result, nil
}

func isLexicalSearchAlias(command string) bool {
	command = strings.TrimSpace(command)
	prefix, _, ok := strings.Cut(command, " ")
	if !ok {
		prefix = command
	}
	switch strings.ToLower(prefix) {
	case "search", "/search", "搜索", "查", "find":
		return true
	}
	return false
}

func looksLikeRSSURL(command string) bool {
	_, ok := parseRSSURL(command)
	return ok
}

func isVagueAddAlias(command string) bool {
	_, rest, ok := sourceAddAlias(command)
	return ok && !looksLikeRSSURL(rest)
}

func hasSourceAddURL(command string) bool {
	_, ok := sourceURLFromSteerCommand(command)
	return ok
}

func sourceURLFromSteerCommand(command string) (string, bool) {
	command = strings.TrimSpace(command)
	if parsed, ok := parseRSSURL(command); ok {
		return parsed, true
	}
	_, rest, ok := sourceAddAlias(command)
	if !ok {
		return "", false
	}
	return parseRSSURL(rest)
}

func sourceAddAlias(command string) (string, string, bool) {
	prefix, rest, ok := strings.Cut(strings.TrimSpace(command), " ")
	if !ok {
		return "", "", false
	}
	switch strings.ToLower(prefix) {
	case "add", "/add", "添加":
		return prefix, strings.TrimSpace(rest), true
	default:
		return "", "", false
	}
}

func lexicalQueryFromSteerCommand(command string) (string, string) {
	command = strings.TrimSpace(command)
	prefix, rest, ok := strings.Cut(command, " ")
	if !ok {
		return "", command
	}
	return strings.TrimSpace(rest), prefix
}

func invariantConflictMessage() string {
	return "not fully applied: closest allowable interpretation preserves freshness, coverage/source diversity, provenance transparency, and minimalism"
}

func loadSteerRuleByID(ctx context.Context, db *sql.DB, id string) (SteerRule, bool, error) {
	var rule SteerRule
	var active bool
	var superseded, actorKind, actorID sql.NullString
	err := db.QueryRowContext(ctx, `select id, rule_text, is_active, superseded_by, revision, created_by_actor_kind, created_by_actor_id from steer_rules where id = ?`, id).Scan(&rule.ID, &rule.RuleText, &active, &superseded, &rule.Revision, &actorKind, &actorID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return SteerRule{}, false, notFoundError("steer_rule", id)
		}
		return SteerRule{}, false, fmt.Errorf("load steer rule %q: %w", id, err)
	}
	rule.IsActive = active
	rule.SupersededBy = stringPtrFromNull(superseded)
	rule.CreatedByActorKind = stringPtrFromNull(actorKind)
	rule.CreatedByActorID = stringPtrFromNull(actorID)
	return rule, active, nil
}

func loadSourceAnyStatus(ctx context.Context, db *sql.DB, id string) (Source, bool, error) {
	var source Source
	var lastFetch, lastFetchError sql.NullString
	err := db.QueryRowContext(ctx, `select id, url, title, last_fetch_at, last_fetch_status, last_fetch_error, is_active, revision from sources where id = ?`, id).Scan(&source.ID, &source.URL, &source.Title, &lastFetch, &source.LastFetchStatus, &lastFetchError, &source.IsActive, &source.Revision)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Source{}, false, notFoundError("source", id)
		}
		return Source{}, false, fmt.Errorf("load source %q: %w", id, err)
	}
	if lastFetch.Valid {
		if parsed, err := time.Parse(time.RFC3339Nano, lastFetch.String); err == nil {
			source.LastFetchAt = &parsed
		} else if parsed, err := time.Parse(time.RFC3339, lastFetch.String); err == nil {
			source.LastFetchAt = &parsed
		}
	}
	source.LastFetchError = stringPtrFromNull(lastFetchError)
	return source, source.IsActive, nil
}
