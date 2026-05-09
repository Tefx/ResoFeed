package resofeed

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

func withIdempotencyReceipt[T any](ctx context.Context, db *sql.DB, key string, actorID string, operation string, itemID string, fingerprintPayload any, target *T, apply func() (T, error)) (bool, error) {
	if db == nil {
		return false, errors.New("idempotency receipt: db is nil")
	}
	fingerprint, err := idempotencyFingerprint(operation, itemID, fingerprintPayload)
	if err != nil {
		return false, err
	}

	var snapshot string
	var storedFingerprint sql.NullString
	err = db.QueryRowContext(ctx, `select result_snapshot, request_fingerprint from agent_receipts where idempotency_key = ?`, key).Scan(&snapshot, &storedFingerprint)
	if err == nil {
		if storedFingerprint.Valid && storedFingerprint.String != fingerprint {
			return false, fieldError("idempotency_key")
		}
		if err := json.Unmarshal([]byte(snapshot), target); err != nil {
			return false, fmt.Errorf("decode idempotency receipt snapshot: %w", err)
		}
		return true, nil
	}
	if err != sql.ErrNoRows {
		return false, fmt.Errorf("read idempotency receipt: %w", err)
	}

	result, err := apply()
	if err != nil {
		return false, err
	}
	data, err := json.Marshal(result)
	if err != nil {
		return false, fmt.Errorf("encode idempotency receipt snapshot: %w", err)
	}
	_, err = db.ExecContext(ctx, `insert into agent_receipts (idempotency_key, actor_id, operation, item_id, created_at, result_snapshot, request_fingerprint) values (?, ?, ?, ?, ?, ?, ?)`, key, actorID, operation, nullableStringValue(itemID), time.Now().UTC().Format(time.RFC3339Nano), string(data), fingerprint)
	if err != nil {
		return false, fmt.Errorf("write idempotency receipt: %w", err)
	}
	*target = result
	return false, nil
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
