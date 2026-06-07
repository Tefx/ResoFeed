package resofeed

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"
)

var idempotencyReceiptMu sync.Mutex

// withIdempotencyReceipt is the single implementation of receipt-backed request
// fingerprint semantics: fingerprints are computed from the validated operation
// payload, live same-key/same-fingerprint calls replay the stored snapshot,
// live same-key/different-fingerprint calls are rejected, and expired rows are
// deleted transactionally before the key is accepted as fresh.
func withIdempotencyReceipt[T any](ctx context.Context, db *sql.DB, key string, actorID string, operation string, itemID string, fingerprintPayload any, target *T, apply func() (T, error)) (bool, error) {
	return withIdempotencyReceiptInternal(ctx, db, key, actorID, operation, itemID, fingerprintPayload, target, apply, nil)
}

func withIdempotencyReceiptFinalContext[T any](ctx context.Context, db *sql.DB, key string, actorID string, operation string, itemID string, fingerprintPayload any, target *T, apply func() (T, error), finalContext func() (context.Context, context.CancelFunc)) (bool, error) {
	return withIdempotencyReceiptInternal(ctx, db, key, actorID, operation, itemID, fingerprintPayload, target, apply, finalContext)
}

func withIdempotencyReceiptInternal[T any](ctx context.Context, db *sql.DB, key string, actorID string, operation string, itemID string, fingerprintPayload any, target *T, apply func() (T, error), finalContext func() (context.Context, context.CancelFunc)) (bool, error) {
	if db == nil {
		return false, errors.New("idempotency receipt: db is nil")
	}
	if target == nil {
		return false, errors.New("idempotency receipt: target is nil")
	}
	if apply == nil {
		return false, errors.New("idempotency receipt: apply function is nil")
	}
	if err := ctx.Err(); err != nil {
		return false, fmt.Errorf("idempotency receipt: %w", err)
	}
	fingerprint, err := idempotencyFingerprint(operation, itemID, fingerprintPayload)
	if err != nil {
		return false, err
	}

	idempotencyReceiptMu.Lock()
	defer idempotencyReceiptMu.Unlock()

	now := time.Now().UTC()
	replayed, found, err := readLiveReceiptLocked(ctx, db, key, fingerprint, now, target)
	if err != nil {
		return false, err
	}
	if found {
		return replayed, nil
	}

	result, err := apply()
	if err != nil {
		return false, err
	}
	data, err := json.Marshal(result)
	if err != nil {
		return false, fmt.Errorf("encode idempotency receipt snapshot: %w", err)
	}
	writeCtx := ctx
	cancelWrite := func() {}
	if finalContext != nil {
		writeCtx, cancelWrite = finalContext()
		if writeCtx == nil {
			return false, errors.New("idempotency receipt: final context is nil")
		}
	}
	defer cancelWrite()
	if err := insertReceiptLocked(writeCtx, db, key, actorID, operation, itemID, fingerprint, string(data), now); err != nil {
		return false, err
	}
	*target = result
	return false, nil
}

func readLiveReceiptLocked[T any](ctx context.Context, db *sql.DB, key string, fingerprint string, now time.Time, target *T) (bool, bool, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return false, false, fmt.Errorf("begin idempotency receipt read: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var snapshot string
	var storedFingerprint sql.NullString
	var createdAtRaw string
	err = tx.QueryRowContext(ctx, `select result_snapshot, request_fingerprint, created_at from agent_receipts where idempotency_key = ?`, key).Scan(&snapshot, &storedFingerprint, &createdAtRaw)
	if err == nil {
		createdAt, parseErr := parseReceiptCreatedAt(createdAtRaw)
		if parseErr != nil || !createdAt.Add(ReceiptLiveTTL).After(now) {
			if _, err := tx.ExecContext(ctx, `delete from agent_receipts where idempotency_key = ?`, key); err != nil {
				return false, false, fmt.Errorf("delete expired idempotency receipt: %w", err)
			}
			if err := tx.Commit(); err != nil {
				return false, false, fmt.Errorf("commit expired idempotency receipt cleanup: %w", err)
			}
			return false, false, nil
		}
		if storedFingerprint.Valid && storedFingerprint.String != fingerprint {
			return false, true, fieldErrorReason("idempotency_key", "request_fingerprint_mismatch")
		}
		if err := json.Unmarshal([]byte(snapshot), target); err != nil {
			return false, true, fmt.Errorf("decode idempotency receipt snapshot: %w", err)
		}
		if err := tx.Commit(); err != nil {
			return false, true, fmt.Errorf("commit idempotency receipt replay: %w", err)
		}
		return true, true, nil
	}
	if err != sql.ErrNoRows {
		return false, false, fmt.Errorf("read idempotency receipt: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return false, false, fmt.Errorf("commit idempotency receipt miss: %w", err)
	}
	return false, false, nil
}

func insertReceiptLocked(ctx context.Context, db *sql.DB, key string, actorID string, operation string, itemID string, fingerprint string, snapshot string, now time.Time) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin idempotency receipt write: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	_, err = tx.ExecContext(ctx, `insert into agent_receipts (idempotency_key, actor_id, operation, item_id, created_at, result_snapshot, request_fingerprint) values (?, ?, ?, ?, ?, ?, ?)`, key, actorID, operation, nullableStringValue(itemID), now.Format(time.RFC3339Nano), snapshot, fingerprint)
	if err != nil {
		return fmt.Errorf("write idempotency receipt: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit idempotency receipt write: %w", err)
	}
	return nil
}

func parseReceiptCreatedAt(raw string) (time.Time, error) {
	if parsed, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return parsed.UTC(), nil
	}
	if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
		return parsed.UTC(), nil
	}
	return time.Time{}, fmt.Errorf("parse receipt created_at %q", raw)
}

func idempotencyFingerprint(operation string, itemID string, payload any) (string, error) {
	data, err := json.Marshal(struct {
		Operation string `json:"operation"`
		ItemID    string `json:"item_id"`
		Payload   any    `json:"payload"`
	}{Operation: operation, ItemID: itemID, Payload: payload})
	if err != nil {
		return "", fmt.Errorf("encode idempotency fingerprint: %w", err)
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func mutationFingerprintPayload(fields MutationRequestFields) struct {
	ActorKind ActorKind `json:"actor_kind"`
	ActorID   string    `json:"actor_id"`
} {
	return struct {
		ActorKind ActorKind `json:"actor_kind"`
		ActorID   string    `json:"actor_id"`
	}{ActorKind: fields.ActorKind, ActorID: fields.ActorID}
}

func steerFingerprintPayload(req SteerRequest, route SteerRouteKind) struct {
	Command   string         `json:"command"`
	ActorKind ActorKind      `json:"actor_kind"`
	ActorID   string         `json:"actor_id"`
	RouteKind SteerRouteKind `json:"route_kind"`
} {
	return struct {
		Command   string         `json:"command"`
		ActorKind ActorKind      `json:"actor_kind"`
		ActorID   string         `json:"actor_id"`
		RouteKind SteerRouteKind `json:"route_kind"`
	}{Command: req.Command, ActorKind: req.ActorKind, ActorID: req.ActorID, RouteKind: route}
}
