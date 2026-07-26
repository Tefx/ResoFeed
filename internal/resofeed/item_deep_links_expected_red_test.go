package resofeed

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
	"unicode"
	"unicode/utf8"
)

const itemDeepLinkBackendGap = "IDL-BACKEND-READ-PROJECTION-GAP"

func TestItemDeepLinkDuplicateReadEnvelopeAndMCPAppURL(t *testing.T) {
	assertItemDeepLinkDocumentationAuthority(t)

	ctx := context.Background()
	db := newContractDB(t, ctx)
	seedItemDeepLinkBackendFixture(t, ctx, db)
	if err := rebuildSearchIndex(ctx, db); err != nil {
		t.Fatalf("rebuild item deep-link fixture search index: %v", err)
	}
	stateBefore := itemDeepLinkStateSnapshot(t, ctx, db)

	const publicURL = "https://resofeed.tefx.one"
	router := NewRouter(HTTPServerConfig{
		DB:         db,
		PublicURL:  publicURL,
		OwnerToken: contractOwnerToken,
	})
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	client := server.Client()
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }

	root, err := embeddedUIRoot()
	if err != nil {
		t.Fatalf("open embedded UI for item deep-link contract: %v", err)
	}
	index, err := fs.ReadFile(root, "index.html")
	if err != nil {
		t.Fatalf("read embedded UI index for item deep-link contract: %v", err)
	}

	gaps := []string{}
	for _, route := range []string{
		itemDeepLinkAppPath(t, "item_deep_link_ordinary"),
		itemDeepLinkAppPath(t, "."),
		itemDeepLinkAppPath(t, ".."),
		itemDeepLinkAppPath(t, "~slash/%?hash#雪"),
		itemDeepLinkAppPath(t, "_app/../index.html"),
		"/items/~" + base64.RawURLEncoding.EncodeToString([]byte("~slash/%?hash#雪")),
		"/items/item_deep_link_ordinary/extra",
	} {
		status, headers, body := itemDeepLinkGET(t, client, server.URL+route, "")
		if status != http.StatusOK || headers.Get("Location") != "" || !bytes.Equal(body, index) {
			gaps = append(gaps, fmt.Sprintf("SPA dispatch %q status=%d location=%q index_equal=%t", route, status, headers.Get("Location"), bytes.Equal(body, index)))
		}
		if bytes.Contains(body, []byte("Deep link ordinary contract item")) {
			gaps = append(gaps, fmt.Sprintf("unauthenticated SPA response for %q exposed item content", route))
		}
	}

	malformedStatus, malformedHeaders, malformedBody := itemDeepLinkMalformedPercentResponse(t, server.URL)
	if malformedStatus != http.StatusBadRequest || malformedHeaders.Get("Location") != "" || bytes.Equal(malformedBody, index) {
		gaps = append(gaps, fmt.Sprintf("malformed-percent cold load status=%d location=%q index_equal=%t", malformedStatus, malformedHeaders.Get("Location"), bytes.Equal(malformedBody, index)))
	}

	ordinary := itemDeepLinkHTTPRead(t, client, server.URL, "item_deep_link_ordinary")
	itemDeepLinkCheckEnvelope(&gaps, "HTTP ordinary", ordinary, "item_deep_link_ordinary", nil, nil, nil)

	resolved := itemDeepLinkHTTPRead(t, client, server.URL, "item_deep_link_duplicate")
	itemDeepLinkCheckEnvelope(&gaps, "HTTP resolved duplicate", resolved, "item_deep_link_authority", "item_deep_link_duplicate", "item_deep_link_authority", true)

	broken := itemDeepLinkHTTPRead(t, client, server.URL, "item_deep_link_broken")
	itemDeepLinkCheckEnvelope(&gaps, "HTTP broken duplicate", broken, "item_deep_link_broken", nil, "item_deep_link_missing", false)

	special := itemDeepLinkHTTPRead(t, client, server.URL, "~slash/%?hash#雪")
	itemDeepLinkCheckEnvelope(&gaps, "HTTP opaque special ID", special, "~slash/%?hash#雪", nil, nil, nil)

	mcpHandler := NewMCPHandler(MCPConfig{
		DB:         db,
		PublicURL:  publicURL,
		OwnerToken: contractOwnerToken,
	})
	candidate := itemDeepLinkMCPResult(t, mcpHandler, "list_candidate_items", map[string]any{"limit": 20})
	itemDeepLinkCheckMCPItemURL(&gaps, "MCP list_candidate_items", itemDeepLinkFindItem(candidate, "item_deep_link_ordinary"), publicURL, "item_deep_link_ordinary")

	search := itemDeepLinkMCPResult(t, mcpHandler, "search_items", map[string]any{"query": "DeepLinkContractUnique", "limit": 20})
	itemDeepLinkCheckMCPItemURL(&gaps, "MCP search_items", itemDeepLinkFindItem(search, "item_deep_link_ordinary"), publicURL, "item_deep_link_ordinary")

	mcpResolved := itemDeepLinkMCPResult(t, mcpHandler, "read_item", map[string]any{"item_id": "item_deep_link_duplicate"})
	itemDeepLinkCheckEnvelope(&gaps, "MCP resolved duplicate", mcpResolved, "item_deep_link_authority", "item_deep_link_duplicate", "item_deep_link_authority", true)
	itemDeepLinkCheckMCPItemURL(&gaps, "MCP read_item resolved duplicate", itemDeepLinkObject(mcpResolved, "item"), publicURL, "item_deep_link_authority")

	mcpSpecial := itemDeepLinkMCPResult(t, mcpHandler, "read_item", map[string]any{"item_id": "~slash/%?hash#雪"})
	itemDeepLinkCheckEnvelope(&gaps, "MCP opaque special ID", mcpSpecial, "~slash/%?hash#雪", nil, nil, nil)
	itemDeepLinkCheckMCPItemURL(&gaps, "MCP read_item opaque special ID", itemDeepLinkObject(mcpSpecial, "item"), publicURL, "~slash/%?hash#雪")

	itemDeepLinkCheckPublicURLContract(&gaps)

	stateAfter := itemDeepLinkStateSnapshot(t, ctx, db)
	if stateAfter != stateBefore {
		gaps = append(gaps, fmt.Sprintf("read-only HTTP/MCP lifecycle changed item_state: before=%q after=%q", stateBefore, stateAfter))
	}

	if len(gaps) > 0 {
		detail := strings.Join(gaps, "; ")
		if len(detail) > 12000 {
			detail = detail[:12000] + "…"
		}
		t.Fatalf("%s: %s", itemDeepLinkBackendGap, detail)
	}

	t.Log("ITEM_DEEP_LINK_HTTP_CANONICAL=complete")
	t.Log("ITEM_DEEP_LINK_STATIC_DISPATCH=complete")
	t.Log("ITEM_DEEP_LINK_DUPLICATE_RESULT=complete")
	t.Log("ITEM_DEEP_LINK_MCP_APP_URL=complete")
	t.Log("ITEM_DEEP_LINK_PUBLIC_URL=complete")
	t.Log("ITEM_DEEP_LINK_READ_ONLY=complete")
}

func assertItemDeepLinkDocumentationAuthority(t *testing.T) {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("..", "..", "docs", "ITEM_DEEP_LINKS.md"))
	if err != nil {
		t.Fatalf("read item deep-link authority: %v", err)
	}
	text := string(body)
	for _, required := range []string{
		"Telegram",
		"email",
		"bookmarks",
		"Generic browser navigation",
		"Automated desktop and narrow/mobile browser matrices",
		"Automated production Tailnet/Caddy verification",
		"https://resofeed.tefx.one",
		"MCP `app_url`",
	} {
		if !strings.Contains(text, required) {
			t.Fatalf("IDL-DOC-AUTHORITY-DRIFT: docs/ITEM_DEEP_LINKS.md missed capability-based consumer proof %q", required)
		}
	}
	for _, stale := range []string{
		"Required environments:\n\n- Safari;",
		"- Chrome;",
		"- Telegram iOS;",
		"- Telegram Android;",
		"- Telegram Desktop;",
		"- email-client link opening;",
		"Codex or equivalent external automation",
		"For each Telegram client, capture:",
		"required real-client release checks",
	} {
		if strings.Contains(text, stale) {
			t.Fatalf("IDL-DOC-AUTHORITY-DRIFT: docs/ITEM_DEEP_LINKS.md retained stale mandatory client authority %q", stale)
		}
	}
}

func seedItemDeepLinkBackendFixture(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	seedSource(t, ctx, db, "src_item_deep_links", "https://deep-links.example.test/feed.xml", "Deep Link Contract Source")
	now := time.Date(2026, 7, 26, 12, 0, 0, 0, time.UTC)
	rows := []struct {
		id          string
		title       string
		storyKey    string
		duplicateOf any
	}{
		{id: "item_deep_link_authority", title: "Deep link authoritative contract item", storyKey: "story_deep_link_resolved", duplicateOf: nil},
		{id: "item_deep_link_duplicate", title: "Deep link duplicate contract item", storyKey: "story_deep_link_resolved", duplicateOf: "item_deep_link_authority"},
		{id: "item_deep_link_broken", title: "Deep link broken-target contract item", storyKey: "story_deep_link_broken", duplicateOf: "item_deep_link_missing"},
		{id: "item_deep_link_ordinary", title: "DeepLinkContractUnique ordinary contract item", storyKey: "story_deep_link_ordinary", duplicateOf: nil},
		{id: "~slash/%?hash#雪", title: "Deep link opaque special contract item", storyKey: "story_deep_link_special", duplicateOf: nil},
	}
	for index, row := range rows {
		published := now.Add(-time.Duration(index) * time.Minute).Format(time.RFC3339)
		_, err := db.ExecContext(ctx, `insert into items (
			id, source_id, source_url, url, canonical_url, title, source_item_title,
			localized_title, summary, core_insight, key_points, feed_excerpt, extracted_text,
			value_tier, published_at, first_seen_at, extraction_status, extraction_source,
			content_status, model_status, story_key, duplicate_of_item_id
		) values (?, 'src_item_deep_links', 'https://deep-links.example.test/feed.xml', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'high', ?, ?, 'full', 'local_readable', 'available', 'ok', ?, ?)`,
			row.id,
			fmt.Sprintf("https://deep-links.example.test/articles/%d", index),
			fmt.Sprintf("https://deep-links.example.test/articles/%d", index),
			row.title,
			row.title,
			row.title,
			"Summary for "+row.title,
			"Core insight for "+row.title,
			`["one","two","three"]`,
			"Feed excerpt for "+row.title,
			"Extracted text for "+row.title,
			published,
			published,
			row.storyKey,
			row.duplicateOf,
		)
		if err != nil {
			t.Fatalf("seed item deep-link row %q: %v", row.id, err)
		}
	}
	for _, state := range []struct {
		id        string
		resonated int
		inspected any
		surfaced  any
	}{
		{id: "item_deep_link_authority", resonated: 1, inspected: "2026-07-25T10:00:00Z", surfaced: nil},
		{id: "item_deep_link_duplicate", resonated: 0, inspected: nil, surfaced: "2026-07-25T11:00:00Z"},
		{id: "item_deep_link_ordinary", resonated: 0, inspected: nil, surfaced: nil},
	} {
		if _, err := db.ExecContext(ctx, `insert into item_state (item_id, is_resonated, human_inspected_at, external_surfaced_at, last_actor_kind, last_actor_id) values (?, ?, ?, ?, 'human', 'fixture')`, state.id, state.resonated, state.inspected, state.surfaced); err != nil {
			t.Fatalf("seed item deep-link state %q: %v", state.id, err)
		}
	}
}

func itemDeepLinkStateSnapshot(t *testing.T, ctx context.Context, db *sql.DB) string {
	t.Helper()
	var snapshot string
	err := db.QueryRowContext(ctx, `select coalesce(group_concat(row_value, char(10)), '') from (
		select item_id || '|' || is_resonated || '|' || coalesce(human_inspected_at, '') || '|' ||
		       coalesce(external_surfaced_at, '') || '|' || coalesce(last_actor_kind, '') || '|' || coalesce(last_actor_id, '') as row_value
		from item_state order by item_id
	)`).Scan(&snapshot)
	if err != nil {
		t.Fatalf("snapshot item_state: %v", err)
	}
	return snapshot
}

func itemDeepLinkHTTPRead(t *testing.T, client *http.Client, baseURL string, itemID string) map[string]any {
	t.Helper()
	token := "~" + base64.RawURLEncoding.EncodeToString([]byte(itemID))
	status, _, body := itemDeepLinkGET(t, client, baseURL+"/api/items/"+token, contractOwnerToken)
	if status != http.StatusOK {
		t.Fatalf("authenticated item deep-link HTTP read %q status=%d body=%s", itemID, status, strings.TrimSpace(string(body)))
	}
	var result map[string]any
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("decode item deep-link HTTP read %q: %v; body=%s", itemID, err, string(body))
	}
	return result
}

func itemDeepLinkGET(t *testing.T, client *http.Client, target string, ownerToken string) (int, http.Header, []byte) {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		t.Fatalf("construct item deep-link request %q: %v", target, err)
	}
	if ownerToken != "" {
		request.Header.Set("Authorization", "Bearer "+ownerToken)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("execute item deep-link request %q: %v", target, err)
	}
	defer func() { _ = response.Body.Close() }()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read item deep-link response %q: %v", target, err)
	}
	return response.StatusCode, response.Header.Clone(), body
}

func itemDeepLinkMalformedPercentResponse(t *testing.T, serverURL string) (int, http.Header, []byte) {
	t.Helper()
	host := strings.TrimPrefix(serverURL, "http://")
	connection, err := net.DialTimeout("tcp", host, 5*time.Second)
	if err != nil {
		t.Fatalf("dial real Go server for malformed-percent request: %v", err)
	}
	defer func() { _ = connection.Close() }()
	if _, err := fmt.Fprintf(connection, "GET /items/%%ZZ HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n", host); err != nil {
		t.Fatalf("write malformed-percent request: %v", err)
	}
	response, err := http.ReadResponse(bufio.NewReader(connection), &http.Request{Method: http.MethodGet})
	if err != nil {
		t.Fatalf("read malformed-percent response: %v", err)
	}
	defer func() { _ = response.Body.Close() }()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read malformed-percent response body: %v", err)
	}
	return response.StatusCode, response.Header.Clone(), body
}

func itemDeepLinkCheckEnvelope(gaps *[]string, label string, body map[string]any, itemID string, resolvedFrom any, duplicateTarget any, duplicateAvailable any) {
	item := itemDeepLinkObject(body, "item")
	if item == nil || item["id"] != itemID {
		*gaps = append(*gaps, fmt.Sprintf("%s item.id=%v want=%q", label, item["id"], itemID))
	}
	for _, field := range []struct {
		name string
		want any
	}{
		{name: "resolved_from_item_id", want: resolvedFrom},
		{name: "duplicate_target_item_id", want: duplicateTarget},
		{name: "duplicate_target_available", want: duplicateAvailable},
	} {
		got, present := body[field.name]
		if !present || !reflect.DeepEqual(got, field.want) {
			*gaps = append(*gaps, fmt.Sprintf("%s %s present=%t value=%v want=%v", label, field.name, present, got, field.want))
		}
	}
}

func itemDeepLinkMCPResult(t *testing.T, handler http.Handler, tool string, arguments map[string]any) map[string]any {
	t.Helper()
	response := mcpCall(t, handler, tool, arguments)
	if response.Error != nil {
		t.Fatalf("MCP %s returned error: %+v", tool, response.Error)
	}
	text := mcpToolText(t, response, tool)
	var result map[string]any
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		t.Fatalf("decode MCP %s result: %v; text=%s", tool, err, text)
	}
	return result
}

func itemDeepLinkFindItem(body map[string]any, itemID string) map[string]any {
	items, _ := body["items"].([]any)
	for _, candidate := range items {
		item, _ := candidate.(map[string]any)
		if item["id"] == itemID {
			return item
		}
	}
	return nil
}

func itemDeepLinkObject(body map[string]any, field string) map[string]any {
	if body == nil {
		return nil
	}
	value, _ := body[field].(map[string]any)
	return value
}

func itemDeepLinkCheckMCPItemURL(gaps *[]string, label string, item map[string]any, publicURL string, itemID string) {
	if item == nil {
		*gaps = append(*gaps, label+" missed selected fixture item")
		return
	}
	expected := publicURL + itemDeepLinkAppPathValue(itemID)
	actual, ok := item["app_url"].(string)
	if !ok || actual != expected {
		*gaps = append(*gaps, fmt.Sprintf("%s app_url=%v want=%q", label, item["app_url"], expected))
	}
}

func itemDeepLinkCheckPublicURLContract(gaps *[]string) {
	for _, fixture := range []struct {
		addr string
		want string
	}{
		{addr: "Example.COM:08080", want: "http://example.com:8080"},
		{addr: "127.0.0.1:00443", want: "http://127.0.0.1:443"},
		{addr: "0.0.0.0:8080", want: "http://127.0.0.1:8080"},
		{addr: "[2001:0DB8::1]:00443", want: "http://[2001:db8::1]:443"},
		{addr: "[::]:8080", want: "http://[::1]:8080"},
	} {
		if err := validateAddr(fixture.addr); err != nil {
			*gaps = append(*gaps, fmt.Sprintf("accepted --addr %q rejected: %v", fixture.addr, err))
			continue
		}
		actual, err := derivePublicURL(fixture.addr)
		if err != nil || actual != fixture.want {
			*gaps = append(*gaps, fmt.Sprintf("derived PublicURL for %q value=%q error=%v want=%q", fixture.addr, actual, err, fixture.want))
		}
	}
	for _, invalid := range []string{
		":8080",
		"例え.test:8080",
		"*:8080",
		"http://example.test:8080",
		"2001:db8::1:8080",
		"[fe80::1%lo0]:8080",
		"01.2.3.4:8080",
		"127.0.0.1:0",
		"127.0.0.1:65536",
	} {
		if validateAddr(invalid) == nil {
			*gaps = append(*gaps, fmt.Sprintf("excluded --addr %q was accepted", invalid))
		}
	}

	for _, accepted := range []string{
		"https://resofeed.tefx.one",
		"HTTPS://Example.COM:00443/",
		"http://localhost:08080/",
		"http://127.0.0.1:08080/",
		"http://[2001:0DB8::1]:08080/",
		"https://xn--bcher-kva.example/",
	} {
		if err := validatePublicURL(accepted); err != nil {
			*gaps = append(*gaps, fmt.Sprintf("accepted --public-url %q rejected: %v", accepted, err))
		}
	}
	for _, invalid := range []string{
		"https://user:pass@example.com",
		"ftp://example.com",
		"https://0.0.0.0",
		"http://[::]",
		"https://例え.test",
		"https://example.com.",
		"https://01.2.3.4",
		"https://999.2.3.4",
		"http://[fe80::1%25lo0]",
		"https://example.com/path",
		"https://example.com/?q=secret",
		"https://example.com/#fragment",
		" https://example.com",
	} {
		if validatePublicURL(invalid) == nil {
			*gaps = append(*gaps, fmt.Sprintf("excluded --public-url %q was accepted", invalid))
		}
	}
	if actual := normalizePublicURLForMetadata("HTTPS://Example.COM:00443/"); actual != "https://example.com" {
		*gaps = append(*gaps, fmt.Sprintf("effective normalized MCPConfig.PublicURL=%q want=%q", actual, "https://example.com"))
	}
}

func itemDeepLinkAppPath(t *testing.T, itemID string) string {
	t.Helper()
	path, err := itemDeepLinkAppPathChecked(itemID)
	if err != nil {
		t.Fatalf("encode fixture item application path %q: %v", itemID, err)
	}
	return path
}

func itemDeepLinkAppPathValue(itemID string) string {
	path, err := itemDeepLinkAppPathChecked(itemID)
	if err != nil {
		return ""
	}
	return path
}

func itemDeepLinkAppPathChecked(itemID string) (string, error) {
	if itemID == "" || !utf8.ValidString(itemID) {
		return "", fmt.Errorf("item ID is outside the application-route domain")
	}
	for _, value := range itemID {
		if unicode.Is(unicode.Cc, value) {
			return "", fmt.Errorf("item ID contains a control code point")
		}
	}
	if itemID == "." {
		return "/items/!.", nil
	}
	if itemID == ".." {
		return "/items/!..", nil
	}
	const hexadecimal = "0123456789ABCDEF"
	encoded := strings.Builder{}
	for index, value := range []byte(itemID) {
		unreserved := value >= 'A' && value <= 'Z' || value >= 'a' && value <= 'z' || value >= '0' && value <= '9' || value == '-' || value == '.' || value == '_' || value == '~'
		if unreserved && !(index == 0 && value == '~') {
			encoded.WriteByte(value)
			continue
		}
		encoded.WriteByte('%')
		encoded.WriteByte(hexadecimal[value>>4])
		encoded.WriteByte(hexadecimal[value&0x0f])
	}
	return "/items/" + encoded.String(), nil
}
