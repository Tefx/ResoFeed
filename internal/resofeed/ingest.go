package resofeed

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"hash/fnv"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	sourceStatusOK             = "ok"
	sourceStatusFetchError     = "rss_fetch_error"
	sourceStatusNotFetched     = "not_fetched"
	extractionStatusFull       = "full"
	extractionStatusPartial    = "partial_extraction"
	extractionStatusSummaryNA  = "summary_unavailable"
	extractionStatusOriginalNA = "original_unavailable"
	modelStatusOK              = "ok"
	modelStatusSummaryNA       = "summary_unavailable"
	modelStatusLatencyError    = "model_latency_error"
)

// IngestConfig defines the background ingestion loop inside the single Go
// process. Defaults are 15 minute loop interval, 20 second source timeout, and
// LLM limits owned by OpenRouterConfig.
type IngestConfig struct {
	Interval           time.Duration
	SourceFetchTimeout time.Duration
	LLM                LLMClient
}

// RunIngestLoop fetches active sources independently until ctx is canceled. One
// source failure must not block other sources, and extraction/model failure must
// not delete or hide the item.
func RunIngestLoop(ctx context.Context, db *sql.DB, cfg IngestConfig) error {
	interval := cfg.Interval
	if interval <= 0 {
		interval = 15 * time.Minute
	}
	if err := IngestOnce(ctx, db, cfg); err != nil {
		return err
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if err := IngestOnce(ctx, db, cfg); err != nil {
				return err
			}
		}
	}
}

// IngestOnce performs one ingestion pass over active sources.
func IngestOnce(ctx context.Context, db *sql.DB, cfg IngestConfig) (retErr error) {
	if db == nil {
		return errors.New("ingest once: db required")
	}
	rows, err := db.QueryContext(ctx, `select id, url, title from sources where is_active = 1`)
	if err != nil {
		return fmt.Errorf("ingest once: query active sources: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && retErr == nil {
			retErr = fmt.Errorf("ingest once: close source rows: %w", closeErr)
		}
	}()

	var sources []Source
	for rows.Next() {
		var source Source
		if err := rows.Scan(&source.ID, &source.URL, &source.Title); err != nil {
			return fmt.Errorf("ingest once: scan source: %w", err)
		}
		sources = append(sources, source)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("ingest once: source rows: %w", err)
	}

	for _, source := range sources {
		if err := ingestSource(ctx, db, cfg, source); err != nil {
			if updateErr := updateSourceFetch(ctx, db, source.ID, sourceStatusFetchError, err.Error()); updateErr != nil {
				return updateErr
			}
			continue
		}
		if err := updateSourceFetch(ctx, db, source.ID, sourceStatusOK, ""); err != nil {
			return err
		}
	}
	return nil
}

// ImportOPML imports source URLs into the flat Source Ledger. OPML folders are
// ignored and flattened immediately; OPML is not complete state restore.
func ImportOPML(ctx context.Context, db *sql.DB, opml []byte) (OPMLImportResult, error) {
	if db == nil {
		return OPMLImportResult{}, errors.New("import opml: db required")
	}
	urls, err := parseOPMLFeedURLs(opml)
	if err != nil {
		return OPMLImportResult{}, err
	}
	result := OPMLImportResult{FoldersFlattened: true}
	for _, feedURL := range urls {
		id := stableID("src", feedURL)
		title := feedURL
		if parsed, err := url.Parse(feedURL); err == nil && parsed.Host != "" {
			title = parsed.Host
		}
		res, err := db.ExecContext(ctx, `insert into sources (id, url, title, created_at, last_fetch_status, is_active, revision) values (?, ?, ?, ?, ?, 1, 1) on conflict(url) do nothing`, id, feedURL, title, time.Now().UTC().Format(time.RFC3339), sourceStatusNotFetched)
		if err != nil {
			return result, fmt.Errorf("import opml: insert source %q: %w", feedURL, err)
		}
		rows, err := res.RowsAffected()
		if err != nil {
			return result, fmt.Errorf("import opml: rows affected: %w", err)
		}
		if rows == 0 {
			result.Skipped++
			continue
		}
		result.Imported++
	}
	return result, nil
}

// DeleteSource marks a source inactive/deleted so it no longer appears in the
// Source Ledger or contributes new items.
func DeleteSource(ctx context.Context, db *sql.DB, sourceID string) (DeleteSourceResult, error) {
	if db == nil {
		return DeleteSourceResult{}, errors.New("delete source: db required")
	}
	if strings.TrimSpace(sourceID) == "" {
		return DeleteSourceResult{}, errors.New("delete source: source id required")
	}
	res, err := db.ExecContext(ctx, `update sources set is_active = 0, revision = revision + 1 where id = ?`, sourceID)
	if err != nil {
		return DeleteSourceResult{}, fmt.Errorf("delete source: update %q: %w", sourceID, err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return DeleteSourceResult{}, fmt.Errorf("delete source: rows affected: %w", err)
	}
	if rows == 0 {
		return DeleteSourceResult{}, fmt.Errorf("delete source: %q not found", sourceID)
	}
	var revision int64
	if err := db.QueryRowContext(ctx, `select revision from sources where id = ?`, sourceID).Scan(&revision); err != nil {
		return DeleteSourceResult{}, fmt.Errorf("delete source: read revision %q: %w", sourceID, err)
	}
	return DeleteSourceResult{SourceID: sourceID, Deleted: true, Revision: revision}, nil
}

func ingestSource(ctx context.Context, db *sql.DB, cfg IngestConfig, source Source) error {
	timeout := cfg.SourceFetchTimeout
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	sourceCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	feed, err := fetchFeed(sourceCtx, source.URL)
	if err != nil {
		return err
	}
	if feed.Title != "" && feed.Title != source.Title {
		if _, err := db.ExecContext(ctx, `update sources set title = ? where id = ?`, feed.Title, source.ID); err != nil {
			return fmt.Errorf("ingest source: update source title: %w", err)
		}
	}
	for _, entry := range feed.Items {
		item, err := buildItem(ctx, source, entry, cfg.LLM)
		if err != nil {
			return err
		}
		if err := upsertIngestedItem(ctx, db, item); err != nil {
			return err
		}
	}
	return nil
}

type parsedFeed struct {
	Title string
	Items []feedEntry
}

type feedEntry struct {
	ID          string
	Title       string
	URL         string
	Description string
	PublishedAt *time.Time
}

func fetchFeed(ctx context.Context, feedURL string) (feed parsedFeed, retErr error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return parsedFeed{}, fmt.Errorf("rss fetch: create request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return parsedFeed{}, fmt.Errorf("rss fetch: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil && retErr == nil {
			retErr = fmt.Errorf("rss fetch: close body: %w", closeErr)
		}
	}()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return parsedFeed{}, fmt.Errorf("rss fetch: status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return parsedFeed{}, fmt.Errorf("rss fetch: read body: %w", err)
	}
	parsed, err := parseFeed(body)
	if err != nil {
		return parsedFeed{}, err
	}
	if len(parsed.Items) == 0 {
		return parsedFeed{}, errors.New("rss parse: no items")
	}
	return parsed, nil
}

func parseFeed(data []byte) (parsedFeed, error) {
	var root struct {
		XMLName xml.Name
		Channel struct {
			Title string `xml:"title"`
			Items []struct {
				GUID        string `xml:"guid"`
				Title       string `xml:"title"`
				Link        string `xml:"link"`
				Description string `xml:"description"`
				PubDate     string `xml:"pubDate"`
			} `xml:"item"`
		} `xml:"channel"`
		Title   string `xml:"title"`
		Entries []struct {
			ID      string `xml:"id"`
			Title   string `xml:"title"`
			Summary string `xml:"summary"`
			Content string `xml:"content"`
			Updated string `xml:"updated"`
			Link    []struct {
				Href string `xml:"href,attr"`
				Rel  string `xml:"rel,attr"`
			} `xml:"link"`
		} `xml:"entry"`
	}
	if err := xml.Unmarshal(data, &root); err != nil {
		return parsedFeed{}, fmt.Errorf("rss parse: %w", err)
	}
	switch strings.ToLower(root.XMLName.Local) {
	case "rss", "rdf":
		feed := parsedFeed{Title: strings.TrimSpace(root.Channel.Title)}
		for _, item := range root.Channel.Items {
			published := parseFeedTime(item.PubDate)
			feed.Items = append(feed.Items, feedEntry{ID: strings.TrimSpace(item.GUID), Title: strings.TrimSpace(item.Title), URL: strings.TrimSpace(item.Link), Description: textFromHTML(item.Description), PublishedAt: published})
		}
		return feed, nil
	case "feed":
		feed := parsedFeed{Title: strings.TrimSpace(root.Title)}
		for _, entry := range root.Entries {
			link := ""
			for _, candidate := range entry.Link {
				if candidate.Rel == "" || candidate.Rel == "alternate" {
					link = strings.TrimSpace(candidate.Href)
					break
				}
			}
			description := entry.Summary
			if description == "" {
				description = entry.Content
			}
			feed.Items = append(feed.Items, feedEntry{ID: strings.TrimSpace(entry.ID), Title: strings.TrimSpace(entry.Title), URL: link, Description: textFromHTML(description), PublishedAt: parseFeedTime(entry.Updated)})
		}
		return feed, nil
	default:
		return parsedFeed{}, fmt.Errorf("rss parse: unsupported root %q", root.XMLName.Local)
	}
}

func buildItem(ctx context.Context, source Source, entry feedEntry, llm LLMClient) (Item, error) {
	if strings.TrimSpace(entry.URL) == "" {
		entry.URL = source.URL + "#" + stableID("entry", entry.Title+entry.Description)
	}
	item := Item{
		ID:          stableID("item", source.ID+"|"+entryIdentity(entry)),
		SourceID:    source.ID,
		SourceTitle: source.Title,
		URL:         entry.URL,
		Title:       entry.Title,
		PublishedAt: entry.PublishedAt,
		FeedExcerpt: nullableString(entry.Description),
		Provenance:  Provenance{SourceURL: source.URL, OriginalURL: entry.URL},
		ModelStatus: modelStatusSummaryNA,
	}
	if item.Title == "" {
		item.Title = entry.URL
	}
	extracted, extractionStatus := extractArticleText(ctx, entry.URL, entry.Description)
	item.ExtractedText = nullableString(extracted)
	item.ExtractionStatus = extractionStatus
	available := extracted
	if strings.TrimSpace(available) == "" {
		available = entry.Description
	}
	if strings.TrimSpace(available) == "" {
		item.ExtractionStatus = extractionStatusOriginalNA
		item.ModelStatus = modelStatusSummaryNA
		return item, nil
	}
	if llm == nil {
		item.ModelStatus = modelStatusSummaryNA
		return item, nil
	}
	out, err := llm.SummarizeItem(ctx, OpenRouterSummaryInput{ItemID: item.ID, Title: item.Title, SourceTitle: item.SourceTitle, URL: item.URL, AvailableText: available})
	if err != nil {
		item.ModelStatus = modelStatusLatencyError
		return item, nil
	}
	item.ModelStatus = mapModelStatus(out.ModelStatus)
	if item.ModelStatus == modelStatusOK {
		item.Summary = nullableString(out.Summary)
		item.CoreInsight = nullableString(out.CoreInsight)
		item.ValueTier = nullableString(out.ValueTier)
	} else if item.ExtractionStatus == extractionStatusFull || item.ExtractionStatus == extractionStatusPartial {
		item.ExtractionStatus = extractionStatusSummaryNA
	}
	return item, nil
}

func extractArticleText(ctx context.Context, itemURL string, fallback string) (text string, status string) {
	parsed, err := url.Parse(itemURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, itemURL, nil)
	if err != nil {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			if strings.TrimSpace(fallback) != "" {
				text, status = "", extractionStatusPartial
				return
			}
			text, status = "", extractionStatusOriginalNA
		}
	}()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	extracted := textFromHTML(string(body))
	if extracted == "" {
		if strings.TrimSpace(fallback) != "" {
			return "", extractionStatusPartial
		}
		return "", extractionStatusOriginalNA
	}
	return extracted, extractionStatusFull
}

func upsertIngestedItem(ctx context.Context, db *sql.DB, item Item) error {
	_, err := db.ExecContext(ctx, `insert into items (id, source_id, source_url, url, title, summary, core_insight, value_tier, published_at, first_seen_at, extraction_status, model_status, feed_excerpt, extracted_text, canonical_url, story_key, duplicate_of_item_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set source_url = excluded.source_url, title = excluded.title, summary = excluded.summary, core_insight = excluded.core_insight, value_tier = excluded.value_tier, published_at = excluded.published_at, extraction_status = excluded.extraction_status, model_status = excluded.model_status, feed_excerpt = excluded.feed_excerpt, extracted_text = excluded.extracted_text, canonical_url = excluded.canonical_url, story_key = excluded.story_key, duplicate_of_item_id = excluded.duplicate_of_item_id`, item.ID, item.SourceID, item.Provenance.SourceURL, item.URL, item.Title, item.Summary, item.CoreInsight, item.ValueTier, formatTimePtr(item.PublishedAt), time.Now().UTC().Format(time.RFC3339), item.ExtractionStatus, item.ModelStatus, item.FeedExcerpt, item.ExtractedText, item.Provenance.CanonicalURL, item.StoryKey, item.DuplicateOfItemID)
	if err != nil {
		return fmt.Errorf("ingest item %q: %w", item.ID, err)
	}
	if err := upsertSearchIndex(ctx, db, item); err != nil {
		return err
	}
	return nil
}

func upsertSearchIndex(ctx context.Context, db *sql.DB, item Item) error {
	provenance := strings.Join([]string{item.Provenance.SourceURL, item.Provenance.OriginalURL, derefString(item.Provenance.CanonicalURL), derefString(item.StoryKey), derefString(item.DuplicateOfItemID)}, " ")
	_, err := db.ExecContext(ctx, `delete from search_fts where item_id = ?`, item.ID)
	if err != nil {
		return fmt.Errorf("refresh search index %q: delete old row: %w", item.ID, err)
	}
	_, err = db.ExecContext(ctx, `insert into search_fts (item_id, title, source_title, feed_excerpt, summary, extracted_text, provenance) values (?, ?, ?, ?, ?, ?, ?)`, item.ID, item.Title, item.SourceTitle, stringValue(item.FeedExcerpt), stringValue(item.Summary), stringValue(item.ExtractedText), provenance)
	if err != nil {
		return fmt.Errorf("refresh search index %q: insert row: %w", item.ID, err)
	}
	return nil
}

func updateSourceFetch(ctx context.Context, db *sql.DB, sourceID string, status string, rawErr string) error {
	_, err := db.ExecContext(ctx, `update sources set last_fetch_at = ?, last_fetch_status = ?, last_fetch_error = ? where id = ?`, time.Now().UTC().Format(time.RFC3339), status, nullableString(rawErr), sourceID)
	if err != nil {
		return fmt.Errorf("update source fetch %q: %w", sourceID, err)
	}
	return nil
}

func parseOPMLFeedURLs(data []byte) ([]string, error) {
	var doc struct {
		Outlines []opmlOutline `xml:"body>outline"`
	}
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("import opml: parse: %w", err)
	}
	seen := map[string]bool{}
	var urls []string
	var walk func([]opmlOutline)
	walk = func(outlines []opmlOutline) {
		for _, outline := range outlines {
			feedURL := strings.TrimSpace(outline.XMLURL)
			if feedURL != "" && !seen[feedURL] {
				seen[feedURL] = true
				urls = append(urls, feedURL)
			}
			walk(outline.Outlines)
		}
	}
	walk(doc.Outlines)
	return urls, nil
}

type opmlOutline struct {
	XMLURL   string        `xml:"xmlUrl,attr"`
	Outlines []opmlOutline `xml:"outline"`
}

func parseFeedTime(value string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	for _, layout := range []string{time.RFC1123Z, time.RFC1123, time.RFC3339, time.RFC822Z, time.RFC822} {
		if parsed, err := time.Parse(layout, value); err == nil {
			utc := parsed.UTC()
			return &utc
		}
	}
	return nil
}

func entryIdentity(entry feedEntry) string {
	for _, value := range []string{entry.ID, entry.URL, entry.Title + entry.Description} {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func stableID(prefix string, value string) string {
	h := fnv.New128a()
	_, _ = h.Write([]byte(value))
	return prefix + "_" + hex.EncodeToString(h.Sum(nil))
}

var htmlTagRE = regexp.MustCompile(`<[^>]+>`)
var whitespaceRE = regexp.MustCompile(`\s+`)

func textFromHTML(value string) string {
	value = htmlTagRE.ReplaceAllString(value, " ")
	value = strings.NewReplacer("&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`, "&#39;", "'").Replace(value)
	return strings.TrimSpace(whitespaceRE.ReplaceAllString(value, " "))
}

func nullableString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func formatTimePtr(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.UTC().Format(time.RFC3339)
}

func mapModelStatus(status string) string {
	switch strings.TrimSpace(status) {
	case modelStatusOK:
		return modelStatusOK
	case modelStatusLatencyError:
		return modelStatusLatencyError
	default:
		return modelStatusSummaryNA
	}
}
