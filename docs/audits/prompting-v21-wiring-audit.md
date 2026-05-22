# prompting-v21-wiring-audit

**Normalized status:** PASS
**Verdict:** PASS
**Action hint:** COMPLETE
**Scope:** Static wiring audit only; no app or test execution.
**Proof-gap status:** NON_BLOCKING — runtime route/tool reachability is closed by the committed liveness probe; external-provider prompt-generation execution remains non-intersecting in that probe because no OpenRouter key was present, while the production compiler call path is statically traced to the concrete OpenRouter client.

## refs Read Confirmation

- `docs/ARCHITECTURE.md` — Decisions require one deployable Go process, thin HTTP/MCP transports calling the same product operations, OpenRouter as the sole LLM backend, and the v2.1 prompt compiler instead of ad hoc summarization prompt assembly. Relevant passages: lines 1-15 decisions; line 101 model-list secret exception; lines 385-386 documented v2.1 HTTP routes; lines 747-763 Prompting System v2.1 binding; lines 1016-1099 selected-item re-ingest; lines 1719-1723 and 1881-1883 route table; lines 2057-2067 MCP `list_openrouter_models`/`reingest_item` parity; lines 2319-2328 verification additions.
- `docs/PROMPTING_SYSTEM.md` — Design goals require provider-enforced structured output when available, Go validation authoritative, one-time Inspector prompts bounded by schema/source/language/safety, and adoption only when runtime paths emit `schema_version: "resofeed.summarize.v2.1"`, use the v2.1 payload, route structured output, and validate before persistence. Relevant passages: Design Goals; Versioned JSON User Payload; OpenRouter Constraint Strategy; Runtime Status Boundary; v2.1 Adoption and Migration Note.
- `CONSTITUTION.md` — not present in isolated worktree (`glob CONSTITUTION.md` returned no files).

## Protocol checklist table

| Protocol | Result | Evidence summary |
|---|---|---|
| W13 Entry-to-Effect Trace | PASS | `cmd/resofeed/main.go:12-13` -> `Main` -> `runServe` -> `ServeHTTPAndIngestRuntime` -> `NewRouter` -> `http.Server.Serve`; `/api/*` and `/mcp` bind to real HTTP I/O. |
| W1 Dead Export Scan | PASS | Public v2.1 DTOs and functions have runtime callers outside tests: `OpenRouterModelsResponse`, `ItemReingestRequest/Response`, `MCPReingestItemInput`, `ListOpenRouterModels`, `ReingestItem`. |
| W2 Schema Field Trace | PASS | `model`, `prompt`, `extra_prompt`, `models[].id/name`, and reingest result fields are read/written through HTTP/MCP/app response paths; no assigned v2.1 field is write-only. |
| W3 CLI Param E2E Coverage | PASS | `--openrouter-model`/runtime key flow into `NewOpenRouterClient` and `HTTPServerConfig.OpenRouter`; request-scoped reingest `model` remains transport body, not CLI. Static proof only. |
| W4 CLI Command Registration | PASS | `resofeed serve` is registered in `Main`; server starts HTTP/MCP/background ingest in one process. |
| W5 Contract Strength Scan | PASS | No Go `@pre/@post` contracts found in assigned surface; runtime validation is concrete (`DisallowUnknownFields`, model/prompt validation, strict summary validation). |
| W6 Config Field Consumption | PASS | `OpenRouterConfig.APIKey/Model/Endpoint` consumed by model list and summarization; `FirstFetchMaxItems` propagated to HTTP/MCP/ingest. |
| W7 Escape Hatch Concentration | PASS_WITH_DEBT | No `@invar:allow`, `_Stub`, `_Placeholder`, or TODO production stubs found. Two stale "contract-only declaration" comments remain on implemented functions; non-blocking documentation debt. |
| W8 Dependency-Import Alignment | PASS | Feature uses stdlib HTTP/JSON and declared sqlite dependency; no undeclared third-party feature imports identified in production v2.1 paths. |
| W8b Undeclared Import Dependencies | PASS | `go.mod` declares `modernc.org/sqlite`; production v2.1 path imports are stdlib plus internal package. |
| W9 Transitive Entry-Point Reachability | PASS | Routes/tools are reachable from `cmd/resofeed` -> `Main` -> `runServe` -> `ServeHTTPAndIngestRuntime` -> router/handler dispatch, not merely unit-level handlers. |
| W10 Protocol Shadow Detection | PASS | MCP and HTTP both call shared app functions; no production `_Stub*`/`_Placeholder*`/shadow implementation for assigned feature. |
| W11 Type Cast Authenticity | PASS | No casts/type ignores laundering stubs into protocols found in Go surface; LLM boundary is explicit `LLMClient`. |
| W12 Frontend Route-Render Integrity | N/A | Assigned audit is backend HTTP/MCP/prompt compiler. Frontend route-render not inspected beyond documented API expectations. |

## W13 Entry-to-Effect Trace (first)

### Server runtime chain

```text
cmd/resofeed/main.go:12-13 main() calls resofeed.Main(os.Args[1:], ...)
internal/resofeed/db.go:37-68 Main registers "serve" and calls runServe(cfg,...)
internal/resofeed/db.go:353-365 runServe constructs NewOpenRouterClient when key exists, builds HTTPServerConfig, then calls ServeHTTPAndIngestRuntime(... RunIngestLoop ...)
internal/resofeed/http.go:104-109 ServeHTTPAndIngestRuntime creates a real net.Listener and delegates to serveHTTPAndIngestRuntimeOnListener
internal/resofeed/http.go:152-158 serveHTTPRuntimeOnListener creates http.Server{Handler: NewRouter(cfg)} and calls server.Serve(listener)
internal/resofeed/http.go:59-65 NewRouter mounts /api/ to apiHandler and /mcp to NewMCPHandler
```

**Classification:** wired. W13 lifecycle `serve/listen` path reaches real `net.Listen`/`http.Server.Serve` I/O; background ingest also starts after readiness (`http.go:124-133`).

### Runtime liveness closure imported from committed probe

The prior runtime-test rows are closed by the committed black-box artifact `docs/audits/prompting-v21-runtime-liveness-probe.md`:

```text
docs/audits/prompting-v21-runtime-liveness-probe.md:70-77: HTTP_BOUND True and lsof shows resofeed listening on 127.0.0.1:18180.
docs/audits/prompting-v21-runtime-liveness-probe.md:81-101: startup log shows ui: mounted, api: enabled, mcp: /mcp, ingest: started, openrouter-key: unavailable.
docs/audits/prompting-v21-runtime-liveness-probe.md:124-157: authenticated GET /api/runtime/openrouter-models and /api/runtime/openrouter/models return 200 {"models":[]}; query returns 400 bad_request.
docs/audits/prompting-v21-runtime-liveness-probe.md:197-208: public HTTP POST /api/items/{id}/reingest with model/prompt returns 200, completed_with_errors, item_updated:true, fts_updated:true, no prompt/secret echo.
docs/audits/prompting-v21-runtime-liveness-probe.md:223-255: real /mcp tools/list exposes reingest_item/list_openrouter_models and tools/call for both succeeds through the running endpoint.
docs/audits/prompting-v21-runtime-liveness-probe.md:258-266: liveness Behavioral Proof Register marks one-binary startup, HTTP model routes, HTTP reingest, MCP tools, and secret non-leakage PROVEN.
```

**Runtime route/tool classification:** wired. The liveness probe did not have an OpenRouter key, so provider-backed summary generation was intentionally not executed; this is a documented non-intersection for external-provider behavior, not a route/tool reachability gap. The production prompt compiler path remains statically proven below from `runServe` -> `NewOpenRouterClient` -> `SummarizeItem` -> `compilePromptingV21SummaryPrompt`, and the missing-key runtime path is closed by safe unavailable behavior.

## Route registrations

```text
internal/resofeed/http.go:59-65 NewRouter: mux.Handle("/api/", api); mux.Handle("/mcp", NewMCPHandler(...))
internal/resofeed/http.go:239-243 apiHandler.ServeHTTP rejects missing/invalid owner token before route dispatch
internal/resofeed/http.go:260-264 GET /api/runtime/openrouter-models and /api/runtime/openrouter/models reject query then call handleOpenRouterModels
internal/resofeed/http.go:450-465 handleOpenRouterModels resolves request-time OpenRouter config, returns [] on missing key, calls ListOpenRouterModels, maps failures to 503 provider_unavailable
internal/resofeed/openrouter.go:103-147 ListOpenRouterModels fetches OpenRouter /api/v1/models, decodes data, returns {models:[{id,name}]}
internal/resofeed/http.go:325-329 all /api/items/* paths reject query then call handleItemPath
internal/resofeed/http.go:560-575 POST /api/items/{id}/reingest reads/validates body, calls ReingestItem, maps guard conflict and item errors
internal/resofeed/http.go:632-653 readItemReingestRequest admits model/prompt/extra_prompt plus mutation fields and normalizes through itemReingestRequestFromInputs
internal/resofeed/http.go:1078-1100 readJSONBodyLimit requires application/json, body limit, DisallowUnknownFields, and rejects trailing JSON
internal/resofeed/http.go:1118-1131 validateMutationFields enforces actor_kind, actor_id, idempotency_key
internal/resofeed/reprocess.go:53-85 ReingestItem validates item id and request, acquires item_reingest guard, records idempotency receipt, calls reingestItemUnlocked
internal/resofeed/reprocess.go:195-240 reingestItemUnlocked reads processing language, loads selected item, calls processReprocessItemWithRequest, stores item/FTS and returns ItemReingestResponse
```

**HTTP route status:** wired and auth-protected. Query validation is present for all three documented routes. Body validation is strict for `POST /api/items/{id}/reingest`.

## MCP tool registrations

```text
internal/resofeed/http.go:59-65 /mcp is mounted by NewRouter on the same runtime server as /api
internal/resofeed/mcp.go:411-419 mcpHandler.ServeHTTP rejects missing/invalid bearer token before JSON-RPC dispatch and requires POST
internal/resofeed/mcp.go:450-463 dispatch registers tools/list and tools/call
internal/resofeed/mcp.go:855-871 tools/list includes reingest_item with item_id/actor_id/idempotency_key/model/prompt/extra_prompt schema and list_openrouter_models with empty schema
internal/resofeed/mcp.go:629-640 tools/call dispatches reingest_item -> ReingestItemForMCP and list_openrouter_models -> ListOpenRouterModelsForMCP
internal/resofeed/reprocess.go:88-96 ReingestItemForMCP normalizes MCP schema and calls shared ReingestItem
internal/resofeed/mcp.go:654-672 ListOpenRouterModelsForMCP resolves request-time key, returns [] when absent, calls shared ListOpenRouterModels, maps provider failure
```

**MCP tool status:** wired. `reingest_item` uses the shared application operation required by architecture. `list_openrouter_models` uses the same provider function as HTTP after MCP-specific empty-key/error mapping.

## Prompt compiler call graph

```text
cmd/resofeed/main.go:12-13 -> internal/resofeed/db.go:32-68 Main("serve") -> db.go:324-365 runServe -> NewOpenRouterClient(OpenRouterConfig{...}) assigned to llm and passed to HTTPServerConfig and IngestConfig
internal/resofeed/openrouter.go:202-235 (*openRouterHTTPClient).SummarizeItem calls compilePromptingV21SummaryPrompt(input), then generateSummaryJSON(compiled,...), then validateSummaryOutputForPersistenceWithPrompt(... compiled.UserPayload.Item)
internal/resofeed/openrouter.go:752-786 compilePromptingV21SummaryPrompt emits schema_version=resofeed.summarize.v2.1, task=summarize_rss_item, documented contract/profile/guidance/item payload
internal/resofeed/openrouter.go:905-948 generateSummaryJSON sends system+user messages, probes selectedModelSupportsJSONSchema, uses json_schema+provider.require_parameters when supported, downgrades once to json_object only on schema-mode unsupported, otherwise json_object fallback
internal/resofeed/ingest.go:589-630 buildItem constructs OpenRouterSummaryInput and calls llm.SummarizeItem for normal ingest; in serve runtime llm is NewOpenRouterClient, so prompt construction flows through compilePromptingV21SummaryPrompt
internal/resofeed/reprocess.go:341-373 reprocessLibraryUnlocked iterates library items and calls processReprocessItem
internal/resofeed/reprocess.go:491-492 processReprocessItem delegates to processReprocessItemWithRequest with empty ItemReingestRequest
internal/resofeed/reprocess.go:259-302 processReprocessItemWithRequest builds OpenRouterSummaryInput, applies request-scoped model/prompt, compiles v2.1 prompt context, calls llm.SummarizeItem, then validates output with compiled.UserPayload.Item
internal/resofeed/reprocess.go:195-205 reingestItemUnlocked calls processReprocessItemWithRequest for selected item re-ingest
```

**Prompt compiler status:** wired for runtime OpenRouter summarization and for reprocess/reingest validation context. The only `json_object`-only helper found is `openrouter.go:543-642 generateJSON`, called only by `TranslateSteering` at `openrouter.go:515-529`, so it is non-intersecting with v2.1 summarization.

## W1-W12 Findings

### W1 Dead Export Scan

- `OpenRouterModelInfo`/`OpenRouterModelsResponse` (`types.go:180-193`) are returned by HTTP (`http.go:453-464`), MCP (`mcp.go:654-672`), and provider function (`openrouter.go:103-147`). **Wired.**
- `ItemReingestRequest`/`ItemReingestResponse`/`MCPReingestItemInput` (`types.go:195-237`) flow through HTTP body parsing (`http.go:632-653`), MCP dispatch (`mcp.go:629-633`), app operation (`reprocess.go:53-95`), and response construction (`reprocess.go:212-240`). **Wired.**

### W2 Schema Field Trace

- `model`: HTTP/MCP body -> `itemReingestRequestFromInputs` (`reprocess.go:98-113`) -> `validateItemReingestRequest` (`116-131`) -> `processReprocessItemWithRequest` (`274-283`) -> `OpenRouterSummaryInput.Model` -> compiler `compiled.Model` (`openrouter.go:763-766`) -> request model override (`openrouter.go:927-932`). **Read/write wired; request-scoped only.**
- `prompt`/`extra_prompt`: HTTP/MCP body -> normalization/conflict check (`reprocess.go:98-113`, `134-150`) -> `OpenRouterSummaryInput.Prompt` (`282-283`) -> compiler `Guidance.OneTimePrompt` (`openrouter.go:762-773`). **Read/write wired; request-scoped only.**
- `models[].id/name`: provider metadata decoded (`openrouter.go:133-145`) -> response body (`http.go:456-464`, `mcp.go:665-672`). **Wired.**

### W3/W4 CLI and route registration

- `Main` registers `serve` (`db.go:37-68`) and `owner-token` only. `serve` constructs runtime config and starts HTTP/MCP/background ingest in one process (`db.go:353-365`). **Wired.**
- OpenRouter model flag/key config is consumed by `NewOpenRouterClient` and `HTTPServerConfig.OpenRouter` (`db.go:353-357`). **Wired.**

### W5 Contract strength

- Static search found no `@pre`/`@post` contracts in assigned Go code. Runtime contracts are concrete validation code: strict JSON decode (`http.go:1078-1100`, `mcp.go:819-828`), model/prompt normalization (`reprocess.go:98-171`), strict prompt output decoding (`openrouter.go:659-690`), semantic validation (`openrouter.go:241-289`). **No vacuous contract issue found.**

### W6 Config field consumption

- `OpenRouterConfig.APIKey` is read by model listing (`openrouter.go:107-120`) and summarization client (`openrouter.go:909-910`, `1036-1037`).
- `OpenRouterConfig.Model` flows from CLI (`db.go:353-357`) into `openRouterHTTPClient.model` (`openrouter.go:83-96`) and request model (`openrouter.go:927-932`).
- `OpenRouterConfig.Endpoint` is used for model and chat URLs (`openrouter.go:111-159`, `1161-1167`), with deterministic test endpoint override only when configured (`http.go:467-480`, `mcp.go:654-664`). **Wired.**

### W7 Escape hatch/stub concentration

```text
Search pattern: _Runtime|_Stub|_Placeholder|TODO|panic\("TODO|return nil, nil|contract-only declaration
Matches in assigned feature:
- internal/resofeed/openrouter.go:99 comment says "contract-only declaration" on implemented ListOpenRouterModels.
- internal/resofeed/reprocess.go:48 comment says "contract-only declaration" on implemented ReingestItem.
- internal/resofeed/reprocess.go:136/140 return nil,nil are normal optional prompt normalization branches.
```

**Classification:** no production stub/placeholder/TODO blocker. Stale "contract-only declaration" comments are documentation debt because both functions are now implemented and wired.

### W8/W8b Dependency import alignment

- `go.mod` declares `modernc.org/sqlite v1.34.5`; production v2.1 feature paths use stdlib HTTP/JSON/context/sql plus internal package code. No undeclared feature dependency found.

### W9 Transitive entry-point reachability

- HTTP and MCP paths traced from `cmd/resofeed/main.go` through `Main`, `runServe`, `ServeHTTPAndIngestRuntime`, `NewRouter`, handler dispatch, app functions, DB/provider I/O, and return bodies. **Wired.**

### W10 Protocol shadow detection

- `ReingestItemForMCP` delegates to `ReingestItem` (`reprocess.go:88-95`) and HTTP delegates to the same `ReingestItem` (`http.go:560-565`).
- `ListOpenRouterModelsForMCP` and HTTP `handleOpenRouterModels` both call `ListOpenRouterModels` (`mcp.go:654-672`, `http.go:450-465`).
- No production `_Stub*`/`_Placeholder*` implementations found for assigned paths. **Wired.**

### W11 Type cast authenticity

- No casts/type ignores in Go assigned paths. LLM boundary is explicit `LLMClient` (`openrouter.go:66-71`), and serve runtime supplies the concrete OpenRouter client when a key is configured (`db.go:353-357`). **No laundering found.**

### W12 Frontend route-render integrity

- Not applicable to assigned backend wiring artifact. API routes expected by frontend are registered; no frontend route-render audit was performed.

## Orphan / stale / stub checks

```text
No CONSTITUTION.md: glob returned no files.
No assigned production _Stub/_Placeholder/TODO/panic("TODO") hits.
No @pre/@post hits in assigned Go surface.
No @invar:allow hits in assigned Go surface.
No stale summarization json_object-only bypass: json_object-only generateJSON is only used by TranslateSteering, not SummarizeItem; SummarizeItem uses generateSummaryJSON with v2.1 compiler and schema routing.
Non-blocking stale comments: openrouter.go:99 and reprocess.go:48 still say "contract-only declaration" despite live implementations.
```

## Findings register

| ID | Severity | Classification | Evidence | Call chain | Impact | Verification suggestion |
|---|---|---|---|---|---|---|
| F-001 | Info | Documentation debt | `openrouter.go:99`, `reprocess.go:48` comments say "contract-only declaration" on implemented functions | N/A comments only | Could confuse future audits into suspecting stubs, but runtime code is wired. | Optional comment cleanup in a non-audit code/doc step. |

## Uncertainty register

| Item | Status | Rationale | Smallest check to close |
|---|---|---|---|
| Runtime route/tool behavior | PROVEN | Closed by committed liveness probe: running binary bound a port, served both model-list routes, rejected query params, accepted HTTP reingest with prompt/model, exposed MCP tools/list, and executed MCP tools/call for list_openrouter_models and reingest_item. | n/a |
| External-provider prompt generation | NON_BLOCKING_NON_INTERSECTING | Liveness probe had no OpenRouter key, so provider generation was not expected to run. Static production path proves `serve` wires `NewOpenRouterClient` and `SummarizeItem` compiles v2.1 before generation. | Optional live-key smoke can prove provider accepts schema routing, but absence of key is documented safe unavailable behavior and not a wiring blocker. |

## Behavioral Proof Register

| Behavior | Proof status | Evidence |
|---|---|---|
| HTTP route registration and auth protection | PROVEN | Static chain from `cmd/resofeed` to `http.Server.Serve` plus liveness probe lines 124-157 proving both model routes and query rejection through the running server; liveness lines 197-208 prove HTTP reingest route execution. |
| MCP tool registration and auth protection | PROVEN | Static chain `/mcp` -> `NewMCPHandler` -> `mcpHandler.authorized` -> `tools/list`/`tools/call` plus liveness probe lines 223-255 proving real endpoint tools/list and tools/call. |
| Shared app operation for `reingest_item` and HTTP reingest | PROVEN_STATIC | HTTP and MCP both delegate to `ReingestItem`. |
| Shared provider operation for OpenRouter model listing | PROVEN_STATIC | HTTP and MCP both call `ListOpenRouterModels` after request-time secret resolution. |
| Prompt compiler v2.1 in runtime summarization | PROVEN_STATIC_WITH_RUNTIME_NONINTERSECTION | Concrete OpenRouter `SummarizeItem` calls compiler and runtime `serve` wires `NewOpenRouterClient`; liveness probe lines 18-19/98-100 prove no OpenRouter key was present, so provider generation was a documented unavailable path rather than an untested reachable branch. |
| No production stubs/placeholders/TODO for assigned feature | PROVEN_STATIC | Targeted grep found no production `_Stub/_Placeholder/TODO`; stale comments only. |

## Recommended verification checks

- Runtime route/tool smoke: closed by `docs/audits/prompting-v21-runtime-liveness-probe.md` lines 70-77, 124-157, 197-208, 223-266.
- Optional live-key smoke: with a real `OPENROUTER_KEY`, capture one provider-backed summary request to prove external schema routing against OpenRouter; non-blocking because missing-key provider-unavailable behavior is documented and already runtime-proven.
- Optional cleanup: update stale "contract-only declaration" comments on `ListOpenRouterModels` and `ReingestItem`.

## Verdict alignment

**Headline:** PASS
**Proof-Gap Status:** NON_BLOCKING — runtime route/tool reachability closed by committed liveness probe; external provider summary generation non-intersecting in no-key liveness environment
**Blocking Status:** CLOSED
**Gate open allowed:** true
**Orchestrator action hint:** COMPLETE
