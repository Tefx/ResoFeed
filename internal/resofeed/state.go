package resofeed

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"
)

// StateBundle is the complete portable JSON state contract. It includes only
// active sources, active steering rules, and currently resonated items. It must
// reject unknown top-level fields and is not a sync, merge, conflict-resolution,
// activity-ledger, or portable-agent-receipt format.
type StateBundle struct {
	SchemaVersion  string               `json:"schema_version"`
	ExportedAt     time.Time            `json:"exported_at"`
	Sources        []SourceState        `json:"sources"`
	SteerRules     []SteerRuleState     `json:"steer_rules"`
	ResonatedItems []ResonatedItemState `json:"resonated_items"`
}

// SourceState is the portable active Source Ledger row shape.
type SourceState struct {
	ID    string `json:"id"`
	URL   string `json:"url"`
	Title string `json:"title"`
}

// SteerRuleState is the portable current active steering policy shape.
type SteerRuleState struct {
	ID       string `json:"id"`
	RuleText string `json:"rule_text"`
}

// ResonatedItemState is the portable current resonance shape.
type ResonatedItemState struct {
	ItemID    string  `json:"item_id"`
	URL       string  `json:"url"`
	SourceURL string  `json:"source_url"`
	Title     *string `json:"title"`
}

// ExportState writes the validated current-state bundle as JSON. It must not
// include runtime_metadata, agent_receipts, deleted tombstones, inactive rules,
// search indexes, command logs, reading logs, or sync metadata.
func ExportState(ctx context.Context, db *sql.DB, w io.Writer) error {
	if db == nil {
		return fmt.Errorf("export state: db required")
	}
	if w == nil {
		return fmt.Errorf("export state: writer required")
	}

	bundle := StateBundle{SchemaVersion: StateSchemaVersionV1, ExportedAt: time.Now().UTC(), Sources: []SourceState{}, SteerRules: []SteerRuleState{}, ResonatedItems: []ResonatedItemState{}}

	rows, err := db.QueryContext(ctx, `select id, url, title from sources where is_active = 1 order by id`)
	if err != nil {
		return fmt.Errorf("query portable sources: %w", err)
	}
	for rows.Next() {
		var source SourceState
		if err := rows.Scan(&source.ID, &source.URL, &source.Title); err != nil {
			closeErr := rows.Close()
			return errors.Join(fmt.Errorf("scan portable source: %w", err), closeErr)
		}
		bundle.Sources = append(bundle.Sources, source)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("close portable sources rows: %w", err)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate portable sources: %w", err)
	}

	ruleRows, err := db.QueryContext(ctx, `select id, rule_text from steer_rules where is_active = 1 order by id`)
	if err != nil {
		return fmt.Errorf("query portable steer rules: %w", err)
	}
	for ruleRows.Next() {
		var rule SteerRuleState
		if err := ruleRows.Scan(&rule.ID, &rule.RuleText); err != nil {
			closeErr := ruleRows.Close()
			return errors.Join(fmt.Errorf("scan portable steer rule: %w", err), closeErr)
		}
		bundle.SteerRules = append(bundle.SteerRules, rule)
	}
	if err := ruleRows.Close(); err != nil {
		return fmt.Errorf("close portable steer rule rows: %w", err)
	}
	if err := ruleRows.Err(); err != nil {
		return fmt.Errorf("iterate portable steer rules: %w", err)
	}

	itemRows, err := db.QueryContext(ctx, `select i.id, i.url, coalesce(i.source_url, s.url, ''), i.title
from item_state st
join items i on i.id = st.item_id
left join sources s on s.id = i.source_id
where st.is_resonated = 1
order by i.id`)
	if err != nil {
		return fmt.Errorf("query portable resonated items: %w", err)
	}
	for itemRows.Next() {
		var item ResonatedItemState
		var title sql.NullString
		if err := itemRows.Scan(&item.ItemID, &item.URL, &item.SourceURL, &title); err != nil {
			closeErr := itemRows.Close()
			return errors.Join(fmt.Errorf("scan portable resonated item: %w", err), closeErr)
		}
		if title.Valid {
			item.Title = &title.String
		}
		bundle.ResonatedItems = append(bundle.ResonatedItems, item)
	}
	if err := itemRows.Close(); err != nil {
		return fmt.Errorf("close portable resonated item rows: %w", err)
	}
	if err := itemRows.Err(); err != nil {
		return fmt.Errorf("iterate portable resonated items: %w", err)
	}

	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(bundle); err != nil {
		return fmt.Errorf("encode portable state bundle: %w", err)
	}
	return nil
}

// ImportState validates the JSON state bundle before writing and then replaces
// local portable active state in one transaction. It must not merge or preserve
// absent portable rows. The import write is a short unrepresented global
// operation: it uses the in-memory guard for coordination, but it does not
// publish a durable work record or a current-operation kind.
func ImportState(ctx context.Context, db *sql.DB, r io.Reader) (ret RestoreResult, retErr error) {
	if db == nil {
		return RestoreResult{}, fmt.Errorf("import state: db required")
	}
	bundle, err := ValidateStateBundle(r)
	if err != nil {
		return RestoreResult{}, err
	}
	release, err := tryAcquireIngestGuardWithActor(ctx, "state_import", "restore", "")
	if err != nil {
		return RestoreResult{}, err
	}
	defer releaseGuardRecover(release, &retErr, "import state")

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return RestoreResult{}, fmt.Errorf("begin state import: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	for _, stmt := range []string{
		`delete from item_state where is_resonated = 1`,
		`delete from steer_rules where is_active = 1`,
		`delete from sources`,
	} {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return RestoreResult{}, fmt.Errorf("clear portable state: %w", err)
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	sourceByURL := make(map[string]string, len(bundle.Sources))
	for _, source := range bundle.Sources {
		sourceByURL[source.URL] = source.ID
		if _, err := tx.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision)
			values (?, ?, ?, ?, 'not_fetched', 1, 1)
			on conflict(id) do update set url = excluded.url, title = excluded.title, is_active = 1, revision = sources.revision + 1`, source.ID, source.URL, source.Title, now); err != nil {
			return RestoreResult{}, fmt.Errorf("restore source %q: %w", source.ID, err)
		}
	}

	for _, rule := range bundle.SteerRules {
		if _, err := tx.ExecContext(ctx, `insert into steer_rules (id, rule_text, is_active, superseded_by, created_at, created_by_actor_kind, created_by_actor_id, revision)
			values (?, ?, 1, null, ?, 'human', 'state_import', 1)
			on conflict(id) do update set rule_text = excluded.rule_text, is_active = 1, superseded_by = null, created_by_actor_kind = excluded.created_by_actor_kind, created_by_actor_id = excluded.created_by_actor_id, revision = steer_rules.revision + 1`, rule.ID, rule.RuleText, now); err != nil {
			return RestoreResult{}, fmt.Errorf("restore steer rule %q: %w", rule.ID, err)
		}
	}

	for _, item := range bundle.ResonatedItems {
		sourceID := sourceByURL[item.SourceURL]
		if sourceID == "" {
			sourceID = ""
		}
		title := ""
		if item.Title != nil {
			title = *item.Title
		}
		if _, err := tx.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, first_seen_at, extraction_status, model_status)
			values (?, ?, ?, ?, ?, ?, 'summary_unavailable', 'summary_unavailable')
			on conflict(id) do update set source_id = excluded.source_id, source_url = excluded.source_url, url = excluded.url, title = excluded.title`, item.ItemID, sourceID, item.SourceURL, item.URL, title, now); err != nil {
			return RestoreResult{}, fmt.Errorf("restore resonated item %q: %w", item.ItemID, err)
		}
		if _, err := tx.ExecContext(ctx, `insert into item_state (item_id, is_resonated) values (?, 1)
			on conflict(item_id) do update set is_resonated = 1`, item.ItemID); err != nil {
			return RestoreResult{}, fmt.Errorf("restore resonance %q: %w", item.ItemID, err)
		}
	}

	if err := rebuildSearchIndexTx(ctx, tx); err != nil {
		return RestoreResult{}, fmt.Errorf("rebuild search index after state import: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return RestoreResult{}, fmt.Errorf("commit state import: %w", err)
	}

	return RestoreResult{Restored: RestoredCounts{Sources: len(bundle.Sources), SteerRules: len(bundle.SteerRules), ResonatedItems: len(bundle.ResonatedItems)}}, nil
}

// ValidateStateBundle enforces schema_version, required field shapes, duplicate
// id/item_id rejection, and unknown top-level-field rejection before import.
func ValidateStateBundle(r io.Reader) (StateBundle, error) {
	if r == nil {
		return StateBundle{}, fmt.Errorf("validate state bundle: reader required")
	}
	data, err := io.ReadAll(r)
	if err != nil {
		return StateBundle{}, fmt.Errorf("read state bundle: %w", err)
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal(data, &top); err != nil {
		return StateBundle{}, fmt.Errorf("invalid state bundle JSON: %w", err)
	}
	allowed := map[string]bool{"schema_version": true, "exported_at": true, "sources": true, "steer_rules": true, "resonated_items": true}
	for key := range top {
		if !allowed[key] {
			return StateBundle{}, fmt.Errorf("invalid state bundle field %q: unknown top-level field", key)
		}
	}
	for key := range allowed {
		if _, ok := top[key]; !ok {
			return StateBundle{}, fmt.Errorf("invalid state bundle field %q: required", key)
		}
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var bundle StateBundle
	if err := decoder.Decode(&bundle); err != nil {
		return StateBundle{}, fmt.Errorf("decode state bundle: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return StateBundle{}, fmt.Errorf("decode state bundle: trailing data")
	}
	if bundle.SchemaVersion != StateSchemaVersionV1 {
		return StateBundle{}, fmt.Errorf("invalid state bundle field %q: unsupported schema_version", "schema_version")
	}
	if bundle.ExportedAt.IsZero() {
		return StateBundle{}, fmt.Errorf("invalid state bundle field %q: required", "exported_at")
	}
	if bundle.Sources == nil {
		return StateBundle{}, fmt.Errorf("invalid state bundle field %q: required array", "sources")
	}
	if bundle.SteerRules == nil {
		return StateBundle{}, fmt.Errorf("invalid state bundle field %q: required array", "steer_rules")
	}
	if bundle.ResonatedItems == nil {
		return StateBundle{}, fmt.Errorf("invalid state bundle field %q: required array", "resonated_items")
	}
	if err := validateSourceStates(bundle.Sources); err != nil {
		return StateBundle{}, err
	}
	if err := validateSteerRuleStates(bundle.SteerRules); err != nil {
		return StateBundle{}, err
	}
	if err := validateResonatedItemStates(bundle.ResonatedItems); err != nil {
		return StateBundle{}, err
	}
	return bundle, nil
}

func validateSourceStates(sources []SourceState) error {
	seen := make(map[string]bool, len(sources))
	for _, source := range sources {
		if source.ID == "" {
			return fmt.Errorf("invalid state bundle field %q: required", "sources.id")
		}
		if seen[source.ID] {
			return fmt.Errorf("invalid state bundle field %q: duplicate", "sources.id")
		}
		seen[source.ID] = true
		if source.URL == "" {
			return fmt.Errorf("invalid state bundle field %q: required", "sources.url")
		}
		if source.Title == "" {
			return fmt.Errorf("invalid state bundle field %q: required", "sources.title")
		}
	}
	return nil
}

func validateSteerRuleStates(rules []SteerRuleState) error {
	seen := make(map[string]bool, len(rules))
	for _, rule := range rules {
		if rule.ID == "" {
			return fmt.Errorf("invalid state bundle field %q: required", "steer_rules.id")
		}
		if seen[rule.ID] {
			return fmt.Errorf("invalid state bundle field %q: duplicate", "steer_rules.id")
		}
		seen[rule.ID] = true
		if rule.RuleText == "" {
			return fmt.Errorf("invalid state bundle field %q: required", "steer_rules.rule_text")
		}
	}
	return nil
}

func validateResonatedItemStates(items []ResonatedItemState) error {
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		if item.ItemID == "" {
			return fmt.Errorf("invalid state bundle field %q: required", "resonated_items.item_id")
		}
		if seen[item.ItemID] {
			return fmt.Errorf("invalid state bundle field %q: duplicate", "resonated_items.item_id")
		}
		seen[item.ItemID] = true
		if item.URL == "" {
			return fmt.Errorf("invalid state bundle field %q: required", "resonated_items.url")
		}
		if item.SourceURL == "" {
			return fmt.Errorf("invalid state bundle field %q: required", "resonated_items.source_url")
		}
	}
	return nil
}
