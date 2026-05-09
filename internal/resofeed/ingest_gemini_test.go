package resofeed

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestParseFeedSupportsRSSAndAtom(t *testing.T) {
	t.Parallel()

	rss, err := parseFeed([]byte(`<?xml version="1.0"?><rss><channel><title>RSS Source</title><item><guid>one</guid><title>RSS Item</title><link>https://example.com/one</link><description><![CDATA[<p>RSS excerpt</p>]]></description><pubDate>Sat, 09 May 2026 12:00:00 +0000</pubDate></item></channel></rss>`))
	if err != nil {
		t.Fatalf("parse RSS: %v", err)
	}
	if rss.Title != "RSS Source" || len(rss.Items) != 1 || rss.Items[0].Title != "RSS Item" || rss.Items[0].Description != "RSS excerpt" || rss.Items[0].PublishedAt == nil {
		t.Fatalf("unexpected RSS parse: %+v", rss)
	}

	atom, err := parseFeed([]byte(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Source</title><entry><id>atom-one</id><title>Atom Item</title><link href="https://example.com/atom" rel="alternate"/><summary>Atom excerpt</summary><updated>2026-05-09T12:00:00Z</updated></entry></feed>`))
	if err != nil {
		t.Fatalf("parse Atom: %v", err)
	}
	if atom.Title != "Atom Source" || len(atom.Items) != 1 || atom.Items[0].URL != "https://example.com/atom" || atom.Items[0].PublishedAt == nil {
		t.Fatalf("unexpected Atom parse: %+v", atom)
	}
}

func TestExtractionStatusMappingCoversFullPartialAndOriginalUnavailable(t *testing.T) {
	t.Parallel()

	article := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `<html><body><article>full extracted text</article></body></html>`)
	}))
	defer article.Close()

	text, status := extractArticleText(context.Background(), article.URL, "fallback excerpt")
	if status != extractionStatusFull || !strings.Contains(text, "full extracted text") {
		t.Fatalf("full extraction = (%q, %q), want full text/full", text, status)
	}

	dead := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "gone", http.StatusGone)
	}))
	dead.Close()

	text, status = extractArticleText(context.Background(), dead.URL, "fallback excerpt")
	if status != extractionStatusPartial || text != "" {
		t.Fatalf("partial extraction = (%q, %q), want empty/partial_extraction", text, status)
	}

	text, status = extractArticleText(context.Background(), "://bad-url", "")
	if status != extractionStatusOriginalNA || text != "" {
		t.Fatalf("unavailable extraction = (%q, %q), want empty/original_unavailable", text, status)
	}
}

func TestIngestOnceIsolatesSourceFailuresAndMapsModelFailure(t *testing.T) {
	ctx := context.Background()
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			_, _ = io.WriteString(w, `<?xml version="1.0"?><rss><channel><title>Working</title><item><guid>ok</guid><title>OK</title><link>`+r.Host+`://bad</link><description>fallback text</description></item></channel></rss>`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer feed.Close()

	state := &ingestFakeState{
		sources: []Source{
			{ID: "src_dead", URL: "http://127.0.0.1:1/nope.xml", Title: "Dead"},
			{ID: "src_ok", URL: feed.URL + "/feed.xml", Title: "Old"},
		},
	}
	db := openIngestFakeDB(t, state)
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close fake db: %v", err)
		}
	})

	err := IngestOnce(ctx, db, IngestConfig{Gemini: failingGemini{}})
	if err != nil {
		t.Fatalf("IngestOnce returned error: %v", err)
	}
	if state.sourceStatuses["src_dead"] != sourceStatusFetchError {
		t.Fatalf("dead source status = %q, want rss_fetch_error", state.sourceStatuses["src_dead"])
	}
	if state.sourceStatuses["src_ok"] != sourceStatusOK {
		t.Fatalf("working source status = %q, want ok", state.sourceStatuses["src_ok"])
	}
	if len(state.items) != 1 {
		t.Fatalf("inserted items = %d, want 1", len(state.items))
	}
	if state.items[0].modelStatus != modelStatusLatencyError || state.items[0].extractionStatus != extractionStatusPartial {
		t.Fatalf("item statuses = extraction %q model %q, want partial_extraction/model_latency_error", state.items[0].extractionStatus, state.items[0].modelStatus)
	}
}

func TestGeminiClientHandlesJSONSummarySteeringAndRetry(t *testing.T) {
	t.Parallel()

	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Query().Get("key") != "test-key" {
			t.Fatalf("missing key in request URL: %s", r.URL.String())
		}
		var req geminiGenerateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if req.GenerationConfig.ResponseMIMEType != "application/json" || len(req.Contents) != 1 || len(req.Contents[0].Parts) != 1 {
			t.Fatalf("unexpected gemini request: %+v", req)
		}
		if calls == 1 {
			http.Error(w, "try again", http.StatusTooManyRequests)
			return
		}
		text := `{"summary":"Dense factual summary.","core_insight":"Why this matters.","value_tier":"high","model_status":"ok"}`
		if strings.Contains(req.Contents[0].Parts[0].Text, "translate_steering") {
			text = `{"interpreted_as":"steering_policy_update","rule_texts":["Push more systems papers."],"message":"steering updated"}`
		}
		_ = json.NewEncoder(w).Encode(geminiGenerateResponse{Candidates: []struct {
			Content geminiContent `json:"content"`
		}{{Content: geminiContent{Parts: []geminiPart{{Text: text}}}}}})
	}))
	defer server.Close()

	client := &geminiHTTPClient{apiKey: "test-key", model: "gemini-test", endpoint: server.URL, client: server.Client()}
	summary, err := client.SummarizeItem(context.Background(), GeminiSummaryInput{ItemID: "item_01", Title: "Title", SourceTitle: "Source", URL: "https://example.com", AvailableText: "body"})
	if err != nil {
		t.Fatalf("SummarizeItem returned error: %v", err)
	}
	if summary.ModelStatus != modelStatusOK || summary.Summary == "" || calls != 2 {
		t.Fatalf("summary = %+v calls=%d, want ok with one retry", summary, calls)
	}

	steering, err := client.TranslateSteering(context.Background(), GeminiSteeringInput{Command: "Push more systems papers.", ActorKind: ActorKindHuman})
	if err != nil {
		t.Fatalf("TranslateSteering returned error: %v", err)
	}
	if steering.InterpretedAs != "steering_policy_update" || len(steering.RuleTexts) != 1 {
		t.Fatalf("steering = %+v, want translated proposal", steering)
	}
}

type failingGemini struct{}

func (failingGemini) SummarizeItem(context.Context, GeminiSummaryInput) (GeminiSummaryOutput, error) {
	return GeminiSummaryOutput{}, context.DeadlineExceeded
}

func (failingGemini) TranslateSteering(context.Context, GeminiSteeringInput) (GeminiSteeringOutput, error) {
	return GeminiSteeringOutput{}, context.DeadlineExceeded
}

type ingestFakeState struct {
	mu             sync.Mutex
	sources        []Source
	sourceStatuses map[string]string
	items          []ingestFakeItem
}

type ingestFakeItem struct {
	extractionStatus string
	modelStatus      string
	valueTier        string
}

var registerIngestFakeDriverOnce sync.Once

func openIngestFakeDB(t *testing.T, state *ingestFakeState) *sql.DB {
	t.Helper()
	registerIngestFakeDriverOnce.Do(func() {
		sql.Register("resofeed_ingest_fake", ingestFakeDriver{})
	})
	ingestFakeStates.Store("test", state)
	db, err := sql.Open("resofeed_ingest_fake", "test")
	if err != nil {
		t.Fatalf("open fake db: %v", err)
	}
	return db
}

var ingestFakeStates sync.Map

type ingestFakeDriver struct{}

func (ingestFakeDriver) Open(name string) (driver.Conn, error) {
	value, _ := ingestFakeStates.Load(name)
	state, _ := value.(*ingestFakeState)
	if state.sourceStatuses == nil {
		state.sourceStatuses = map[string]string{}
	}
	return &ingestFakeConn{state: state}, nil
}

type ingestFakeConn struct{ state *ingestFakeState }

func (c *ingestFakeConn) Prepare(string) (driver.Stmt, error) { return nil, driver.ErrSkip }
func (c *ingestFakeConn) Close() error                        { return nil }
func (c *ingestFakeConn) Begin() (driver.Tx, error)           { return nil, driver.ErrSkip }

func (c *ingestFakeConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	if strings.Contains(query, "from sources") {
		return &ingestFakeRows{columns: []string{"id", "url", "title"}, sources: c.state.sources}, nil
	}
	return nil, driver.ErrSkip
}

func (c *ingestFakeConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	c.state.mu.Lock()
	defer c.state.mu.Unlock()
	switch {
	case strings.HasPrefix(query, "update sources set title"):
		return driver.RowsAffected(1), nil
	case strings.HasPrefix(query, "update sources set last_fetch_at"):
		status, _ := args[1].Value.(string)
		sourceID, _ := args[3].Value.(string)
		c.state.sourceStatuses[sourceID] = status
		return driver.RowsAffected(1), nil
	case strings.HasPrefix(query, "insert into items"):
		valueTier, _ := args[7].Value.(string)
		extractionStatus, _ := args[10].Value.(string)
		modelStatus, _ := args[11].Value.(string)
		c.state.items = append(c.state.items, ingestFakeItem{extractionStatus: extractionStatus, modelStatus: modelStatus, valueTier: valueTier})
		return driver.RowsAffected(1), nil
	case strings.HasPrefix(query, "delete from search_fts"):
		return driver.RowsAffected(1), nil
	case strings.HasPrefix(query, "insert into search_fts"):
		return driver.RowsAffected(1), nil
	default:
		return driver.RowsAffected(0), nil
	}
}

type ingestFakeRows struct {
	columns []string
	sources []Source
	idx     int
}

func (r *ingestFakeRows) Columns() []string { return r.columns }
func (r *ingestFakeRows) Close() error      { return nil }

func (r *ingestFakeRows) Next(dest []driver.Value) error {
	if r.idx >= len(r.sources) {
		return io.EOF
	}
	source := r.sources[r.idx]
	r.idx++
	dest[0] = source.ID
	dest[1] = source.URL
	dest[2] = source.Title
	return nil
}
