package resofeed

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

func decodeItemRouteToken(token string) (string, bool) {
	if !strings.HasPrefix(token, "~") || len(token) == 1 {
		return "", false
	}
	payload := token[1:]
	decoded, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil || !utf8.Valid(decoded) {
		return "", false
	}
	itemID := string(decoded)
	if "~"+base64.RawURLEncoding.EncodeToString(decoded) != token {
		return "", false
	}
	return itemID, true
}

// reingestOpaqueItem preserves the shared re-ingest guard, receipt, and
// persistence behavior while admitting the full opaque-ID domain decoded from
// the canonical HTTP route token. MCP keeps its existing direct-input boundary.
func reingestOpaqueItem(ctx context.Context, db *sql.DB, llm LLMClient, itemID string, req ItemReingestRequest) (ItemReingestResponse, error) {
	if err := ctx.Err(); err != nil {
		return ItemReingestResponse{}, fmt.Errorf("reingest item: %w", err)
	}
	if db == nil {
		return ItemReingestResponse{}, errors.New("reingest item: db required")
	}
	if itemID == "" {
		return ItemReingestResponse{}, fieldError("item_id")
	}
	if err := validateItemReingestRequest(req); err != nil {
		return ItemReingestResponse{}, err
	}
	release, err := tryAcquireIngestGuardWithActor(ctx, "item_reingest", itemID, string(req.ActorKind))
	if err != nil {
		return ItemReingestResponse{}, err
	}
	updateCurrentOperation("loading_item", &CurrentOperationCount{Current: 0, Total: 1}, "item reingest loading selected item")
	var retErr error
	defer releaseGuardRecover(release, &retErr, "reingest item")

	var response ItemReingestResponse
	applied, err := withIdempotencyReceiptFinalContext(ctx, db, req.IdempotencyKey, req.ActorID, "reingest_item", itemID, itemReingestFingerprintPayload(req), &response, func() (ItemReingestResponse, error) {
		return reingestItemUnlocked(ctx, db, llm, itemID, req)
	}, func() (context.Context, context.CancelFunc) {
		return context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	})
	if err != nil {
		return ItemReingestResponse{}, err
	}
	if applied {
		response.AlreadyApplied = true
	}
	return response, retErr
}
