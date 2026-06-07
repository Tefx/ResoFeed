# Tavily External Extraction Plan

Status: Proposed for implementation
Scope: Optional Tavily-backed source-text recovery for ResoFeed ingestion, item re-ingest, and library reprocess.
Authority: `docs/ARCHITECTURE.md`, `docs/PRD.md`, `docs/DESIGN.md`

## Original Problem

Some public articles, especially JavaScript-heavy or login-shell pages, return little or no useful article text through ResoFeed's local HTTP/readable extraction path. The observed X/Twitter article failure was classified as `original_unavailable`, while Tavily Extract could recover usable source text. The goal is not an X-only patch; the goal is a complete, general external source-text fallback that preserves ResoFeed's single-binary architecture and multilingual content contract.

## Architecture Basis

### system_layers

- **Static UI (`web/`)**: renders source-depth/source-origin status and collapsed source-backed text evidence. It never receives provider secrets or provider configuration.
- **Runtime shell (`cmd/resofeed`)**: resolves runtime secrets and wires optional Tavily extraction into the single Go process. No CLI secret flags.
- **Product core (`internal/resofeed`)**: owns extraction ordering, sanitation, source evidence selection, multilingual item processing, Doctor counts, HTTP/MCP parity, and SQLite writes.
- **Persistence (SQLite + FTS5)**: stores current item evidence status/origin, source-backed evidence when retained, generated content, attempt diagnostics, and FTS rows. It does not store secrets or provider history.
- **External IO**: RSS/Atom, ordinary article HTTP, Tavily Extract for source evidence recovery, and OpenRouter for structured target-language item understanding.

### source_of_truth_matrix

| State | Source of truth | Portable? | Notes |
|---|---|---:|---|
| Source subscriptions | `sources` | yes | Existing Source Ledger contract. |
| Current item evidence depth | `items.extraction_status` | no | `full`, `partial_extraction`, `original_unavailable`, etc. |
| Current item evidence origin | `items.extraction_source` | no | `local_readable`, `feed_excerpt`, `external_tavily`, `none`. |
| Current source-backed evidence text | `items.source_evidence_text` | no | Inspector Text evidence source; never processed `feed_excerpt`, generated summary/core/key-points text, and never a history ledger. |
| Generated target-language content | `items` generated columns, including `extracted_text` when present | no | OpenRouter output validated by Go; `extracted_text` is generated representative text, not raw source evidence. |
| Latest attempt diagnostics | `last_reprocess_*` and existing status fields | no | Current diagnostics only, not history. |
| Provider secrets | OS env / local `.env` only | no | Never stored, exported, logged, or rendered. |
| FTS | `search_fts` | no | Derived from item rows after successful processing/reprocess. |

### service_catalog
N/A: no services are introduced. Tavily implementation must remain direct helper/function work inside `internal/resofeed`, not a service layer, registry, DI provider, or plugin catalog. Concrete file ownership is listed only under `module_split_recommendations`.

### runtime_contract

- Runtime remains one `resofeed serve` process.
- Tavily is enabled by `TAVILY_API_KEY` from OS env or local `.env`.
- There is no Tavily CLI key flag, settings page, provider dashboard, sidecar, worker process, job table, or durable queue.
- When `TAVILY_API_KEY` is configured, Tavily is attempted once when prior evidence steps fail to produce usable source evidence for an eligible URL.
- Tavily may be attempted for any eligible HTTP(S) item URL, not only X/Twitter.
- Each Tavily call obeys request cancellation and the 30-second Tavily timeout. MCP library reprocess admission semantics remain as already defined for long-running reprocess: admitted backend work must not be canceled merely because an MCP client times out.
- Provider failures are mapped only to safe current diagnostics: `timeout`, `provider_unavailable`, or `unusable_evidence`.
- HTTP and MCP item responses expose `extraction_source`; item details expose nullable `source_evidence_text` when source-backed text is retained.

### tavily_call_contract

- **Eligibility**: only absolute `http`/`https` item URLs are eligible. Reject empty host, credentials in URL, unsupported schemes, non-URL strings, `localhost`, `.localhost`, and IPv4/IPv6 loopback/private/link-local/multicast/unspecified/unique-local IP literals. ResoFeed does not perform DNS resolution or redirect preflight before Tavily in the first implementation.
- **Request URL selection**: send the selected original article URL. Normal ingest/manual fetch uses the item URL being processed. Reprocess/re-ingest uses `items.canonical_url` when valid, then `items.url`; never use `sources.url`, `items.source_url`, RSS/Atom feed URLs, or generated fields. Tavily-reported final URLs, if any, are diagnostics only and must not rewrite provenance unless existing canonical-url logic already permits it.
- **Normal path**: URL-based Tavily Extract only. Do not use Tavily Search as the normal extraction path and do not discover alternate sources unless a later product decision adds that scope.
- **Request shape**: `POST https://api.tavily.com/extract` with `Authorization: Bearer <TAVILY_API_KEY>` and JSON body `{ "urls": ["<item-url>"], "extract_depth": "advanced", "format": "markdown", "include_images": false, "timeout": 30 }`. Do not ask Tavily to summarize, translate, rank, or classify the item.
- **Response parsing**: parse `results[0].raw_content` for the single requested URL. Treat missing result, non-empty `failed_results` without a usable result, malformed JSON, or unreadable body as provider unavailable.
- **Timeout**: 30 seconds per Tavily call.
- **Retry**: no automatic retry in the first implementation. Explicit item re-ingest or library reprocess may attempt again as a new owner/agent action.
- **Output size**: reject provider response bodies larger than 1 MiB before sanitation; reject cleaned evidence that remains low-information after sanitation.
- **Safe diagnostics**: use only internal `timeout`, `provider_unavailable`, and `unusable_evidence` for Tavily source-acquisition failure. Public item/reprocess surfaces map these to existing schema values: `timeout`, `provider_error`, or `original_unavailable`. Do not add a user-facing Tavily state machine, retry taxonomy, or history table.
- **Persistence**: persist only current source provenance/evidence where needed (`extraction_source`, `source_evidence_text`, existing attempt diagnostics). Never persist raw provider JSON, request headers, provider account data, or provider history. `feed_excerpt` is processed/display text and is not reused as source evidence after the migration; new RSS source evidence is copied to `source_evidence_text` when selected. Legacy rows are not backfilled from ambiguous `feed_excerpt` or generated `extracted_text`.
- **Usable evidence gate**: after sanitation, external text must have at least 500 non-whitespace characters and at least three non-boilerplate sentence/paragraph units. Reject if more than half of retained lines are known chrome labels/links or if content is dominated by login/signup/trending/relevant-people/footer/cookie/navigation blocks. Fixtures must cover long article acceptance, non-X fake JS article acceptance, X login shell rejection, metadata-only rejection, and footer/trending-only rejection.

### state_strata

- **Runtime-only secrets**: `TAVILY_API_KEY`, `OPENROUTER_KEY`; never durable.
- **Current item state**: extraction status/source, source evidence text when retained, generated content, current diagnostics; durable but not portable by default.
- **Derived search state**: FTS rows; rebuilt/refreshed from current item rows.
- **Ephemeral operation state**: current operation snapshot and guard state; process memory only.
- **Portable user state**: sources, steering rules, resonated items; unchanged by Tavily.

### transport_boundary_rules

- HTTP and MCP call the same product operations; neither gets a Tavily-only product concept unavailable to the other.
- HTTP `reingest item`, MCP `reingest_item`, manual/background ingest, and library reprocess share the same evidence-selection helper but use operation-specific order: normal ingest/manual fetch uses fresh local readable from the current item URL → RSS-backed `source_evidence_text` → Tavily for the same selected item URL → unavailable; reprocess/re-ingest uses fresh local readable from `items.canonical_url` when valid then `items.url` → stored `source_evidence_text` → Tavily using the same canonical-url-then-url candidate order → unavailable. Never use `sources.url`, `items.source_url`, RSS/Atom feed URLs, or generated fields as article source candidates.
- API responses may expose safe extraction source labels and attempt diagnostics, but never provider secrets, `.env` paths, raw Tavily payloads, request headers, or secret-source metadata.
- `/doctor` is plain text with mandatory safe Tavily lines: `tavily: configured=present|missing`, `tavily: recovered_items=<n>`, and `tavily: recoverable_unavailable=<n>`. `recoverable_unavailable` counts current `original_unavailable` rows whose selected candidate is Tavily-eligible by `canonical_url`-then-`url` syntax checks, independent of key presence. It never live-probes Tavily and is not a provider tester or configuration UI.

### cross_cutting_governance
N/A: no new registry, DI container, event bus, lifecycle manager, governance owner, durable queue, or sidecar is introduced. Existing runtime wiring and existing ingest/reprocess guards remain the only coordination mechanisms.

### shared_abstractions
N/A: no cross-module shared abstractions are introduced. Use direct unexported helpers inside `internal/resofeed` only; do not create provider interfaces, registries, plugin systems, service layers, abstraction inventories, or utility packages.

### module_split_recommendations

- `internal/resofeed/runtime_secret.go` or adjacent file: add `TAVILY_API_KEY` optional resolution while preserving existing `.env` parser rules.
- `internal/resofeed/tavily_extract.go`: concrete Tavily URL extraction helper/client with injectable endpoint/client for tests; no `ExternalExtractor` interface or provider registry.
- `internal/resofeed/readable_sanitation.go`: extend sanitation for external provider output and common JS/login/sidebar chrome.
- `internal/resofeed/ingest.go`: apply shared evidence selection after local readable extraction and RSS excerpt fallback fail.
- `internal/resofeed/reprocess.go`: apply selected item re-ingest/library reprocess order: fresh fetch/local readable from `items.canonical_url` when valid then `items.url` first, stored source-backed `source_evidence_text` second, Tavily using the same canonical-url-then-url candidate third, unavailable last; stored generated text and processed/display `feed_excerpt` never count as source evidence.
- `internal/resofeed/db.go`: add migration for `items.extraction_source text not null default 'none'` constrained to `local_readable|feed_excerpt|external_tavily|none`, plus nullable `items.source_evidence_text`; conservatively backfill all pre-migration rows to `extraction_source='none'` and `source_evidence_text=null`, never infer evidence from ambiguous legacy `feed_excerpt`, never backfill generated `extracted_text`, never backfill legacy rows as `external_tavily`.
- `internal/resofeed/http.go` and DTO/types files: expose `extraction_source` on `ItemSummary`/`ItemDetail` and `source_evidence_text` on `ItemDetail`.
- `internal/resofeed/mcp.go`: reuse the same canonical item schemas so MCP sees `extraction_source` and `source_evidence_text` parity.
- `internal/resofeed/doctor.go`: add safe Tavily current-state diagnostics.
- `web/src/...`: display source-origin status tersely in Inspector frontmatter and text evidence disclosure where applicable.

### ux_surfaces

- **Inspector frontmatter**: show canonical source origin/depth copy: `SOURCE TEXT: LOCAL READABLE` / `来源文本：本地正文`, `SOURCE TEXT: RSS EXCERPT ONLY` / `来源文本：仅 RSS 摘录`, or `SOURCE TEXT: EXTERNAL / TAVILY` / `来源文本：TAVILY 外部抽取`.
- **Text evidence disclosure**: collapsed by default; may include canonical disambiguation such as `Text evidence: RSS excerpt` / `文本证据：RSS 摘录` or `Text evidence: external / Tavily` / `文本证据：TAVILY 外部抽取` when needed.
- **Doctor output**: safe `tavily:` lines only, plain text, no settings panel.
- **Troubleshooting docs**: explain `TAVILY_API_KEY` and re-ingest behavior without exposing secrets.

### runtime_surfaces

- **API/server**: `resofeed serve`; proof requires authorized `/api/doctor`, item re-ingest, and search/FTS verification.
- **MCP**: `/mcp`; proof requires `resofeed_reingest_item` and `resofeed://system/doctor` parity.
- **Web UI**: Inspector; proof requires non-blank render and visible source-origin label after external recovery.

### open_questions

None blocking. Tavily should start as configured-when-key-present. The current product request asks for general fallback attempts, so the default design is not X-only; URL safety gates above bound the generality.

### readiness

READY for implementation planning. Every module has an owner file area, every cross-module dependency points inward through explicit concrete helper wiring, and no blocking product question remains.

## Implementation Plan

### Phase 1: Contract and secret resolution

1. Add `TAVILY_API_KEY` optional runtime secret resolution with OS env > local `.env` precedence.
2. Reject explicit empty/whitespace Tavily values before bind without leaking values.
3. Add tests for precedence, missing-key non-fatal behavior, invalid empty value, and leak prevention.

### Phase 2: Concrete Tavily helper and call contract

1. Implement a concrete `tryTavilyExtract` helper/client with injectable endpoint or HTTP client for tests; do not add an `ExternalExtractor` interface, provider registry, or plugin system.
2. Enforce URL eligibility without DNS/redirect preflight, 30-second timeout, no automatic retry, 1 MiB provider-body cap, and safe internal mapping to `timeout`, `provider_unavailable`, or `unusable_evidence` with public item/reprocess mapping to `timeout`, `provider_error`, or `original_unavailable`.
3. Call URL-based Tavily Extract exactly as specified in `tavily_call_contract`; do not use Tavily Search or ask Tavily to summarize/translate/rank.
4. Add fake-server unit tests for success, timeout, provider error, malformed JSON, oversized body, empty output, and redaction.

### Phase 3: Sanitation and evidence selection

1. Extend sanitation to accept rich article text from external extraction and reject provider/login/sidebar/metadata-only chrome.
2. Implement operation-specific evidence selection:
   - normal ingest/manual source fetch: fresh local readable text from the current item URL → RSS excerpt copied into `source_evidence_text` → Tavily external recovery for the same selected item URL → unavailable;
   - selected item re-ingest/library reprocess: fresh local readable text from `items.canonical_url` when valid then `items.url` → stored `source_evidence_text` when source-backed/usable → Tavily external recovery using the same canonical-url-then-url candidate → unavailable.
3. For library reprocess, do not treat stored generated `extracted_text` or processed/display `feed_excerpt` as source evidence.
4. Add tests proving local readable wins, RSS excerpt wins when available, Tavily wins only when both fail, stored generated text is not source evidence, and low-info Tavily output is ignored.

### Phase 4: Persistence and operation wiring

1. Add `items.extraction_source text not null default 'none'` with allowed values `local_readable`, `feed_excerpt`, `external_tavily`, and `none`, plus nullable `items.source_evidence_text`. Backfill deterministically and conservatively: all pre-migration rows become `extraction_source='none'` and `source_evidence_text=null`; no legacy `feed_excerpt` or generated `extracted_text` source-evidence backfill; no legacy `external_tavily` backfill.
2. Wire evidence selection into background ingest/manual fetch, item re-ingest, and library reprocess.
3. Preserve non-destructive failure semantics: failed Tavily does not overwrite existing usable generated content.
4. Refresh per-item FTS after successful external recovery and final FTS after library reprocess.
5. Keep Tavily attempt diagnostics current-only and non-portable: no history tables, attempt ledgers, retry records, provider payload storage, or portable external-extraction state.

### Tavily operation persistence matrix

This matrix resolves Tavily-stage persistence only. It applies after local readable extraction and operation-appropriate stored/RSS evidence have already failed.

| Tavily-stage outcome | Normal ingest / manual source fetch | Library reprocess | Selected item re-ingest |
|---|---|---|---|
| Successful usable Tavily evidence + valid OpenRouter `ok` output | Write generated fields in runtime language; set `content_status`/model semantic status to validated `ok`; set `extraction_status='full'`, `extraction_source='external_tavily'`, `source_evidence_text=<sanitized evidence>`; clear latest-attempt failure diagnostics or set them to success; refresh item FTS from final row. If replacing an existing item row, this is a normal successful rewrite. | Rewrite generated fields in runtime language; set `content_status`/model semantic status to validated `ok`; set `extraction_status='full'`, `extraction_source='external_tavily'`, `source_evidence_text=<sanitized evidence>`; clear latest-attempt failure diagnostics or set them to success; count in `items_updated`; refresh item FTS and final FTS status. | Rewrite selected item generated fields; set `content_status`/model semantic status to validated `ok`; set `extraction_status='full'`, `extraction_source='external_tavily'`, `source_evidence_text=<sanitized evidence>`; clear latest-attempt failure diagnostics or set them to success; set `reingest.status='completed'`, `error=null`, `item_updated=true`, `fts_updated=true`; return refreshed detail. |
| Missing `TAVILY_API_KEY` or no eligible selected URL | No Tavily call. If no prior valid generated content exists, write/keep unavailable source state with `content_status='summary_unavailable'` or the existing unavailable semantic status, `extraction_source='none'`, `source_evidence_text=null`, safe current diagnostics, and FTS from final stored row. If prior valid generated content exists, preserve prior generated fields, `content_status`, `extraction_source`, `source_evidence_text`, and FTS; update safe latest-attempt diagnostics only. | No Tavily call. Rewrite this reprocess attempt to unavailable state: generated fields that cannot be source-backed are cleared/fallback-titled as specified by the processing-language contract; set `content_status='summary_unavailable'` or the existing unavailable semantic status, `extraction_source='none'`, `source_evidence_text=null`; count in `items_unavailable`; refresh FTS from final row. | No Tavily call. Non-destructive failure: preserve prior generated fields, `content_status`, `extraction_source`, `source_evidence_text`, and FTS; set latest-attempt diagnostics and `reingest.status='completed_with_errors'`, `reingest.error.code='original_unavailable'`; `item_updated=false`; `fts_updated=false` unless existing implementation reports a diagnostics-only stable write separately from content/FTS update. |
| Tavily returns sanitized unusable/low-information evidence | Treat as unavailable source evidence. Use the same persistence as missing key/no eligible URL for this operation: new/no-prior rows become unavailable with `content_status='summary_unavailable'` or the existing unavailable semantic status, `extraction_source='none'`, `source_evidence_text=null`; prior valid generated content and FTS are preserved; public item/reprocess error is `original_unavailable`. | Treat as unavailable source evidence. Rewrite to unavailable state with `content_status='summary_unavailable'` or the existing unavailable semantic status, `extraction_source='none'`, `source_evidence_text=null`; count in `items_unavailable`; refresh FTS from final row; public per-item error is `original_unavailable`. | Treat as unavailable source evidence. Preserve prior generated fields, `content_status`, `extraction_source`, `source_evidence_text`, and FTS; set latest-attempt diagnostics and `reingest.status='completed_with_errors'`, `reingest.error.code='original_unavailable'`; `item_updated=false`; `fts_updated=false` unless diagnostics-only write reporting is separated. |
| Tavily timeout before source text selection | Preserve any prior generated fields, `content_status`, `extraction_source`, `source_evidence_text`, and FTS; update safe latest-attempt diagnostics only. Public item/reprocess error is `timeout`. | Preserve prior generated fields, `content_status`, `extraction_source`, `source_evidence_text`, and FTS for that item; update latest-attempt diagnostics; count in `items_failed`; public per-item error is `timeout`. | Preserve prior generated fields, `content_status`, `extraction_source`, `source_evidence_text`, and FTS; update latest-attempt diagnostics; `reingest.status='completed_with_errors'`, `reingest.error.code='timeout'`, `item_updated=false`, `fts_updated=false` unless a stable diagnostics-only write is reported separately. |
| Tavily provider/network/HTTP/schema/unreadable-body failure before source text selection | Preserve any prior generated fields, `content_status`, `extraction_source`, `source_evidence_text`, and FTS; update safe latest-attempt diagnostics only. Public item/reprocess error is `provider_error`. | Preserve prior generated fields, `content_status`, `extraction_source`, `source_evidence_text`, and FTS for that item; update latest-attempt diagnostics; count in `items_failed`; public per-item error is `provider_error`. | Preserve prior generated fields, `content_status`, `extraction_source`, `source_evidence_text`, and FTS; update latest-attempt diagnostics; `reingest.status='completed_with_errors'`, `reingest.error.code='provider_error'`, `item_updated=false`, `fts_updated=false` unless a stable diagnostics-only write is reported separately. |

Implementation note: selected item re-ingest is intentionally non-destructive on all Tavily failure outcomes. Library reprocess is allowed to rewrite unavailable source states only for unavailable source outcomes (missing key, no eligible URL, or unusable evidence), not for operational Tavily timeout/provider failures.

### Phase 5: Multilingual completeness

1. Verify external-recovered evidence enters the existing processing-language prompt path.
2. Ensure generated title, summary, core insight, and Key Points are Chinese when runtime language is `zh`; underlying `value_tier` and status enum values remain literal contract values, while UI/user-facing enum labels are localized.
3. Ensure source/provenance literals remain unchanged and `translate="no"` behavior still applies.
4. Add English and Chinese tests for re-ingest and library reprocess.

### Phase 6: Doctor, HTTP/MCP parity, and UI

1. Add mandatory safe Doctor lines and count semantics: `tavily: configured=present|missing`, `tavily: recovered_items=<rows with extraction_source='external_tavily'>`, and `tavily: recoverable_unavailable=<original_unavailable rows whose selected candidate is Tavily-eligible by canonical_url-then-url syntax checks>`. The candidate count is computed independently of key presence and never live-probes Tavily.
2. Ensure HTTP/MCP item reads expose `extraction_source` and item details expose `source_evidence_text` where retained.
3. Add Inspector frontmatter/text-evidence labels for external source origin.
4. Add e2e/UI tests for source-origin display without extra settings/dashboard UI.
5. Verify semantic `<dl>` or equivalent key-value Frontmatter, accessible disclosure (`aria-expanded`, labelled region), keyboard operation, and screen-reader-readable non-duplicative provenance.

### Phase 7: Live proof and regression gate

1. With real `TAVILY_API_KEY` from local `.env`, run a gated live test against `https://x.com/frydwia/status/2059045647634858329` or another fixed URL whose local extraction is known to fail and Tavily is known to recover. The test must skip unless the explicit live-test env gate is set.
1a. Add a deterministic non-X fake-server regression fixture where local readable/RSS fallback fail and the fake Tavily server returns a JavaScript-heavy article payload, proving fallback is general eligible-URL recovery rather than X-only host logic.
2. Re-ingest the known failed item when available and verify `model_status=ok`, `extraction_status=full`, `extraction_source=external_tavily`, non-null source-backed evidence when retained, target-language completeness, and FTS searchability.
3. Run full backend/frontend tests and Doctor leak scan.

## Verification Gates

- `go test ./...`
- `npm --prefix web test`
- `/api/doctor` contains the mandatory safe `tavily:` lines with correct current-state counts and no key/path/payload leakage.
- HTTP `ItemSummary`/`ItemDetail` and MCP `list_candidate_items`/`search_items`/`read_item` expose `extraction_source` consistently; item detail exposes `source_evidence_text` only as source-backed evidence.
- MCP `resofeed_reingest_item` and HTTP item re-ingest produce equivalent state.
- Normal background/manual ingest with a non-X fake-server URL proves Tavily fallback, `extraction_source='external_tavily'`, target-language generated output, FTS searchability, and literal provenance preservation.
- Chinese runtime language ingest and re-ingest produce complete Chinese generated content from Tavily evidence while literal provenance remains unchanged.
- Existing source-unavailable items remain truthfully classified when Tavily is missing or provider output is unusable.
- UI source-origin display is accessible, non-duplicative, keyboard usable, and does not add settings/provider panels.
- No new durable queue, worker, sidecar, browser automation, provider registry, settings dashboard, history ledger, or RAG/vector dependency appears.

## Handoff Notes

- Do not implement a provider registry, plugin framework, or `ExternalExtractor` interface unless a second external extractor is explicitly approved.
- Do not call Tavily before local readable extraction or RSS excerpt fallback.
- Do not use Tavily Search as the normal path; this plan is URL-based extraction, not alternative-source discovery.
- Do not let Tavily output bypass ResoFeed sanitation or OpenRouter structured-output validation.
- Do not treat generated `extracted_text` or processed/display `feed_excerpt` as source-backed evidence; use `source_evidence_text` for Inspector Text evidence.
- Treat provider cost/latency as a reason for bounded fallback, not for durable job infrastructure.
