package resofeed

import (
	"context"
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
)

func TestICAMCPNoIngestFetchTriggerToolsStaticAndRuntimeInventory(t *testing.T) {
	// Contract sources:
	// - docs/INGEST_CONCURRENCY_ACCELERATION_PLAN.md transport_boundary_rules:
	//   HTTP owns manual ingest/fetch triggers; MCP mirrors existing semantics only.
	// - docs/ARCHITECTURE.md §7 MCP Surface and Processing Language MCP Parity:
	//   MCP-visible runtime operations are product parity for resources/language/reprocess/reingest,
	//   not new agent-only ingest/fetch trigger operations.
	// - docs/contracts/INGEST_CONCURRENCY_CONTRACT_TRACEABILITY_LOCK.md ICA-R12.
	allowedTools := map[string]struct{}{
		"list_candidate_items":    {},
		"search_items":            {},
		"read_item":               {},
		"mark_inspected":          {},
		"resonate_item":           {},
		"preview_steer":           {},
		"steer":                   {},
		"undo_steer":              {},
		"report_delivery":         {},
		"get_processing_language": {},
		"set_processing_language": {},
		"reprocess_library":       {},
		"reingest_item":           {},
		"list_openrouter_models":  {},
	}
	forbiddenTools := map[string]struct{}{
		"ingest":              {},
		"ingest_once":         {},
		"manual_ingest":       {},
		"run_ingest":          {},
		"fetch":               {},
		"fetch_source":        {},
		"manual_fetch":        {},
		"manual_source_fetch": {},
		"source_fetch":        {},
	}

	runtimeNames := map[string]struct{}{}
	for _, tool := range mcpToolList() {
		name, ok := tool["name"].(string)
		if !ok || strings.TrimSpace(name) == "" {
			t.Fatalf("MCP tool entry has invalid name: %#v", tool)
		}
		runtimeNames[name] = struct{}{}
	}
	assertToolSetEquals(t, "mcpToolList", runtimeNames, allowedTools)
	assertNoForbiddenMCPTools(t, "mcpToolList", runtimeNames, forbiddenTools)

	dispatchNames := mcpCallToolDispatchNames(t)
	assertToolSetEquals(t, "mcpHandler.callTool dispatch", dispatchNames, allowedTools)
	assertNoForbiddenMCPTools(t, "mcpHandler.callTool dispatch", dispatchNames, forbiddenTools)
}

func TestICAMCPRuntimeResourcesRemainParityOnlyNoIngestFetchResources(t *testing.T) {
	allowedResources := map[string]struct{}{
		"resofeed://feed/today":        {},
		"resofeed://rules/active":      {},
		"resofeed://system/doctor":     {},
		RuntimeOperationMCPResourceURI: {},
		"resofeed://sources":           {},
		RuntimeLanguageMCPResourceURI:  {},
	}
	forbiddenFragments := []string{"ingest", "fetch", "manual_ingest", "source_fetch", "state_import", "state_restore"}

	got := map[string]struct{}{}
	for _, resource := range mcpResourceList() {
		uri := resource["uri"]
		if strings.TrimSpace(uri) == "" {
			t.Fatalf("MCP resource entry has invalid uri: %#v", resource)
		}
		got[uri] = struct{}{}
		if _, ok := allowedResources[uri]; !ok {
			t.Fatalf("unexpected MCP resource uri %q; allowed parity resources=%v", uri, sortedKeys(allowedResources))
		}
		for _, fragment := range forbiddenFragments {
			if strings.Contains(uri, fragment) {
				t.Fatalf("MCP resource uri %q contains forbidden operation fragment %q", uri, fragment)
			}
		}
	}
	assertToolSetEquals(t, "mcpResourceList", got, allowedResources)
}

func TestICAMCPStateImportGuardUsesExistingConflictWithoutCurrentOperationKind(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)
	handler := NewMCPHandler(MCPConfig{DB: db, OwnerToken: contractOwnerToken})

	release, err := tryAcquireIngestGuardWithActor(ctx, "state_import", "restore", "")
	if err != nil {
		t.Fatalf("hold short state import guard: %v", err)
	}
	t.Cleanup(release)

	operationText := mcpResourceText(t, handler, RuntimeOperationMCPResourceURI)
	if strings.Contains(operationText, "state_import") || strings.Contains(operationText, "state_restore") {
		t.Fatalf("MCP current-operation resource leaked unrepresented state operation kind: %s", operationText)
	}
	operation := decodeCurrentOperationEnvelope(t, []byte(operationText))
	if operation["running"] != false || operation["kind"] != nil || operation["actor_kind"] != nil {
		t.Fatalf("MCP current-operation resource while state import guard held = %#v, want idle/null parity snapshot", operation)
	}

	resp := mcpCall(t, handler, "set_processing_language", map[string]any{"language": "zh", "actor_id": "briefing-agent", "idempotency_key": "ica-mcp-language-during-state-import"})
	if resp.Error == nil {
		t.Fatalf("set_processing_language during state import guard succeeded; want MCP conflict")
	}
	if resp.Error.Code != -32000 || resp.Error.Message != "operation already running" {
		t.Fatalf("MCP state-import guard error = %+v, want JSON-RPC conflict", resp.Error)
	}
	data, err := json.Marshal(resp.Error.Data)
	if err != nil {
		t.Fatalf("marshal MCP conflict data: %v", err)
	}
	if strings.Contains(string(data), "state_import") || strings.Contains(string(data), "state_restore") {
		t.Fatalf("MCP conflict leaked forbidden state operation kind: %s", string(data))
	}
	inner, ok := resp.Error.Data["error"].(map[string]any)
	if !ok {
		t.Fatalf("MCP conflict data = %#v, want nested error object", resp.Error.Data)
	}
	if inner["code"] != "conflict" {
		t.Fatalf("MCP nested conflict code = %#v, want conflict", inner["code"])
	}
	details, ok := inner["details"].(map[string]any)
	if !ok {
		t.Fatalf("MCP conflict details = %#v, want object", inner["details"])
	}
	if details["reason"] != ingestConflictReasonGlobalOperationRunning {
		t.Fatalf("MCP conflict reason = %#v, want %q; details=%#v", details["reason"], ingestConflictReasonGlobalOperationRunning, details)
	}
	for _, field := range []string{"operation", "actor_kind", "current_operation"} {
		if value, ok := details[field]; ok && value != nil {
			t.Fatalf("MCP conflict details[%s] = %#v, want null/absent for unrepresented state import guard; details=%#v", field, value, details)
		}
	}
}

func assertToolSetEquals(t *testing.T, label string, got map[string]struct{}, want map[string]struct{}) {
	t.Helper()
	for name := range got {
		if _, ok := want[name]; !ok {
			t.Fatalf("%s exposes unexpected MCP name %q; got=%v want=%v", label, name, sortedKeys(got), sortedKeys(want))
		}
	}
	for name := range want {
		if _, ok := got[name]; !ok {
			t.Fatalf("%s missing MCP name %q; got=%v want=%v", label, name, sortedKeys(got), sortedKeys(want))
		}
	}
}

func assertNoForbiddenMCPTools(t *testing.T, label string, got map[string]struct{}, forbidden map[string]struct{}) {
	t.Helper()
	for name := range got {
		if _, ok := forbidden[name]; ok {
			t.Fatalf("%s exposes forbidden MCP ingest/fetch trigger tool %q", label, name)
		}
	}
}

func mcpCallToolDispatchNames(t *testing.T) map[string]struct{} {
	t.Helper()
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate current test file")
	}
	mcpPath := filepath.Join(filepath.Dir(currentFile), "mcp.go")
	fileSet := token.NewFileSet()
	parsed, err := parser.ParseFile(fileSet, mcpPath, nil, 0)
	if err != nil {
		t.Fatalf("parse mcp.go: %v", err)
	}
	cases := map[string]struct{}{}
	var found bool
	for _, decl := range parsed.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Name.Name != "callTool" || fn.Recv == nil {
			continue
		}
		found = true
		ast.Inspect(fn.Body, func(node ast.Node) bool {
			switchStmt, ok := node.(*ast.SwitchStmt)
			if !ok {
				return true
			}
			for _, stmt := range switchStmt.Body.List {
				caseClause, ok := stmt.(*ast.CaseClause)
				if !ok || len(caseClause.List) == 0 {
					continue
				}
				for _, expr := range caseClause.List {
					literal, ok := expr.(*ast.BasicLit)
					if !ok || literal.Kind != token.STRING {
						continue
					}
					var name string
					if err := json.Unmarshal([]byte(literal.Value), &name); err != nil {
						t.Fatalf("decode callTool case literal %s: %v", literal.Value, err)
					}
					cases[name] = struct{}{}
				}
			}
			return false
		})
	}
	if !found {
		t.Fatal("mcpHandler.callTool not found in mcp.go")
	}
	return cases
}

func sortedKeys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
