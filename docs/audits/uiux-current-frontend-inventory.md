# Current Frontend Inventory Against UI/UX Traceability Matrix

artifact_path: `docs/audits/uiux-current-frontend-inventory.md`

matrix_artifact_consumed: `docs/audits/uiux-design-traceability-matrix.md`

Artifact status: current implementation inventory only. This document records current Svelte/CSS/UI test seams against the approved matrix. It intentionally does not fix product/runtime gaps.

## Authority read confirmation

- `AGENTS.md` — read. Key insight: `docs/ARCHITECTURE.md` and `docs/DESIGN.md` are canonical; one Go binary, SQLite/FTS5 only, owner token only, flat `internal/resofeed`, no folders/tags/unread/settings dashboards, and no plan-state mutation.
- `CONSTITUTION.md` — read. Key insight: stable invariants require single-tenant, one Go binary, SQLite+FTS5 lexical-only retrieval, LLM as stateless JSON transformer, current-state-only UX, no histories/ledgers/settings/sync/merge, and explicit re-ingest/reprocess non-durable boundaries.
- `docs/ARCHITECTURE.md` — read. Key insight: browser SPA is served by the one Go binary; Source Ledger/search/current operation/runtime metadata sources of truth are explicitly separated; language control and library reprocess are runtime/global operations, while item re-ingest is Inspector-scoped and request-scoped only.
- `docs/PRD.md` — read. Key insight: product primitives are Inspect, Resonate, and Steer; `/doctor` is raw diagnostics; state portability covers active sources, active steering policy, and currently resonated items; delegated-agent actions require visible receipt tags but no activity ledger.
- `docs/DESIGN.md` — read. Key insight: approved surfaces include owner-token prompt, first-use empty state, Feed, Inspector, Source Ledger, Steer/search, `/doctor`, RESOFEED utility menu, language/reprocess operations, source disclosure, mobile/narrow behavior, and agent receipts. It explicitly reserves Language Control and `[REPROCESS LIBRARY]` for the opened RESOFEED utility menu, not Inspector.
- `docs/DESIGN_VISION.md` — read. Key insight: the design model is an archival, high-density, low-fatigue workbench; search is a filtered desk-review slice with desktop detail preservation and mobile Back restoration; Source Ledger is a bare flat roster; Inspector re-ingest is inline and temporary.
- `docs/ui-preview.html` — read. Key insight: static preview demonstrates tokens/classes for utility menu, search contract strip, split Feed/Inspector, frontmatter, re-ingest panel, collapsed `<details class="source-disclosure">`, Source Ledger, `/doctor`, and mobile cards.
- `docs/audits/uiux-design-traceability-matrix.md` — read. Key insight: 40 matrix rows define owned/excluded UI obligations with exact requirement IDs, evidence fields, and non-intersections; rows 48-49 are the authority correction for global Language Control and `[REPROCESS LIBRARY]` placement.
- `web/src/routes/+page.svelte` — read. Key insight: owns shell state, surface routing, owner-token storage key, processing language/reprocess utility menu controls, Steer route preview/receipts, current-operation polling, search selection preservation, mobile route state, and orchestration into Feed/Inspector/Ledger/Search.
- `web/src/routes/components/` — read. Key insight: current components are `Feed.svelte`, `Inspector.svelte`, `SourceLedger.svelte`, `SearchRetrieval.svelte`, `StatePortability.svelte`, `OwnerTokenPrompt.svelte`, `FirstUseEmptyState.svelte`, and `item-anatomy.ts`.
- `web/src/app.css` — read. Key insight: current runtime CSS consumes `--rf-*` tokens, defines split scroll, shell/menu/search/feed/Inspector/ledger/doctor/mobile selectors, and contains media seams for `<1080px` narrow behavior.
- `web/src/lib/design-tokens.css` — read. Key insight: implementation exposes base color, typography, radius, spacing, and a few component tokens; dark-mode tokens exist as variables but no complete runtime dark-mode shell is currently wired.
- `web/tests/` — present and read by directory glob plus representative contracts: `web/tests/e2e/traceability-gap-matrix.md`, `web/tests/contracts/ui-remediation-contract-matrix.json`, `web/tests/e2e/search-click-inspector-contract.expected-red.spec.ts`, `web/tests/e2e/inspector-reingest.expected-red.spec.ts`, and `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts`. Key insight: tests already encode expected-red proof seams for search detail restoration, source disclosure, re-ingest non-persistence, utility-menu placement, current-operation contextual status, and browser evidence capture.

## files_and_symbols_by_requirement_family

### Token/style definitions

- Matrix rows: `DESIGN.TOKENS.BASE_SYSTEM`, `DESIGN.TOKENS.FLEXIBLE.SURFACE`, `DESIGN.TOKENS.FLEXIBLE.SURFACE_ACTIVE`, `DESIGN.TOKENS.FLEXIBLE.METADATA_TOKEN`, `DESIGN.COLOR.CONTRAST_STATUS_SEMANTICS`, `DESIGN.COLOR.DARK_MODE_SHELL`.
- Current files/symbols/classes:
  - `web/src/lib/design-tokens.css`: `--rf-color-*`, `--rf-typography-*`, `--rf-radius-*`, `--rf-space-*`, `--rf-component-*`.
  - `web/src/app.css`: `.contract-shell`, `.contract-region`, `.contract-feedback-error`, `.contract-warning`, `.contract-muted`, `.bracket-action`, `.contract-diagnostics`, `.contract-inspector`.
  - `docs/ui-preview.html`: `:root`, `.panel`, `.doctor pre`, `.bracket-action`, `.runtime-warning`, `.attempt-failure`.
- Current inventory result: base token definitions are present and broadly consumed. Contrast token pairings are represented by semantic classes, but no artifact in runtime CSS records the matrix's numeric ratios. Dark-mode variables exist, but no full `prefers-color-scheme` or shell-level dark hierarchy is present in the runtime implementation.

### App shell/top chrome, utility menu, language, and library reprocess

- Matrix rows: `DESIGN.LAYOUT.DENSITY_SPLIT_SCROLL`, `DESIGN.LANGUAGE_CONTROL.UTILITY_MENU_POSITIVE_PROOF`, `DESIGN.REPROCESS_LIBRARY.UTILITY_MENU_ONLY`, `DESIGN.STEER.INPUT_RECEIPT_OPERATION`, `DESIGN.STATES.INTERACTION_AND_FAILURE`.
- Current files/symbols/classes:
  - `web/src/routes/+page.svelte`: `Surface`, `surfaceMenuOpen`, `processingLanguage`, `processingLanguageButtonText`, `reprocessDefaultLabel`, `surfaceForPath`, `showSurface`, `handleSurfaceMenuToggle`, `updateProcessingLanguage`, `beginReprocessConfirmation`, `confirmReprocess`, `contextualOperationStatusText`.
  - `web/src/app.css`: `.shell-command`, `details.surface-nav`, `.surface-nav-menu`, `.runtime-language-controls`, `.bracket-action--language`, `.bracket-action--reprocess`, `.surface-operation-status`.
  - `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts`: utility menu tests assert `LANG: EN` and `[REPROCESS LIBRARY]` are hidden from persistent top chrome and visible only after opening `details[aria-label="RESOFEED surface menu"]`.
- Current inventory result: Language Control and `[REPROCESS LIBRARY]` are global/library utility-menu operations. They are not Inspector item controls. Current shell has a positive proof seam at `details[aria-label="RESOFEED surface menu"] .runtime-language-controls`.

### Feed row anatomy

- Matrix rows: `DESIGN.FEED.ITEM_ANATOMY_NO_KEY_POINTS`, `DESIGN.FEED.NO_REPEATED_PREFIXES`, `DESIGN.AGENTS.RECEIPT_MARKERS`, `DESIGN.LOCALIZATION.PROVENANCE_LITERALS`.
- Current files/symbols/classes:
  - `web/src/routes/components/Feed.svelte`: `feedPreviewText`, `openInspectorLabel`, `titleDistinctionLabel`, `resonanceLabel`, `.contract-feed-item`, `.contract-feed-open`, `.contract-feed-meta`, `.feed-meta-source`, `.feed-meta-source-title`, `.feed-meta-agent`, `.contract-time-label`, `.contract-feed-title`, `.contract-feed-summary`, `.contract-resonate`.
  - `web/src/routes/components/item-anatomy.ts`: `itemAnatomyChrome`, `itemCompactPreviewText`, `itemLocalizedDisplayTitle`, `itemSourceProvenanceTitle`, `itemPriorityLabel`, `shouldShowTimeGroup`.
  - `web/src/app.css`: `.contract-feed-item`, `.contract-feed-meta`, `.contract-feed-title`, `.contract-feed-summary`, `.contract-resonate`.
- Current inventory result: Feed has clear anatomy and strips Key Point labels from preview text. Current visible Feed metadata still renders `src:` and conditionally `source title:` / `来源标题：`; this is a known gap against the newer matrix rows that forbid repeated reader prefixes.

### Inspector layout/frontmatter/reading sections and item re-ingest

- Matrix rows: `DESIGN.INSPECTOR.FRONTMATTER_ORDER`, `DESIGN.INSPECTOR.COMPACT_EVIDENCE_LINKS`, `DESIGN.INSPECTOR.REINGEST.ITEM_SCOPED`, `DESIGN.INSPECTOR.REINGEST.AUTHORITY_PROMPT`, `DESIGN.INSPECTOR.REINGEST.PERSISTENCE_CLEARING`, `DESIGN.INSPECTOR.REINGEST.FAILED_PRESERVATION`, `DESIGN.INSPECTOR.REINGEST.ACCESSIBILITY_STATES`, `DESIGN.INSPECTOR.SOURCE_DISCLOSURE.DEFAULT_COLLAPSED`, `IR-MODEL-*` rows.
- Current files/symbols/classes:
  - `web/src/routes/components/Inspector.svelte`: `resetReingestTransientState`, `openReingestConfig`, `cancelReingestConfig`, `submitReingest`, `modelListDiagnostic`, `reingestStatusText`, `latestAttemptFailureText`, `sourceEvidenceText`, `isFallbackEvidenceState`, `processingStateLine`, `structuredKeyPoints`, `groupedSourceItems`, `.contract-inspector`, `.inspector-header-row`, `.contract-provenance-anchors`, `.inspector-text-section`, `.inspector-key-points-section`, `.inspector-reingest-panel`, `[data-contract="inspector-reingest"]`, `.inspector-reingest-toggle`, `.inspector-reingest-submit`, `.inspector-reingest-cancel`, `.inspector-source-evidence-section`, `.inspector-reading-section`, `.contract-source-details`, `.contract-grouped-sources`.
  - `web/src/routes/+page.svelte`: `reingestSelectedItem`, `openRouterModels`, `openRouterModelListState`, `loadOpenRouterModelsSafe`, `client.openRouterModels()`.
  - `web/tests/e2e/inspector-reingest.expected-red.spec.ts`: asserts item re-ingest absent before Inspect, panel exists only in Inspector, prompt/model request is non-durable, localStorage has no reingest/prompt/model keys, source evidence/source text `<details>` is collapsed by default, canonical model route is requested.
- Current inventory result: item-scoped re-ingest exists in Inspector only after `inspectorActivated`. Model/prompt state is local component state and reset on item change/cancel/success. Current Inspector is not yet a compact fixed frontmatter grid: it still uses visible provenance/header lines and `contract-provenance-anchors` with raw URL labels in zh mode, which is a gap against compact frontmatter and reader raw URL prohibitions.

### Source Ledger, `/doctor`, state portability, and raw URL exceptions

- Matrix rows: `DESIGN.SOURCE_LEDGER.RAW_PROVENANCE_EXCEPTION`, `DESIGN.DOCTOR.DIAGNOSTICS_EXCEPTION`, `DESIGN.STATE_PORTABILITY.ACTIVE_ONLY`, `DESIGN.STATES.INTERACTION_AND_FAILURE`.
- Current files/symbols/classes:
  - `web/src/routes/components/SourceLedger.svelte`: `sourceDiagnosticText`, `rowGrammarForSource`, `statusTextForSource`, `rawErrorText`, `runIngest`, `fetchSource`, `importSelectedFile`, `.source-ledger`, `.source-ledger__header`, `.source-ledger__status`, `.source-ledger-row`, `.source-ledger-url`, `.source-diagnostic-details`, `.bracket-action--run-ingest`, `.bracket-action--fetch`.
  - `web/src/routes/components/StatePortability.svelte`: `PortabilityState`, `startImport`, `importSelectedFile`, `exportState`, `.state-portability-actions`, `#state-export`, `#state-import`, `#state-json-file`, `.state-portability-warning`.
  - `web/src/routes/+page.svelte`: `loadDoctorDiagnostics`, `normalizeDoctorDiagnostics`, `steerFeedback.kind === 'doctor'`, `.doctor-surface`, `.contract-diagnostics`.
  - `web/src/app.css`: `.source-ledger*`, `.source-diagnostic-details pre`, `.contract-diagnostics`.
- Current inventory result: raw visible URLs are currently present in Source Ledger rows/details and `/doctor` pre output, which are allowed exception surfaces. State portability is embedded as Source Ledger actions and uses `state.json`, not settings. Current Source Ledger zh labels are localized for bracket actions, which may conflict with the exact-English Source Ledger token requirement in `docs/DESIGN.md:901` and matrix Source Ledger rows.

### Search/Retrieval UI and detail restoration

- Matrix rows: `DESIGN.SEARCH.ROUTING_LEXICAL_STEER`, `DESIGN.SEARCH.DESKTOP_DETAIL_PRESERVES_FILTERED_SLICE`, `DESIGN.SEARCH.MOBILE_BACK_RESTORES_EPHEMERAL_SEARCH_STATE`, `DESIGN.SEARCH.NO_DURABLE_HISTORIES`.
- Current files/symbols/classes:
  - `web/src/routes/+page.svelte`: `searchSeedQuery`, `preservedSearchWindowScrollY`, `surfaceForPath`, `replaceSurfaceFromLocation`, `syncSearchHistory`, `restoreSearchScrollPosition`, `selectSearchItem`, `submitSteer` search branch, `SearchRetrieval` instantiation.
  - `web/src/routes/components/SearchRetrieval.svelte`: `searchQuery`, `source`, `from`, `to`, `resonated`, `limit`, `results`, `submitSearch`, `openInspector`, `.contract-search`, `.contract-search-form`, `.search-secondary-filters`, `.contract-search-result`, `.contract-search-match`.
  - `web/tests/e2e/search-click-inspector-contract.expected-red.spec.ts`: asserts desktop search list remains visible, query and `.contract-search.scrollTop` are preserved, selected row has `aria-current="true"`, mobile Back restores query and `window.scrollY`, and fallback source evidence survives search selection.
- Current inventory result: Search is under Steer/search paths, not the RESOFEED utility menu. It uses lexical API calls via `onSearch`, not RAG/chat. Current preservation state uses URL/search/history primitives and local component state only.

### Owner Token Prompt, First-Use Empty State, mobile/narrow, accessibility, provenance

- Matrix rows: `DESIGN.AUTH.OWNER_TOKEN_PROMPT`, `DESIGN.EMPTY.FIRST_USE`, `DESIGN.MOBILE.PARITY_TOUCH_TARGETS`, `DESIGN.STATES.INTERACTION_AND_FAILURE`, `DESIGN.AGENTS.RECEIPT_MARKERS`, `DESIGN.LOCALIZATION.PROVENANCE_LITERALS`, `DESIGN.ANTI_FEATURES.NO_SAAS_DASHBOARD_ONBOARDING`.
- Current files/symbols/classes:
  - `web/src/routes/components/OwnerTokenPrompt.svelte`: `OwnerTokenPromptState`, `focusTokenInput`, `submitOwnerToken`, `#owner-token-input`, `#owner-token-error`, `.contract-token-prompt`.
  - `web/src/routes/components/FirstUseEmptyState.svelte`: `FirstUseState`, `.contract-empty`, `data-state`.
  - `web/src/routes/+page.svelte`: `isNarrow`, `preservedFeedScrollTop`, `preservedWindowScrollY`, `selectItem`, `restoreFeedScrollPosition`, `loadAgentSteeringRules`, `agentSteeringRules`, `.contract-steering-receipt`.
  - `web/src/app.css`: `@media (max-width: 1079px)`, `.shell-command` fixed bottom, `.detail-pane.active-panel`, `.utility-surface.search-surface.active-panel`, 44px controls, `.visually-hidden`.
- Current inventory result: owner token and first-use empty states exist. Mobile/narrow behavior has explicit CSS and Svelte state seams. Agent provenance is currently displayed through active agent-created steering rules and `external_surfaced_at` markers as `agent:external`, but not a source-backed agent name per item unless backend DTO supplies one.

## exact_gaps_by_requirement_id

- `DESIGN.TOKENS.BASE_SYSTEM`: tokens exist, but component-level token coverage is partial; many component styles consume base tokens directly rather than full `--rf-component-*` equivalents.
- `DESIGN.COLOR.CONTRAST_STATUS_SEMANTICS`: status classes and text labels exist, but current inventory found no runtime/static contrast-ratio proof artifact tied to the matrix ratios.
- `DESIGN.COLOR.DARK_MODE_SHELL`: dark tokens exist; runtime shell lacks a complete dark-mode selector/media implementation proving hierarchy.
- `DESIGN.FEED.ITEM_ANATOMY_NO_KEY_POINTS`: Feed filters `要点`/`核心洞察`/`Key Points` strings in `feedPreviewText`; downstream proof still needs DOM text scan because summary/core text may contain other list-like strings.
- `DESIGN.FEED.NO_REPEATED_PREFIXES`: current Feed visibly renders `src:` and may render `source title:` / `来源标题：`; current Search results also render `src:` and source-title prefixes. This conflicts with the matrix's newer reader-surface prefix prohibition.
- `DESIGN.INSPECTOR.FRONTMATTER_ORDER`: current Inspector does not render the fixed compact `ORIGINAL` / `LINKS` / `AI STATUS` / `ATTEMPT` `<dl>` order in runtime; it uses header/provenance/status paragraphs plus `contract-provenance-anchors`.
- `DESIGN.INSPECTOR.COMPACT_EVIDENCE_LINKS`: current `original link` visible text is compact, but zh mode renders raw `item.url`, `source url`, `canonical url`, and `original url` inside `contract-provenance-anchors`, which violates reader raw URL prohibition.
- `DESIGN.INSPECTOR.REINGEST.ITEM_SCOPED`: current placement is Inspector-only and item-scoped after Inspect; downstream proof should assert absence from Feed, Source Ledger, utility menu, `/doctor`, and search.
- `DESIGN.INSPECTOR.REINGEST.AUTHORITY_PROMPT`: helper text exists; downstream proof should assert prompt text is not echoed in receipts/errors/diagnostics.
- `DESIGN.INSPECTOR.REINGEST.PERSISTENCE_CLEARING`: localStorage proof seams exist in expected-red tests; current component state clears on cancel, item change, and success, but failure acknowledgement clearing is not a distinct visible state.
- `DESIGN.INSPECTOR.REINGEST.ACCESSIBILITY_STATES`: current component has idle/configuring/submitting/completed/replayed/conflict/failed and model-list diagnostics; it does not expose a separate confirming state before submit.
- `DESIGN.INSPECTOR.SOURCE_DISCLOSURE.DEFAULT_COLLAPSED`: current source evidence/text uses `<details>` without `open`; reset on item change is seam-based through item remount/state path, requiring runtime proof. `contract-source-details` and grouped sources may expose separate details/open state and must not be confused with source text disclosure.
- `DESIGN.SOURCE_LEDGER.RAW_PROVENANCE_EXCEPTION`: Source Ledger raw URL exception exists. Current rows render `url: <raw url>` and diagnostic pre includes `source_url`/`feed_url`; this must remain limited to Ledger/diagnostics.
- `DESIGN.DOCTOR.DIAGNOSTICS_EXCEPTION`: `/doctor` output exists as `<pre class="contract-diagnostics" role="log">`; downstream proof must confirm it does not replace required positive UI controls.
- `DESIGN.STATE_PORTABILITY.ACTIVE_ONLY`: current UI exposes export/import in Source Ledger; downstream proof must confirm exported/imported state excludes histories, receipts, settings, search/session state, and runtime metadata.
- `DESIGN.SEARCH.ROUTING_LEXICAL_STEER`: current search is routed from Steer/search paths. It must remain outside RESOFEED utility menu.
- `DESIGN.SEARCH.DESKTOP_DETAIL_PRESERVES_FILTERED_SLICE`: current implementation preserves `.contract-search.scrollTop` and selected row on desktop in `selectSearchItem`; needs runtime proof for query/filter values and no durable saved-search surface.
- `DESIGN.SEARCH.MOBILE_BACK_RESTORES_EPHEMERAL_SEARCH_STATE`: current implementation stores `surface`, `searchQuery`, and `searchScrollY` in `window.history.state`/URL query; needs proof that this restores state without durable storage.
- `DESIGN.SEARCH.NO_DURABLE_HISTORIES`: current inventory found no explicit search/session storage keys. Must prove absence from `localStorage`, `sessionStorage`, state export, API payloads, and backend tables/routes.
- `DESIGN.STEER.INPUT_RECEIPT_OPERATION`: Steer route preview and inline receipts exist; receipts should remain near Steer and not accumulate into a ledger.
- `DESIGN.LANGUAGE_CONTROL.UTILITY_MENU_POSITIVE_PROOF`: current implementation places language control in opened `RESOFEED` menu. It also has test-only/preauth language localStorage fixture key `resofeed.e2e.preAuthLanguage`; this is test bootstrap state, not product persistence, and must not be treated as a product settings surface.
- `DESIGN.REPROCESS_LIBRARY.UTILITY_MENU_ONLY`: current implementation places reprocess in opened `RESOFEED` menu. Downstream proof must assert absence from Inspector/Feed/Search/Source Ledger/Doctor.
- `DESIGN.MOBILE.PARITY_TOUCH_TARGETS`: current CSS has 44px minimums and fixed bottom command row; prior test matrices recorded some mobile width/geometry expected-red gaps, so runtime proof remains required.
- `DESIGN.STATES.INTERACTION_AND_FAILURE`: visible text states exist for many surfaces; downstream proof still needed for non-color-only semantics and no spinners/skeletons/toasts/animated ellipses across all guarded operations.
- `DESIGN.LOCALIZATION.PROVENANCE_LITERALS`: `translate="no"` is used for several source/title/url elements, but current reader raw URL/provenance layout conflicts with compact frontmatter rules.
- `DESIGN.AGENTS.RECEIPT_MARKERS`: current feed/search marker is `agent:external`; `+page.svelte` shows active agent steering receipts from `created_by_actor_id`. Exact delegated-agent item receipt names depend on DTO availability.
- `IR-MODEL-OPENROUTER-ONLY`: current selector uses OpenRouter model options from `client.openRouterModels()` and no provider tabs; proof should assert no marketplace/provider UI.
- `IR-MODEL-LIST-SOURCE`: current `loadOpenRouterModelsSafe` calls only `client.openRouterModels()`; expected-red test expects compatibility fallback when canonical route 404s. Verify `api-client` behavior before implementation.
- `IR-MODEL-DEFAULT-NULL`: current `submitReingest` sends `model: null` when `reingestModel === 'default'`; proof seam exists.
- `IR-MODEL-STATES`: current `modelListDiagnostic()` has `models: loading`, available count, and `err: models unavailable`; default model remains selectable.
- `IR-MODEL-NO-DURABLE-PREF`: current selected model/prompt are component-local only; localStorage proof seam exists.
- `IR-MODEL-PLACEMENT`: current model selector appears only inside Inspector re-ingest panel.
- `DESIGN.ANTI_FEATURES.NO_SAAS_DASHBOARD_ONBOARDING`: current inventory did not find product runtime surfaces for accounts, folders, tags, unread, settings dashboard, job dashboard, RAG/chat, or sync/merge. Continue to assert absence.

## downstream_touch_paths

These paths are proof/remediation seams only, not an implementation sequence.

- `web/src/lib/design-tokens.css` — token completeness, dark-mode token exposure, component-token equivalence proof.
- `web/src/app.css` — shell/menu/feed/search/Inspector/Ledger/mobile selectors, 44px target proofs, dark-mode shell proof, contrast/status non-color proof.
- `web/src/routes/+page.svelte` — shell utility menu, Steer/search routing, search history-state restoration, current operation, owner token, language/reprocess placement.
- `web/src/routes/components/Feed.svelte` and `web/src/routes/components/item-anatomy.ts` — Feed row anatomy, prefix stripping, no Key Points, agent marker/provenance text.
- `web/src/routes/components/Inspector.svelte` — compact frontmatter, compact links, raw URL removal from reader flow, source disclosure reset, item re-ingest states/non-persistence.
- `web/src/routes/components/SearchRetrieval.svelte` — lexical results, desktop selected-result state, mobile filtered-slice restoration, search no-persistence proof.
- `web/src/routes/components/SourceLedger.svelte` — raw URL exception, bracket actions, current operation status, source diagnostic details, exact Source Ledger labels.
- `web/src/routes/components/StatePortability.svelte` — active-only state export/import UX and no settings/history/session surface.
- `web/src/routes/components/OwnerTokenPrompt.svelte` and `web/src/routes/components/FirstUseEmptyState.svelte` — local access gate and first-use empty state.
- `web/tests/e2e/search-click-inspector-contract.expected-red.spec.ts` — search desktop/mobile restoration proof seam.
- `web/tests/e2e/inspector-reingest.expected-red.spec.ts` — item re-ingest/source disclosure/non-durability proof seam.
- `web/tests/e2e/current-operation-utility-placement.expected-red.spec.ts` — utility-menu placement and contextual current-operation proof seam.
- `web/tests/contracts/ui-remediation-contract-matrix.json` and `web/tests/e2e/traceability-gap-matrix.md` — existing browser-evidence and no-forbidden-surface guardrails.

## raw_url_exception_boundaries

- Allowed raw visible URL surfaces:
  - Source Ledger source-management rows/details: `SourceLedger.svelte` `.source-ledger-url`, `.source-diagnostic-details pre`, `sourceDiagnosticText()`.
  - `/doctor` diagnostics: `+page.svelte` `.doctor-surface`, `.contract-diagnostics`.
  - DOM `href` attributes and accessible names for compact evidence links where the visible text is compact.
- Forbidden raw visible URL surfaces:
  - Feed rows and search result reader rows.
  - Inspector compact frontmatter and primary reading sections.
  - Inspector item re-ingest receipts/errors/helper text.
  - RESOFEED utility menu.
- Current boundary issue: runtime Inspector zh mode currently renders visible raw URLs inside `contract-provenance-anchors`; this is an exact gap for `DESIGN.INSPECTOR.COMPACT_EVIDENCE_LINKS` / `DESIGN.FEED.NO_REPEATED_PREFIXES` reader-flow raw URL rules.

## source_disclosure_seams

Requirement: `DESIGN.INSPECTOR.SOURCE_DISCLOSURE.DEFAULT_COLLAPSED`.

- Current selector seams:
  - Fallback/source evidence: `Inspector.svelte` `details.inspector-source-evidence-section[aria-label="Source evidence"]` / zh `aria-label="出处记录"`.
  - Model-backed source text: `Inspector.svelte` `details.inspector-reading-section[aria-label="Source text"]` / zh `aria-label="来源文本"`.
  - Summary text: `summary.inspector-section-label` with `readingSectionLabel(item)`.
- Current reset seams:
  - `+page.svelte` `selectItem()` changes `selectedItemId`, clears `selectedItemDetail`, increments `inspectorFocusRequestId`, and loads detail.
  - `Inspector.svelte` does not store disclosure state and renders native `<details>` without `open`, so a newly rendered item should start collapsed.
- Proof seam:
  - Open item A, expand source details, open item B, assert `details[aria-label="Source text"|"Source evidence"]` lacks `open`.
  - Assert no `localStorage`/`sessionStorage` key containing `source`, `disclosure`, `details`, or selected item disclosure state.
- Non-confusion seam:
  - `details.contract-source-details` and `details.contract-grouped-sources` are separate provenance/detail surfaces; they are not the source-text disclosure and must not satisfy this requirement.

## search_detail_state_restoration_seams

Requirements: `DESIGN.SEARCH.DESKTOP_DETAIL_PRESERVES_FILTERED_SLICE`, `DESIGN.SEARCH.MOBILE_BACK_RESTORES_EPHEMERAL_SEARCH_STATE`.

- Desktop current seams:
  - `+page.svelte` `selectSearchItem(item)` preserves `document.querySelector('.contract-search')?.scrollTop`, updates `selectedItemId`, loads detail, keeps `currentSurface = 'search'`, then restores `.contract-search.scrollTop` after `tick()` and animation frame.
  - `SearchRetrieval.svelte` marks result rows with `article.contract-search-result[aria-current="true"]` when `selectedItemId` matches.
  - `SearchRetrieval.svelte` keeps `searchQuery`, source/from/to/resonated/limit component state while desktop detail updates the right Inspector.
- Desktop proof selectors/state:
  - `.contract-search` scrollTop before/after activation.
  - `#search-query`, `#search-source`, `#search-from`, `#search-to`, `#search-resonated`, `#search-limit` values before/after activation.
  - `article.contract-search-result[aria-current="true"]` for selected row.
  - Right-side `.detail-pane.active-panel .contract-inspector` visible while `.contract-search` remains visible.
- Mobile current seams:
  - `+page.svelte` `syncSearchHistory(scrollY)` writes ordinary `window.history.state` fields `{ surface: 'search', searchQuery, searchScrollY }` and URL `?search=<query>`.
  - `replaceSurfaceFromLocation()` restores `searchSeedQuery` from URL and `preservedSearchWindowScrollY` from history state, then calls `restoreSearchScrollPosition()`.
  - `selectSearchItem()` stores `preservedSearchWindowScrollY = window.scrollY`, syncs history, then routes through `selectItem()` to `/items/<id>`.
- Mobile proof selectors/state:
  - Before result click: `window.scrollY`, `#search-query`, URL query parameter `search`.
  - During detail: URL `/items/<id>`, `.detail-pane.active-panel .contract-inspector` visible.
  - After `history.back()`: `section[aria-label="Search and Retrieval"|"搜索与检索"]` visible, same `#search-query`, prior `window.scrollY`, same result text, and selected indication where practical.
- Non-durability seam:
  - `window.history.state` and URL query are acceptable ephemeral navigation primitives.
  - No `localStorage`, `sessionStorage`, state export, backend table, or settings surface may store search/session/restoration state.

## storage/URL/backend surfaces to prove non-durability

- Browser storage surfaces to inspect:
  - Allowed product key: `localStorage['resofeed.ownerToken']` for owner-token browser-local copy.
  - Test-only fixture key: `localStorage['resofeed.e2e.preAuthLanguage']` in test mode only; not a product setting.
  - Forbidden product keys: any key containing `history`, `reading`, `command`, `activity`, `search`, `session`, `settings`, `sync`, `merge`, `reingest`, `prompt`, `model`, `disclosure`, or `details` except the test-only fixture above.
  - `sessionStorage` should have no product state for search/detail/source disclosure/reingest.
- URL/history surfaces to inspect:
  - Allowed ephemeral search URL: `/?search=<query>` plus `window.history.state.surface === 'search'` and `searchScrollY`.
  - Allowed ephemeral item URL: `/items/<id>` for mobile Inspector route.
  - Forbidden URL surfaces: saved-search IDs, persistent session IDs, settings routes, history routes, activity routes, sync/merge routes, or durable search/session tokens.
- Frontend state-export surfaces to inspect:
  - `StatePortability.svelte` `exportState()` downloads `state.json` from backend `onExportState` only.
  - UI copy must remain `import replaces active sources, rules, and stars`.
  - Portable search/session/source-disclosure/reingest prompt/model/current-operation/agent receipt state is forbidden.
- Backend/API surfaces to inspect for proof only:
  - Allowed current-state APIs used here: `/api/feed/today`, `/api/items/{id}`, `/api/search`, `/api/steer`, `/api/steer/active`, `/api/sources`, `/api/runtime/language`, `/api/runtime/operation`, `/api/runtime/openrouter-models`, `/api/items/{id}/reingest`, `/api/state/export`, `/api/state/import`, `/api/doctor`.
  - Current operation snapshot is process-memory only per architecture; it must not become a job table or activity ledger.
  - Search is `GET /api/search` lexical response only; it must not create persistent sessions or saved searches.

## Explicit forbidden state and surface prohibitions

Downstream implementation and proof must not introduce any of the following:

- reading history;
- command history;
- activity ledger;
- persistent search sessions;
- settings surfaces or settings dashboards;
- sync/merge state;
- portable search state;
- portable session state;
- portable source-disclosure state;
- portable re-ingest prompt/model state;
- durable library-reprocess or item-reingest jobs/queues;
- agent-management dashboard, per-agent registry, or portable agent receipts.

## Current inventory conclusion

[Proven] The current frontend already has concrete seams for most approved surface families: token CSS, shell/menu, Feed, Inspector, item re-ingest, Source Ledger, State Portability, Search, Owner Token Prompt, First-Use Empty State, `/doctor`, mobile/narrow behavior, and agent/provenance markers.

[Proven] The highest-risk current gaps are not missing files; they are reader-flow contract mismatches: repeated `src:`/source-title prefixes, visible raw URLs in Inspector provenance anchors, missing fixed compact frontmatter order, incomplete dark-mode shell proof, and incomplete non-durable search/source-disclosure runtime proof.

[Proven] Language Control and `[REPROCESS LIBRARY]` are current global/library utility-menu controls in `+page.svelte`; they are not Inspector item controls. Inspector inventory includes only item-scoped `[RE-INGEST ITEM]` and temporary prompt/model behavior.
