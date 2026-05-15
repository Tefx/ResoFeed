package resofeed

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

// ErrSteerContractOnly marks signatures reserved by the acceptance contract.
// It exists so callers cannot mistake this step's stubs for completed runtime
// business logic.
var ErrSteerContractOnly = errors.New("steer contract only: runtime mutation not implemented in this step")

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
// receipts, enqueue jobs, or update an undo stack.
func PreviewSteering(ctx context.Context, db *sql.DB, llm LLMClient, req SteerPreviewRequest) (SteerPreviewResult, error) {
	return SteerPreviewResult{}, ErrSteerContractOnly
}

// CommitSteering pins the mutating commit signature and delegates future runtime
// work to the canonical SteerRequest idempotency boundary. Completed mutation
// logic is intentionally absent from this contract-lock step.
func CommitSteering(ctx context.Context, db *sql.DB, llm LLMClient, req SteerRequest) (SteerResult, error) {
	return SteerResult{}, ErrSteerContractOnly
}

// UndoSteering pins target-specific undo. Future implementation must use the
// supplied handle target only and must not maintain command history, a global
// undo stack, jobs, queues, sync state, or an activity ledger.
func UndoSteering(ctx context.Context, db *sql.DB, req SteerUndoRequest) (SteerUndoResult, error) {
	return SteerUndoResult{}, ErrSteerContractOnly
}

func isLexicalSearchAlias(command string) bool {
	if strings.EqualFold(command, "search") {
		return true
	}
	prefix, _, ok := strings.Cut(command, " ")
	return ok && strings.EqualFold(prefix, "search")
}

func looksLikeRSSURL(command string) bool {
	_, ok := parseRSSURL(command)
	return ok
}
