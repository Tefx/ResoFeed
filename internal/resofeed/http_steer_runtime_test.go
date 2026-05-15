package resofeed

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPSteerSourceDuplicateSemanticsAndFlatUndo(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	url := "https://runtime-source.example.test/rss.xml"
	commitBody := `{"command":"` + url + `","actor_kind":"human","actor_id":"owner","idempotency_key":"http-source-add-001"}`
	first := httptest.NewRecorder()
	router.ServeHTTP(first, srdctAuthorizedJSON(http.MethodPost, "/api/steer", commitBody))
	srdctWantStatus(t, first, http.StatusOK, "source commit adds source")
	var added SteerResult
	if err := json.Unmarshal(first.Body.Bytes(), &added); err != nil {
		t.Fatalf("unmarshal source add: %v; body=%s", err, first.Body.String())
	}
	if added.UndoHandle == nil || added.UndoHandle.Target == nil || added.UndoHandle.Target.Kind != "source" {
		t.Fatalf("source add undo_handle = %+v, want concrete source target", added.UndoHandle)
	}
	if got := sourceRevision(t, ctx, db, added.UndoHandle.Target.ID); got != 1 {
		t.Fatalf("new source revision = %d, want 1", got)
	}

	activeDuplicate := httptest.NewRecorder()
	router.ServeHTTP(activeDuplicate, srdctAuthorizedJSON(http.MethodPost, "/api/steer", `{"command":"`+url+`","actor_kind":"human","actor_id":"owner","idempotency_key":"http-source-add-002"}`))
	srdctWantStatus(t, activeDuplicate, http.StatusOK, "active duplicate source is no-op")
	var duplicate SteerResult
	if err := json.Unmarshal(activeDuplicate.Body.Bytes(), &duplicate); err != nil {
		t.Fatalf("unmarshal active duplicate: %v", err)
	}
	if duplicate.UndoHandle != nil || !strings.Contains(duplicate.Receipt.Message, "already active") {
		t.Fatalf("active duplicate result = %+v, want no undo handle and already-active message", duplicate)
	}
	if got := sourceRevision(t, ctx, db, added.UndoHandle.Target.ID); got != 1 {
		t.Fatalf("active duplicate revision = %d, want unchanged 1", got)
	}

	undoBody := `{"target_kind":"source","target_id":"` + added.UndoHandle.Target.ID + `","actor_kind":"human","actor_id":"owner","idempotency_key":"http-source-undo-001"}`
	undo := httptest.NewRecorder()
	router.ServeHTTP(undo, srdctAuthorizedJSON(http.MethodPost, "/api/steer/undo", undoBody))
	srdctWantStatus(t, undo, http.StatusOK, "flat undo disables source target")
	var undone SteerUndoResult
	if err := json.Unmarshal(undo.Body.Bytes(), &undone); err != nil {
		t.Fatalf("unmarshal flat undo: %v; body=%s", err, undo.Body.String())
	}
	if !undone.Undone || undone.Target == nil || undone.Target.ID != added.UndoHandle.Target.ID || undone.RestoredSource == nil {
		t.Fatalf("flat undo result = %+v, want source target undone", undone)
	}

	reactivate := httptest.NewRecorder()
	router.ServeHTTP(reactivate, srdctAuthorizedJSON(http.MethodPost, "/api/steer", `{"command":"`+url+`","actor_kind":"human","actor_id":"owner","idempotency_key":"http-source-add-003"}`))
	srdctWantStatus(t, reactivate, http.StatusOK, "inactive duplicate source reactivates")
	if got := sourceActive(t, ctx, db, added.UndoHandle.Target.ID); !got {
		t.Fatalf("source active after reactivation = false, want true")
	}
}

func TestHTTPSteerUndoFlatFailurePaths(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	insertSource(t, ctx, db, "src_undo_conflict", "https://undo-conflict.example.test/rss.xml", "Undo Conflict")
	router := NewRouter(HTTPServerConfig{DB: db, OwnerToken: contractOwnerToken})

	missing := httptest.NewRecorder()
	router.ServeHTTP(missing, srdctAuthorizedJSON(http.MethodPost, "/api/steer/undo", `{"target_kind":"source","actor_kind":"human","actor_id":"owner","idempotency_key":"http-undo-missing-target"}`))
	srdctWantStatus(t, missing, http.StatusBadRequest, "undo requires target_id")
	srdctWantErrorField(t, missing.Body.Bytes(), "target_id", "undo missing target_id")

	unsupported := httptest.NewRecorder()
	router.ServeHTTP(unsupported, srdctAuthorizedJSON(http.MethodPost, "/api/steer/undo", `{"target_kind":"last_action","target_id":"x","actor_kind":"human","actor_id":"owner","idempotency_key":"http-undo-unsupported-target"}`))
	srdctWantStatus(t, unsupported, http.StatusBadRequest, "undo rejects unsupported target kind")
	srdctWantErrorField(t, unsupported.Body.Bytes(), "target_kind", "undo unsupported target")

	body := `{"target_kind":"source","target_id":"src_undo_conflict","actor_kind":"human","actor_id":"owner","idempotency_key":"http-undo-conflict"}`
	first := httptest.NewRecorder()
	router.ServeHTTP(first, srdctAuthorizedJSON(http.MethodPost, "/api/steer/undo", body))
	srdctWantStatus(t, first, http.StatusOK, "undo first request")

	mismatch := httptest.NewRecorder()
	router.ServeHTTP(mismatch, srdctAuthorizedJSON(http.MethodPost, "/api/steer/undo", `{"target_kind":"source","target_id":"missing-source","actor_kind":"human","actor_id":"owner","idempotency_key":"http-undo-conflict"}`))
	srdctWantStatus(t, mismatch, http.StatusBadRequest, "undo same key different fingerprint rejected")
	srdctWantErrorField(t, mismatch.Body.Bytes(), "idempotency_key", "undo fingerprint mismatch")
}

func sourceRevision(t *testing.T, ctx context.Context, db *sql.DB, id string) int64 {
	t.Helper()
	var revision int64
	if err := db.QueryRowContext(ctx, `select revision from sources where id = ?`, id).Scan(&revision); err != nil {
		t.Fatalf("read source revision: %v", err)
	}
	return revision
}

func sourceActive(t *testing.T, ctx context.Context, db *sql.DB, id string) bool {
	t.Helper()
	var active bool
	if err := db.QueryRowContext(ctx, `select is_active from sources where id = ?`, id).Scan(&active); err != nil {
		t.Fatalf("read source active: %v", err)
	}
	return active
}
