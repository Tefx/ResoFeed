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

	boilerplateOnly := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `<html><body><article>Sign up for our newsletter</article></body></html>`)
	}))
	defer boilerplateOnly.Close()

	text, status = extractArticleText(context.Background(), boilerplateOnly.URL, "fallback excerpt")
	if status != extractionStatusPartial || text != "" {
		t.Fatalf("boilerplate-only extraction = (%q, %q), want empty/partial_extraction", text, status)
	}

	text, status = extractArticleText(context.Background(), "://bad-url", "")
	if status != extractionStatusOriginalNA || text != "" {
		t.Fatalf("unavailable extraction = (%q, %q), want empty/original_unavailable", text, status)
	}
}

func TestExtractArticleTextRejectsPDFPayloads(t *testing.T) {
	t.Parallel()

	pdf := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/pdf")
		_, _ = w.Write([]byte("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog >>\nendobj"))
	}))
	defer pdf.Close()

	text, status := extractArticleText(context.Background(), pdf.URL, "fallback excerpt")
	if status != extractionStatusPartial || text != "" {
		t.Fatalf("pdf with fallback extraction = (%q, %q), want empty/partial_extraction", text, status)
	}

	text, status = extractArticleText(context.Background(), pdf.URL, "")
	if status != extractionStatusOriginalNA || text != "" {
		t.Fatalf("pdf without fallback extraction = (%q, %q), want empty/original_unavailable", text, status)
	}
}

func TestExtractArticleTextRejectsXJavaScriptUnavailablePage(t *testing.T) {
	t.Parallel()

	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `<html><body><main>JavaScript is not available. Please enable JavaScript or switch to a supported browser to continue using x.com. Help Center © X Corp.</main></body></html>`)
	}))
	defer page.Close()

	text, status := extractArticleText(context.Background(), page.URL, "rss fallback excerpt")
	if status != extractionStatusPartial || text != "" {
		t.Fatalf("X JS placeholder with fallback = (%q, %q), want empty/partial_extraction", text, status)
	}

	text, status = extractArticleText(context.Background(), page.URL, "")
	if status != extractionStatusOriginalNA || text != "" {
		t.Fatalf("X JS placeholder without fallback = (%q, %q), want empty/original_unavailable", text, status)
	}
}

func TestBuildItemUsesRSSExcerptWhenFetchReturnsXJavaScriptUnavailablePage(t *testing.T) {
	t.Parallel()

	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `<html><body><main>JavaScript is not available. Please enable JavaScript or switch to a supported browser to continue using x. com. Help Center © X Corp.</main></body></html>`)
	}))
	defer page.Close()

	llm := &recordingIngestLLM{}
	item, err := buildItem(context.Background(), Source{ID: "src_x", URL: "https://feed.example/rss.xml", Title: "X Feed"}, feedEntry{ID: "x-js", Title: "RSS title", URL: page.URL, Description: "RSS excerpt with MiniMax M3 benchmark facts."}, llm, ProcessingLanguageEnglish)
	if err != nil {
		t.Fatalf("buildItem returned error: %v", err)
	}
	if item.ModelStatus != modelStatusOK {
		t.Fatalf("item model_status = %q, want ok", item.ModelStatus)
	}
	if !strings.Contains(llm.last.AvailableText, "RSS excerpt with MiniMax M3") {
		t.Fatalf("LLM available_text = %q, want RSS excerpt", llm.last.AvailableText)
	}
	if strings.Contains(llm.last.AvailableText, "JavaScript is not available") {
		t.Fatalf("LLM received X placeholder: %q", llm.last.AvailableText)
	}
	if llm.last.AvailableTextSource == "fresh_full_text" {
		t.Fatalf("LLM source marker = %q, want fallback marker", llm.last.AvailableTextSource)
	}
}

func TestExtractArticleTextRejectsSniffedBinaryPayloads(t *testing.T) {
	t.Parallel()

	binary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte{'%', 'P', 'D', 'F', '-', '1', '.', '7', '\n', 0, 1, 2})
	}))
	defer binary.Close()

	text, status := extractArticleText(context.Background(), binary.URL, "fallback excerpt")
	if status != extractionStatusPartial || text != "" {
		t.Fatalf("sniffed binary extraction = (%q, %q), want empty/partial_extraction", text, status)
	}
}

func TestExtractArticleTextPrefersSemanticReadableContainers(t *testing.T) {
	t.Parallel()

	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `<html><body>
			<nav>top nav should not leak</nav>
			<main>
				<aside>sidebar should not leak</aside>
				<div itemprop="articleBody">
					<p>Semantic container article lead.</p>
					<p>Semantic container article detail.</p>
				</div>
				<footer>footer should not leak</footer>
			</main>
		</body></html>`)
	}))
	defer page.Close()

	text, status := extractArticleText(context.Background(), page.URL, "fallback excerpt")
	if status != extractionStatusFull {
		t.Fatalf("status = %q, want %q with text %q", status, extractionStatusFull, text)
	}
	for _, want := range []string{"Semantic container article lead.", "Semantic container article detail."} {
		if !strings.Contains(text, want) {
			t.Fatalf("extracted text %q missing %q", text, want)
		}
	}
	for _, unwanted := range []string{"top nav should not leak", "sidebar should not leak", "footer should not leak"} {
		if strings.Contains(text, unwanted) {
			t.Fatalf("extracted text %q contains boilerplate %q", text, unwanted)
		}
	}
}

func TestExtractArticleTextPreservesParagraphBoundariesForReadableSanitation(t *testing.T) {
	t.Parallel()

	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `<html><body>
			<article>
				<p>The company said the new policy changes how moderators review appeals.</p>
				<p>Engineers will ship the migration in phases after reviewing safety data.</p>
				<p>Sign up for our newsletter and review our privacy policy.</p>
			</article>
		</body></html>`)
	}))
	defer page.Close()

	text, status := extractArticleText(context.Background(), page.URL, "fallback excerpt")
	if status != extractionStatusFull {
		t.Fatalf("status = %q, want %q with text %q", status, extractionStatusFull, text)
	}
	for _, want := range []string{
		"The company said the new policy changes how moderators review appeals.",
		"Engineers will ship the migration in phases after reviewing safety data.",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("extracted text %q missing %q", text, want)
		}
	}
	for _, unwanted := range []string{"Sign up for our newsletter", "privacy policy"} {
		if strings.Contains(text, unwanted) {
			t.Fatalf("extracted text %q contains boilerplate %q", text, unwanted)
		}
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

	err := IngestOnce(ctx, db, IngestConfig{LLM: failingGemini{}})
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
	if state.items[0].modelStatus != modelStatusTimeout || state.items[0].extractionStatus != extractionStatusPartial {
		t.Fatalf("item statuses = extraction %q model %q, want partial_extraction/timeout", state.items[0].extractionStatus, state.items[0].modelStatus)
	}
}

func TestOpenRouterClientHandlesJSONSummarySteeringAndRetry(t *testing.T) {
	t.Parallel()

	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api/v1/models" {
			writeOpenRouterModelsMetadata(t, w, "openrouter-test")
			return
		}
		calls++
		if r.URL.Path != "/api/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("unexpected OpenRouter request path/auth: path=%s auth=%q", r.URL.Path, r.Header.Get("Authorization"))
		}
		var req openRouterChatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if req.ResponseFormat["type"] != "json_object" {
			t.Fatalf("unexpected openrouter request: %+v", req)
		}
		if calls == 1 {
			http.Error(w, "try again", http.StatusTooManyRequests)
			return
		}
		text := `{"localized_title":"Dense title","summary":"Dense factual summary.","core_insight":"Why this matters.","key_points":["Specific source-backed point one.","Specific source-backed point two.","Specific source-backed point three."],"value_tier":"high","model_status":"ok"}`
		if len(req.Messages) == 1 && strings.Contains(req.Messages[0].Content, "translate_steering") {
			text = `{"interpreted_as":"steering_policy_update","rule_texts":["Push more systems papers."],"message":"steering updated"}`
		} else if len(req.Messages) != 2 || req.Messages[0].Role != "system" || req.Messages[1].Role != "user" {
			t.Fatalf("unexpected summary request messages: %+v", req.Messages)
		}
		_ = json.NewEncoder(w).Encode(openRouterChatResponse{Choices: []struct {
			Message openRouterMessage `json:"message"`
		}{{Message: openRouterMessage{Role: "assistant", Content: text}}}})
	}))
	defer server.Close()

	client := &openRouterHTTPClient{apiKey: "test-key", model: "openrouter-test", endpoint: server.URL, client: server.Client()}
	summary, err := client.SummarizeItem(context.Background(), OpenRouterSummaryInput{ItemID: "item_01", Title: "Title", SourceTitle: "Source", URL: "https://example.com", AvailableText: "body"})
	if err != nil {
		t.Fatalf("SummarizeItem returned error: %v", err)
	}
	if summary.ModelStatus != modelStatusOK || summary.Summary == "" || calls != 2 {
		t.Fatalf("summary = %+v calls=%d, want ok with one retry", summary, calls)
	}

	steering, err := client.TranslateSteering(context.Background(), OpenRouterSteeringInput{Command: "Push more systems papers.", ActorKind: ActorKindHuman})
	if err != nil {
		t.Fatalf("TranslateSteering returned error: %v", err)
	}
	if steering.InterpretedAs != "steering_policy_update" || len(steering.RuleTexts) != 1 {
		t.Fatalf("steering = %+v, want translated proposal", steering)
	}
}

type failingGemini struct{}

func (failingGemini) SummarizeItem(context.Context, OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	return OpenRouterSummaryOutput{}, context.DeadlineExceeded
}

func (failingGemini) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, context.DeadlineExceeded
}

type recordingIngestLLM struct {
	last OpenRouterSummaryInput
}

func (l *recordingIngestLLM) SummarizeItem(_ context.Context, input OpenRouterSummaryInput) (OpenRouterSummaryOutput, error) {
	l.last = input
	out := ccrTestSummaryOutput("RSS title", "RSS excerpt with MiniMax M3 benchmark facts.", "MiniMax M3 benchmark facts matter.", "high")
	out.KeyPoints = []string{
		"RSS excerpt with MiniMax M3 benchmark facts point one.",
		"RSS excerpt with MiniMax M3 benchmark facts point two.",
		"RSS excerpt with MiniMax M3 benchmark facts point three.",
	}
	return out, nil
}

func (l *recordingIngestLLM) TranslateSteering(context.Context, OpenRouterSteeringInput) (OpenRouterSteeringOutput, error) {
	return OpenRouterSteeringOutput{}, nil
}

type ingestFakeState struct {
	mu             sync.Mutex
	sources        []Source
	sourceStatuses map[string]string
	itemIDs        map[string]bool
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
	if state.itemIDs == nil {
		state.itemIDs = map[string]bool{}
	}
	return &ingestFakeConn{state: state}, nil
}

type ingestFakeConn struct{ state *ingestFakeState }

func (c *ingestFakeConn) Prepare(string) (driver.Stmt, error) { return nil, driver.ErrSkip }
func (c *ingestFakeConn) Close() error                        { return nil }
func (c *ingestFakeConn) Begin() (driver.Tx, error)           { return nil, driver.ErrSkip }

func (c *ingestFakeConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if strings.Contains(query, "from sources") {
		return &ingestFakeRows{columns: []string{"id", "url", "title"}, sources: c.state.sources}, nil
	}
	if strings.Contains(query, "from items") {
		itemID, _ := args[0].Value.(string)
		c.state.mu.Lock()
		exists := c.state.itemIDs[itemID]
		c.state.mu.Unlock()
		if !exists {
			return &ingestFakeRows{columns: []string{"1"}}, nil
		}
		return &ingestFakeRows{columns: []string{"1"}, values: [][]driver.Value{{int64(1)}}}, nil
	}
	if strings.Contains(query, "from steer_rules") {
		return &ingestFakeRows{columns: []string{"id", "rule_text", "is_active", "superseded_by", "revision", "created_by_actor_kind", "created_by_actor_id"}, values: [][]driver.Value{}}, nil
	}
	return nil, driver.ErrSkip
}

func (c *ingestFakeConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	c.state.mu.Lock()
	defer c.state.mu.Unlock()
	switch {
	case strings.HasPrefix(query, "update sources set title"):
		if len(args) >= 5 {
			status, _ := args[2].Value.(string)
			sourceID, _ := args[len(args)-1].Value.(string)
			c.state.sourceStatuses[sourceID] = status
		}
		return driver.RowsAffected(1), nil
	case strings.HasPrefix(query, "update sources set last_fetch_at"):
		status, _ := args[1].Value.(string)
		sourceID, _ := args[3].Value.(string)
		c.state.sourceStatuses[sourceID] = status
		return driver.RowsAffected(1), nil
	case strings.HasPrefix(query, "insert into items"):
		itemID, _ := args[0].Value.(string)
		valueTier, _ := args[10].Value.(string)
		extractionStatus, _ := args[18].Value.(string)
		modelStatus, _ := args[19].Value.(string)
		c.state.itemIDs[itemID] = true
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
	values  [][]driver.Value
	idx     int
}

func (r *ingestFakeRows) Columns() []string { return r.columns }
func (r *ingestFakeRows) Close() error      { return nil }

func (r *ingestFakeRows) Next(dest []driver.Value) error {
	if r.values != nil {
		if r.idx >= len(r.values) {
			return io.EOF
		}
		copy(dest, r.values[r.idx])
		r.idx++
		return nil
	}
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
