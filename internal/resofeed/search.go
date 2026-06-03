package resofeed

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	defaultSearchLimit = 50
	maxSearchLimit     = 100
)

// SearchQuery is lexical/metadata retrieval input. It intentionally excludes
// embeddings, vector-search knobs, generated answer requests, and chat history.
type SearchQuery struct {
	Q         string
	Source    *string
	From      *string
	To        *string
	Resonated *bool
	Limit     int
}

// SearchItems searches SQLite FTS5 and metadata filters. Results must include
// enough provenance for verification and may favor resonated items when relevant
// without becoming semantic/RAG retrieval.
func SearchItems(ctx context.Context, db *sql.DB, query SearchQuery) ([]ItemSummary, SearchQueryEcho, error) {
	echo := SearchQueryEcho{Q: query.Q, Source: query.Source, From: query.From, To: query.To, Resonated: query.Resonated, Limit: normalizeLimit(query.Limit, defaultSearchLimit, maxSearchLimit)}
	if db == nil {
		return nil, echo, errors.New("search items: db is nil")
	}
	stmt, args := buildSearchSQL(query, echo)
	rows, err := db.QueryContext(ctx, stmt, args...)
	if err != nil {
		return nil, echo, fmt.Errorf("search items query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	items := []ItemSummary{}
	for rows.Next() {
		item, err := scanItemSummary(rows)
		if err != nil {
			return nil, echo, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, echo, fmt.Errorf("iterate search rows: %w", err)
	}
	return items, echo, nil
}

func buildSearchSQL(query SearchQuery, echo SearchQueryEcho) (string, []any) {
	clauses := []string{"s.is_active = 1"}
	args := []any{}
	if query.Source != nil {
		clauses = append(clauses, "(i.source_id = ? or s.title = ? or s.url = ?)")
		args = append(args, *query.Source, *query.Source, *query.Source)
	}
	if query.From != nil {
		clauses = append(clauses, "date(coalesce(i.published_at, i.first_seen_at)) >= date(?)")
		args = append(args, *query.From)
	}
	if query.To != nil {
		clauses = append(clauses, "date(coalesce(i.published_at, i.first_seen_at)) <= date(?)")
		args = append(args, *query.To)
	}
	if query.Resonated != nil {
		clauses = append(clauses, "coalesce(st.is_resonated, 0) = ?")
		args = append(args, *query.Resonated)
	}
	q := query.Q
	if q != "" {
		like := "%" + escapeLike(q) + "%"
		fts := ftsQuery(q)
		if fts == "" {
			clauses = append(clauses, `(i.title like ? escape '\' or coalesce(i.summary, '') like ? escape '\' or coalesce(i.core_insight, '') like ? escape '\' or coalesce(i.value_tier, '') like ? escape '\' or coalesce(i.feed_excerpt, '') like ? escape '\' or coalesce(i.extracted_text, '') like ? escape '\' or s.title like ? escape '\' or i.url like ? escape '\')`)
			args = append(args, like, like, like, like, like, like, like, like)
		} else {
			clauses = append(clauses, `(i.id in (select item_id from search_fts where search_fts match ?) or i.title like ? escape '\' or coalesce(i.summary, '') like ? escape '\' or coalesce(i.core_insight, '') like ? escape '\' or coalesce(i.value_tier, '') like ? escape '\' or coalesce(i.feed_excerpt, '') like ? escape '\' or coalesce(i.extracted_text, '') like ? escape '\' or s.title like ? escape '\' or i.url like ? escape '\')`)
			args = append(args, fts, like, like, like, like, like, like, like, like)
		}
	}
	args = append(args, echo.Limit)

	stmt := fmt.Sprintf(`
select i.id, i.source_id, coalesce(s.title, ''), i.url, i.title, coalesce(i.source_item_title, i.title), i.localized_title,
       i.summary, i.core_insight, i.value_tier, i.published_at,
       i.extraction_status, i.model_status, coalesce(i.content_status, i.model_status),
       i.key_points, i.last_reprocess_status, i.last_reprocess_error_code, i.last_reprocess_error_message, i.last_reprocess_at,
       coalesce(st.is_resonated, 0), st.human_inspected_at, st.external_surfaced_at,
       i.story_key, i.duplicate_of_item_id, i.first_seen_at, i.feed_excerpt
from items i
join sources s on s.id = i.source_id
left join item_state st on st.item_id = i.id
where %s
order by coalesce(st.is_resonated, 0) desc, coalesce(i.published_at, i.first_seen_at) desc, i.id asc
limit ?`, strings.Join(clauses, " and "))
	return stmt, args
}

// rebuildSearchIndex rebuilds the derived FTS index from canonical rows after
// migrations or state import. It must not create embedding/vector indexes.
func rebuildSearchIndex(ctx context.Context, db *sql.DB) error {
	if db == nil {
		return errors.New("rebuild search index: db is nil")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin rebuild search index: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if err := rebuildSearchIndexTx(ctx, tx); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit rebuild search index: %w", err)
	}
	return nil
}

// ReadItemDetail returns the canonical detail/provenance shape for HTTP
// GET /api/items/{id} and MCP read_item. Direct duplicates and grouped originals
// remain addressable by their own item ids at this core storage boundary.
func ReadItemDetail(ctx context.Context, db *sql.DB, itemID string) (ItemDetail, error) {
	if db == nil {
		return ItemDetail{}, errors.New("read item detail: db is nil")
	}
	if strings.TrimSpace(itemID) == "" {
		return ItemDetail{}, errors.New("read item detail: item id is empty")
	}
	row := db.QueryRowContext(ctx, `
select i.id, i.source_id, coalesce(s.title, ''), i.url, i.title, coalesce(i.source_item_title, i.title), i.localized_title,
       i.summary, i.core_insight, i.value_tier, i.published_at,
       i.extraction_status, i.model_status, coalesce(i.content_status, i.model_status),
       coalesce(st.is_resonated, 0), st.human_inspected_at, st.external_surfaced_at,
       i.story_key, i.duplicate_of_item_id, i.feed_excerpt, i.extracted_text,
       coalesce(i.source_url, s.url, ''), i.canonical_url, i.key_points,
       i.last_reprocess_status, i.last_reprocess_error_code, i.last_reprocess_error_message, i.last_reprocess_at
from items i
left join sources s on s.id = i.source_id
left join item_state st on st.item_id = i.id
where i.id = ?`, itemID)
	var detail ItemDetail
	var summary, coreInsight, valueTier, publishedAt, inspectedAt, surfacedAt, storyKey, duplicateOf, feedExcerpt, extractedText, sourceURL, canonicalURL, keyPoints, lastStatus, lastCode, lastMessage, lastAt sql.NullString
	if err := row.Scan(&detail.ID, &detail.SourceID, &detail.SourceTitle, &detail.URL, &detail.Title, &detail.SourceItemTitle, &detail.LocalizedTitle, &summary, &coreInsight, &valueTier, &publishedAt, &detail.ExtractionStatus, &detail.ModelStatus, &detail.ContentStatus, &detail.IsResonated, &inspectedAt, &surfacedAt, &storyKey, &duplicateOf, &feedExcerpt, &extractedText, &sourceURL, &canonicalURL, &keyPoints, &lastStatus, &lastCode, &lastMessage, &lastAt); err != nil {
		if err == sql.ErrNoRows {
			return ItemDetail{}, fmt.Errorf("read item detail: %q not found", itemID)
		}
		return ItemDetail{}, fmt.Errorf("read item detail: %w", err)
	}
	detail.Summary = stringPtrFromNull(summary)
	detail.CoreInsight = stringPtrFromNull(coreInsight)
	detail.ValueTier = stringPtrFromNull(valueTier)
	detail.PublishedAt = timePtrFromNull(publishedAt)
	detail.HumanInspectedAt = timePtrFromNull(inspectedAt)
	detail.ExternalSurfacedAt = timePtrFromNull(surfacedAt)
	detail.StoryKey = stringPtrFromNull(storyKey)
	detail.DuplicateOfItemID = stringPtrFromNull(duplicateOf)
	detail.FeedExcerpt = stringPtrFromNull(feedExcerpt)
	detail.ExtractedText = stringPtrFromNull(extractedText)
	detail.KeyPoints = keyPointsFromNull(keyPoints)
	detail.LastReprocessStatus = stringPtrFromNull(lastStatus)
	detail.LastReprocessErrorCode = stringPtrFromNull(lastCode)
	detail.LastReprocessErrorMessage = stringPtrFromNull(lastMessage)
	detail.LastReprocessAt = timePtrFromNull(lastAt)
	groupedSources, err := readGroupedSourceItems(ctx, db, detail.ID, detail.StoryKey)
	if err != nil {
		return ItemDetail{}, err
	}
	detail.Provenance = Provenance{SourceURL: sourceURL.String, CanonicalURL: stringPtrFromNull(canonicalURL), OriginalURL: detail.URL, StoryKey: detail.StoryKey, DuplicateOfItemID: detail.DuplicateOfItemID, GroupedSourceItems: groupedSources}
	sanitizeReadableDetail(&detail)
	return detail, nil
}

func readGroupedSourceItems(ctx context.Context, db *sql.DB, selectedItemID string, storyKey *string) ([]GroupedSourceItem, error) {
	if storyKey == nil || strings.TrimSpace(*storyKey) == "" {
		return []GroupedSourceItem{}, nil
	}
	rows, err := db.QueryContext(ctx, `
select i.id, i.source_id, coalesce(s.title, ''), coalesce(i.source_url, s.url, ''),
       i.url, i.canonical_url, i.title, i.published_at, i.first_seen_at,
       i.extraction_status, i.model_status, i.story_key, i.duplicate_of_item_id
from items i
left join sources s on s.id = i.source_id
where i.story_key = ?
order by case when i.id = ? then 0 when i.duplicate_of_item_id = ? then 1 else 2 end,
         coalesce(i.published_at, i.first_seen_at) desc,
         i.id asc`, *storyKey, selectedItemID, selectedItemID)
	if err != nil {
		return nil, fmt.Errorf("read grouped source items: %w", err)
	}
	defer func() { _ = rows.Close() }()

	items := []GroupedSourceItem{}
	for rows.Next() {
		var item GroupedSourceItem
		var canonicalURL, publishedAt, firstSeenAt, rowStoryKey, duplicateOf sql.NullString
		if err := rows.Scan(&item.ItemID, &item.SourceID, &item.SourceTitle, &item.SourceURL, &item.URL, &canonicalURL, &item.Title, &publishedAt, &firstSeenAt, &item.ExtractionStatus, &item.ModelStatus, &rowStoryKey, &duplicateOf); err != nil {
			return nil, fmt.Errorf("scan grouped source item: %w", err)
		}
		item.CanonicalURL = stringPtrFromNull(canonicalURL)
		item.PublishedAt = timePtrFromNull(publishedAt)
		item.FirstSeenAt = timePtrFromNull(firstSeenAt)
		item.StoryKey = stringPtrFromNull(rowStoryKey)
		item.DuplicateOfItemID = stringPtrFromNull(duplicateOf)
		item.IsSelectedItem = item.ItemID == selectedItemID
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate grouped source items: %w", err)
	}
	return items, nil
}

func rebuildSearchIndexTx(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `delete from search_fts`); err != nil {
		return fmt.Errorf("clear search index: %w", err)
	}
	_, err := tx.ExecContext(ctx, `
insert into search_fts (item_id, title, source_item_title, localized_title, source_title, feed_excerpt, summary, core_insight, key_points, extracted_text, provenance)
select i.id, i.title, coalesce(i.source_item_title, i.title, ''), coalesce(i.localized_title, i.title, ''), coalesce(s.title, ''), coalesce(i.feed_excerpt, ''), coalesce(i.summary, '') || ' ' || coalesce(i.value_tier, ''), coalesce(i.core_insight, ''), coalesce(i.key_points, ''), coalesce(i.extracted_text, ''),
       coalesce(i.source_url, s.url, '') || ' ' || coalesce(i.url, '') || ' ' || coalesce(i.canonical_url, '') || ' ' || coalesce(i.story_key, '') || ' ' || coalesce(i.duplicate_of_item_id, '') || ' ' || coalesce(i.value_tier, '')
from items i
left join sources s on s.id = i.source_id`)
	if err != nil {
		return fmt.Errorf("populate search index: %w", err)
	}
	return nil
}

func scanItemSummary(rows *sql.Rows) (ItemSummary, error) {
	var item ItemSummary
	var summary, coreInsight, valueTier, publishedAt, keyPoints, lastStatus, lastCode, lastMessage, lastAt, inspectedAt, surfacedAt, storyKey, duplicateOf, firstSeen, feedExcerpt sql.NullString
	if err := rows.Scan(&item.ID, &item.SourceID, &item.SourceTitle, &item.URL, &item.Title, &item.SourceItemTitle, &item.LocalizedTitle, &summary, &coreInsight, &valueTier, &publishedAt, &item.ExtractionStatus, &item.ModelStatus, &item.ContentStatus, &keyPoints, &lastStatus, &lastCode, &lastMessage, &lastAt, &item.IsResonated, &inspectedAt, &surfacedAt, &storyKey, &duplicateOf, &firstSeen, &feedExcerpt); err != nil {
		return ItemSummary{}, fmt.Errorf("scan item summary: %w", err)
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
	item.HumanInspectedAt = timePtrFromNull(inspectedAt)
	item.ExternalSurfacedAt = timePtrFromNull(surfacedAt)
	item.StoryKey = stringPtrFromNull(storyKey)
	item.DuplicateOfItemID = stringPtrFromNull(duplicateOf)
	sanitizeReadableSummary(&item)
	return item, nil
}

func displayExcerptFallback(summary *string, coreInsight *string, feedExcerpt sql.NullString) *string {
	if summary != nil || coreInsight != nil || !feedExcerpt.Valid {
		return nil
	}
	return &feedExcerpt.String
}

func firstSeenFallback(publishedAt *time.Time, firstSeen sql.NullString) *time.Time {
	if publishedAt != nil {
		return nil
	}
	return timePtrFromNull(firstSeen)
}

func normalizeLimit(value int, defaultValue int, maxValue int) int {
	if value <= 0 {
		return defaultValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func stringPtrFromNull(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func keyPointsFromNull(value sql.NullString) []string {
	if !value.Valid || strings.TrimSpace(value.String) == "" {
		return []string{}
	}
	var points []string
	if err := json.Unmarshal([]byte(value.String), &points); err != nil {
		return []string{}
	}
	return points
}

func timePtrFromNull(value sql.NullString) *time.Time {
	if !value.Valid || value.String == "" {
		return nil
	}
	parsed, err := parseDBTime(value.String)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseDBTime(value string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05.999999999-07:00", "2006-01-02 15:04:05"} {
		parsed, err := time.Parse(layout, value)
		if err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, fmt.Errorf("unsupported time format %q", value)
}

func stableTextID(prefix string, text string) string {
	sum := sha256.Sum256([]byte(text))
	return prefix + "_" + hex.EncodeToString(sum[:])[:16]
}

func escapeLike(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(value)
}

func ftsQuery(value string) string {
	fields := strings.Fields(value)
	if len(fields) == 0 {
		return ""
	}
	quoted := make([]string, 0, len(fields))
	replacer := strings.NewReplacer(`"`, `""`)
	for _, field := range fields {
		field = strings.TrimSpace(strings.Trim(field, `"`))
		if field == "" {
			continue
		}
		quoted = append(quoted, `"`+replacer.Replace(field)+`"`)
	}
	return strings.Join(quoted, " ")
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func derefString(value *string) string {
	return stringValue(value)
}

func countFresh(candidates []rankedCandidate) int {
	count := 0
	for _, candidate := range candidates {
		if candidate.fresh {
			count++
		}
	}
	return count
}

func countFreshIn(candidates []rankedCandidate) int {
	return countFresh(candidates)
}

func countOldResonatedMemory(candidates []rankedCandidate) int {
	count := 0
	for _, candidate := range candidates {
		if candidate.memory && candidate.item.IsResonated && !candidate.related {
			count++
		}
	}
	return count
}

func firstCandidate(candidates []rankedCandidate, used map[string]bool, predicate func(rankedCandidate) bool) (rankedCandidate, bool) {
	for _, candidate := range candidates {
		if used[candidate.item.ID] || !predicate(candidate) {
			continue
		}
		return candidate, true
	}
	return rankedCandidate{}, false
}
