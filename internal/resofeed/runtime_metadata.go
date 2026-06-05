package resofeed

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"time"
)

// GetProcessingLanguage returns the persisted runtime processing language, or
// the contract default English when the metadata key is absent. It does not
// persist the default on read, keeping state export/import exclusion explicit.
func GetProcessingLanguage(ctx context.Context, db *sql.DB) (ProcessingLanguageInfo, error) {
	language, err := readProcessingLanguage(ctx, db)
	if err != nil {
		return ProcessingLanguageInfo{}, err
	}
	return processingLanguageInfo(language), nil
}

// SetProcessingLanguage stores the validated runtime-local processing language.
// The idempotency receipt is live-only runtime metadata and is not portable
// state; same-key/same-fingerprint replays the stored snapshot, while same-key
// fingerprint mismatch is rejected by the receipt helper.
func SetProcessingLanguage(ctx context.Context, db *sql.DB, req SetProcessingLanguageRequest) (ret ProcessingLanguageResponse, retErr error) {
	if err := validateProcessingLanguage(req.Language); err != nil {
		return ProcessingLanguageResponse{}, err
	}
	if req.ActorKind != ActorKindHuman && req.ActorKind != ActorKindAgent {
		return ProcessingLanguageResponse{}, fieldError("actor_kind")
	}
	if req.ActorID == "" || len([]byte(req.ActorID)) > 128 {
		return ProcessingLanguageResponse{}, fieldError("actor_id")
	}
	if req.IdempotencyKey == "" || len([]byte(req.IdempotencyKey)) > 200 {
		return ProcessingLanguageResponse{}, fieldError("idempotency_key")
	}
	release, err := tryAcquireIngestGuardWithActor(ctx, "language_write", "runtime_language", string(req.ActorKind))
	if err != nil {
		return ProcessingLanguageResponse{}, err
	}
	defer releaseGuardRecover(release, &retErr, "set processing language")
	var response ProcessingLanguageResponse
	applied, err := withIdempotencyReceipt(ctx, db, req.IdempotencyKey, req.ActorID, "set_processing_language", "", setProcessingLanguageFingerprintPayload(req), &response, func() (ProcessingLanguageResponse, error) {
		if err := storeRuntimeMetadata(ctx, db, RuntimeMetadataKeyProcessingLanguage, string(req.Language)); err != nil {
			return ProcessingLanguageResponse{}, fmt.Errorf("set processing language: %w", err)
		}
		return ProcessingLanguageResponse{Language: processingLanguageInfo(req.Language)}, nil
	})
	if err != nil {
		return ProcessingLanguageResponse{}, err
	}
	if applied {
		response.AlreadyApplied = true
	}
	return response, nil
}

func readProcessingLanguage(ctx context.Context, db *sql.DB) (ProcessingLanguage, error) {
	if db == nil {
		return "", errors.New("read processing language: db required")
	}
	var raw string
	err := retrySQLiteRead(ctx, func() error {
		raw = ""
		return db.QueryRowContext(ctx, `select value from runtime_metadata where key = ?`, RuntimeMetadataKeyProcessingLanguage).Scan(&raw)
	})
	if errors.Is(err, sql.ErrNoRows) {
		return ProcessingLanguageDefault, nil
	}
	if errors.Is(err, driver.ErrSkip) {
		return ProcessingLanguageDefault, nil
	}
	if err != nil {
		return "", fmt.Errorf("read processing language: %w", err)
	}
	language := ProcessingLanguage(raw)
	if err := validateProcessingLanguage(language); err != nil {
		return "", fmt.Errorf("read processing language: %w", err)
	}
	return language, nil
}

func validateProcessingLanguage(language ProcessingLanguage) error {
	switch language {
	case ProcessingLanguageEnglish, ProcessingLanguageChinese:
		return nil
	default:
		return fieldError("language")
	}
}

func processingLanguageInfo(language ProcessingLanguage) ProcessingLanguageInfo {
	switch language {
	case ProcessingLanguageChinese:
		return ProcessingLanguageInfo{Code: ProcessingLanguageChinese, Label: "中文"}
	default:
		return ProcessingLanguageInfo{Code: ProcessingLanguageEnglish, Label: "English"}
	}
}

func setProcessingLanguageFingerprintPayload(req SetProcessingLanguageRequest) struct {
	Language  ProcessingLanguage `json:"language"`
	ActorKind ActorKind          `json:"actor_kind"`
	ActorID   string             `json:"actor_id"`
} {
	return struct {
		Language  ProcessingLanguage `json:"language"`
		ActorKind ActorKind          `json:"actor_kind"`
		ActorID   string             `json:"actor_id"`
	}{Language: req.Language, ActorKind: req.ActorKind, ActorID: req.ActorID}
}

func setSearchFTSStaleSince(ctx context.Context, db *sql.DB, staleSince time.Time) error {
	if staleSince.IsZero() {
		return fieldError("search_fts_stale_since")
	}
	return storeRuntimeMetadata(ctx, db, RuntimeMetadataKeySearchFTSStaleSince, staleSince.UTC().Format(time.RFC3339))
}

func clearSearchFTSStaleSince(ctx context.Context, db *sql.DB) error {
	if db == nil {
		return errors.New("clear search FTS stale marker: db required")
	}
	if _, err := db.ExecContext(ctx, `delete from runtime_metadata where key = ?`, RuntimeMetadataKeySearchFTSStaleSince); err != nil {
		return fmt.Errorf("clear search FTS stale marker: %w", err)
	}
	return nil
}
