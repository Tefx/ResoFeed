package resofeed

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
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
		clauses = append(clauses, `(i.id in (select item_id from search_fts where search_fts match ?) or i.title like ? escape '\' or coalesce(i.summary, '') like ? escape '\' or coalesce(i.core_insight, '') like ? escape '\' or coalesce(i.feed_excerpt, '') like ? escape '\' or coalesce(i.extracted_text, '') like ? escape '\' or s.title like ? escape '\' or i.url like ? escape '\')`)
		args = append(args, ftsQuery(q), like, like, like, like, like, like, like)
	}
	args = append(args, echo.Limit)

	stmt := fmt.Sprintf(`
select i.id, i.source_id, coalesce(s.title, ''), i.url, i.title,
       i.summary, i.core_insight, i.published_at,
       i.extraction_status, i.model_status,
       coalesce(st.is_resonated, 0), st.human_inspected_at, st.external_surfaced_at,
       i.story_key, i.duplicate_of_item_id
from items i
join sources s on s.id = i.source_id
left join item_state st on st.item_id = i.id
where %s
order by coalesce(st.is_resonated, 0) desc, coalesce(i.published_at, i.first_seen_at) desc, i.id asc
limit ?`, strings.Join(clauses, " and "))
	return stmt, args
}

// RebuildSearchIndex rebuilds the derived FTS index from canonical rows after
// migrations or state import. It must not create embedding/vector indexes.
func RebuildSearchIndex(ctx context.Context, db *sql.DB) error {
	if db == nil {
		return errors.New("rebuild search index: db is nil")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin rebuild search index: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `delete from search_fts`); err != nil {
		return fmt.Errorf("clear search index: %w", err)
	}
	_, err = tx.ExecContext(ctx, `
insert into search_fts (item_id, title, source_title, feed_excerpt, summary, extracted_text, provenance)
select i.id, i.title, coalesce(s.title, ''), coalesce(i.feed_excerpt, ''), coalesce(i.summary, ''), coalesce(i.extracted_text, ''), coalesce(i.url, '') || ' ' || coalesce(i.story_key, '')
from items i
join sources s on s.id = i.source_id`)
	if err != nil {
		return fmt.Errorf("populate search index: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit rebuild search index: %w", err)
	}
	return nil
}

func scanItemSummary(rows *sql.Rows) (ItemSummary, error) {
	var item ItemSummary
	var summary, coreInsight, publishedAt, inspectedAt, surfacedAt, storyKey, duplicateOf sql.NullString
	if err := rows.Scan(&item.ID, &item.SourceID, &item.SourceTitle, &item.URL, &item.Title, &summary, &coreInsight, &publishedAt, &item.ExtractionStatus, &item.ModelStatus, &item.IsResonated, &inspectedAt, &surfacedAt, &storyKey, &duplicateOf); err != nil {
		return ItemSummary{}, fmt.Errorf("scan item summary: %w", err)
	}
	item.Summary = stringPtrFromNull(summary)
	item.CoreInsight = stringPtrFromNull(coreInsight)
	item.PublishedAt = timePtrFromNull(publishedAt)
	item.HumanInspectedAt = timePtrFromNull(inspectedAt)
	item.ExternalSurfacedAt = timePtrFromNull(surfacedAt)
	item.StoryKey = stringPtrFromNull(storyKey)
	item.DuplicateOfItemID = stringPtrFromNull(duplicateOf)
	return item, nil
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
		return value
	}
	for i, field := range fields {
		fields[i] = strings.Trim(field, `"`)
	}
	return strings.Join(fields, " ")
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
