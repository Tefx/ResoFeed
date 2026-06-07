/** Canonical frontend API contracts from docs/ARCHITECTURE.md §6. */
export type Rfc3339UtcString = string;
export type CalendarDateString = string;
export type OpaqueId = string;

export type ApiErrorCode = 'unauthorized' | 'bad_request' | 'not_found' | 'conflict' | 'provider_unavailable' | 'internal';

export type OperationKind = 'background_ingest' | 'manual_ingest' | 'source_fetch' | 'library_reprocess' | 'item_reingest';
export type OperationActorKind = 'background' | 'human' | 'agent';

export interface CurrentOperationCount {
  current: number;
  total: number;
}

export interface CurrentOperationInfo {
  running: boolean;
  kind: OperationKind | null;
  actor_kind: OperationActorKind | null;
  phase: string | null;
  count: CurrentOperationCount | null;
  message: string | null;
  started_at: Rfc3339UtcString | null;
  updated_at: Rfc3339UtcString | null;
}

export interface CurrentOperationResponse {
  operation: CurrentOperationInfo;
}

export type ApiErrorDetailValue = string | number | boolean | null | CurrentOperationInfo;

export interface ErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details: Record<string, ApiErrorDetailValue>;
  };
}

export type ExtractionStatus = 'full' | 'partial_extraction' | 'summary_unavailable' | 'original_unavailable';
export const extractionSourceValues = ['local_readable', 'feed_excerpt', 'external_tavily', 'none'] as const;
export type ExtractionSource = (typeof extractionSourceValues)[number];
export const modelStatusValues = [
  'ok',
  'summary_unavailable',
  'model_latency_error',
  'invalid_model',
  'provider_error',
  'rate_limited',
  'decode_error',
  'timeout'
] as const;
export type ModelStatus = (typeof modelStatusValues)[number];
export type ContentStatus = 'ok' | 'summary_unavailable';
export type LastReprocessStatus = 'ok' | 'failed' | null;
export type LastReprocessErrorCode = ReprocessErrorCode | null;
export type ActorKind = 'human' | 'agent';
export type ProcessingLanguage = 'en' | 'zh';

export interface ItemSummary {
  id: OpaqueId;
  source_id: OpaqueId;
  source_title: string;
  url: string;
  /** Literal RSS/source item title; provenance, not localized or rewritten. */
  source_item_title: string;
  /** Generated display title when available; null when no current generated title exists. */
  localized_title: string | null;
  title: string;
  summary: string | null;
  core_insight: string | null;
  /** Structured generated key points; never derived from summary/core_insight Markdown. */
  key_points: string[];
  display_excerpt?: string | null;
  value_tier: string | null;
  /** Status of currently persisted generated content, not the latest attempt. */
  content_status: ContentStatus;
  /** Latest reprocess/re-ingest attempt status; null when no attempt has run. */
  last_reprocess_status: LastReprocessStatus;
  last_reprocess_error_code: LastReprocessErrorCode;
  last_reprocess_error_message: string | null;
  last_reprocess_at: Rfc3339UtcString | null;
  published_at: Rfc3339UtcString | null;
  first_seen_at?: Rfc3339UtcString | null;
  extraction_status: ExtractionStatus;
  /** Current source-evidence origin; provenance for source acquisition, not a history log. */
  extraction_source: ExtractionSource;
  model_status: ModelStatus;
  is_resonated: boolean;
  human_inspected_at: Rfc3339UtcString | null;
  external_surfaced_at: Rfc3339UtcString | null;
  story_key: string | null;
  duplicate_of_item_id: OpaqueId | null;
}

export interface Provenance {
  source_url: string;
  canonical_url: string | null;
  original_url: string;
  story_key: string | null;
  duplicate_of_item_id: OpaqueId | null;
  grouped_source_items: GroupedSourceItem[];
}

export interface GroupedSourceItem {
  item_id: OpaqueId;
  source_id: OpaqueId;
  source_title: string;
  source_url: string;
  url: string;
  source_item_title?: string;
  localized_title?: string | null;
  canonical_url: string | null;
  title: string;
  published_at: Rfc3339UtcString | null;
  first_seen_at: Rfc3339UtcString | null;
  extraction_status: ExtractionStatus;
  model_status: ModelStatus;
  story_key: string | null;
  duplicate_of_item_id: OpaqueId | null;
  is_selected_item: boolean;
}

export interface ItemDetail extends ItemSummary {
  feed_excerpt: string | null;
  /** Source-backed audit evidence only; never generated summary/core/key-points/feed display text. */
  source_evidence_text: string | null;
  extracted_text: string | null;
  provenance: Provenance;
}

export function itemDisplayTimestamp(item: ItemSummary): Rfc3339UtcString | null {
  return item.published_at ?? item.first_seen_at ?? null;
}

export function itemDisplayExcerpt(item: ItemSummary): string | null {
  return item.summary ?? item.core_insight ?? item.display_excerpt ?? null;
}

export type LastFetchStatus = 'ok' | 'rss_fetch_error' | 'not_fetched';

export interface Source {
  id: OpaqueId;
  url: string;
  title: string;
  last_fetch_at: Rfc3339UtcString | null;
  last_fetch_status: LastFetchStatus;
  last_fetch_error?: string | null;
  is_active: boolean;
  revision: number;
}

export interface SteerRule {
  id: OpaqueId;
  rule_text: string;
  is_active: boolean;
  superseded_by: OpaqueId | null;
  revision: number;
  created_by_actor_kind?: ActorKind;
  created_by_actor_id?: string;
}

export interface SearchQueryEcho {
  q: string;
  source: string | null;
  from: CalendarDateString | null;
  to: CalendarDateString | null;
  resonated: boolean | null;
  limit: number;
}

export interface ProcessingLanguageInfo {
  code: ProcessingLanguage;
  /** Contract labels: en -> English, zh -> 中文. */
  label: 'English' | '中文';
}

export interface ProcessingLanguageResponse {
  language: ProcessingLanguageInfo;
  already_applied?: boolean;
}

export interface OpenRouterModelOption {
  id: string;
  name: string;
}

export interface OpenRouterModelListResponse {
  models: OpenRouterModelOption[];
}

export interface SetProcessingLanguageRequest {
  language: ProcessingLanguage;
  actor_kind: ActorKind;
  actor_id: string;
  idempotency_key: string;
}

export type ReprocessStatus = 'completed' | 'completed_with_errors' | 'failed';

export type ReprocessErrorCode =
  | 'rss_fetch_error'
  | 'model_latency_error'
  | 'summary_unavailable'
  | 'original_unavailable'
  | 'timeout'
  | 'invalid_model'
  | 'provider_error'
  | 'rate_limited'
  | 'decode_error'
  | 'internal';

export interface ReprocessErrorDetail {
  item_id: OpaqueId | null;
  code: ReprocessErrorCode;
  /** Terse diagnostic, max 200 chars. */
  message: string;
}

export interface ReprocessLibraryRequest {
  actor_kind: ActorKind;
  actor_id: string;
  idempotency_key: string;
}

export interface ReprocessLibraryResult {
  status: ReprocessStatus;
  language: ProcessingLanguage;
  started_at: Rfc3339UtcString;
  completed_at: Rfc3339UtcString;
  items_attempted: number;
  items_updated: number;
  items_indexed: number;
  items_unavailable: number;
  items_failed: number;
  items_preserved_failures?: number;
  fts_rebuilt: boolean;
  fts_stale?: boolean;
  errors: ReprocessErrorDetail[];
}

export interface ReprocessLibraryResponse {
  reprocess: ReprocessLibraryResult;
  already_applied: boolean;
}

export interface DeliveryReportRequest {
  actor_kind: ActorKind;
  actor_id: string;
  delivered_at: Rfc3339UtcString;
  idempotency_key: string;
}

export interface DeliveryReportResponse {
  item_id: OpaqueId;
  external_surfaced_at: Rfc3339UtcString;
  already_applied: boolean;
}

export const processingLanguageRuntimeContract = {
  endpoints: {
    getLanguage: 'GET /api/runtime/language',
    setLanguage: 'PUT /api/runtime/language',
    currentOperation: 'GET /api/runtime/operation',
    openRouterModels: 'GET /api/runtime/openrouter-models',
    reprocessLibrary: 'POST /api/runtime/reprocess-library',
    reportDelivery: 'POST /api/items/{id}/delivery',
    searchEcho: 'GET /api/search',
    doctorFTS: 'GET /api/doctor'
  },
  mcp: {
    resource: 'resofeed://runtime/language',
    tools: ['get_processing_language', 'set_processing_language', 'reprocess_library', 'report_delivery', 'search_items']
  },
  runtimeMetadata: {
    processingLanguageKey: 'processing_language',
    effectiveDefault: 'en',
    searchFTSStaleSinceKey: 'search_fts_stale_since',
    exportImport: 'excluded'
  },
  strictValidation: {
    unknownJsonBodyFields: '400 bad_request',
    unknownOrDuplicateQueryParams: '400 bad_request',
    idempotencyReplay: 'same live key and same request fingerprint replays stored result',
    idempotencyMismatch: 'same live key and different request fingerprint returns bad_request'
  },
  sourceIdentifierNonTranslation: [
    'url',
    'source_title',
    'provenance.source_url',
    'provenance.canonical_url',
    'provenance.original_url'
  ],
  forbiddenPatterns: [
    'settings-dashboard',
    'per-item-language-toggle',
    'side-by-side-translation',
    'translation_failed-state',
    'durable-reprocess-job',
    'queue',
    'activity-ledger',
    'sync-merge-protocol',
    'vector-index'
  ]
} as const;

export interface StateBundleV1 {
  schema_version: 'resofeed.state.v1';
  exported_at: Rfc3339UtcString;
  sources: SourceState[];
  steer_rules: SteerRuleState[];
  resonated_items: ResonatedItemState[];
}

export interface SourceState {
  id: OpaqueId;
  url: string;
  title: string;
}

export interface SteerRuleState {
  id: OpaqueId;
  rule_text: string;
}

export interface ResonatedItemState {
  item_id: OpaqueId;
  url: string;
  source_url: string;
  title: string | null;
}

export interface RestoreResult {
  restored: {
    sources: number;
    steer_rules: number;
    resonated_items: number;
  };
}

export interface FeedTodayResponse {
  items: ItemSummary[];
}

export interface ItemDetailResponse {
  item: ItemDetail;
}

export interface SourcesResponse {
  sources: Source[];
}

export interface SearchResponse {
  items: ItemSummary[];
  query: SearchQueryEcho;
}

export interface InspectRequest {
  actor_kind: ActorKind;
  actor_id: string;
  idempotency_key: string;
}

export interface InspectResponse {
  item_id: OpaqueId;
  human_inspected_at: Rfc3339UtcString;
  already_applied: boolean;
}

export interface ResonanceRequest extends InspectRequest {
  resonated: boolean;
}

export interface ResonanceResponse {
  item_id: OpaqueId;
  is_resonated: boolean;
  already_applied: boolean;
}

export interface ItemReingestRequest extends InspectRequest {
  /** null means use the server/runtime default model; never serialize an empty string for default. */
  model: string | null;
  /** One-time retry instruction only; not durable runtime or browser state. */
  prompt: string | null;
}

export type ItemReingestStatus = ReprocessStatus;

export interface ItemReingestResult {
  item_id: OpaqueId;
  status: ItemReingestStatus;
  language: ProcessingLanguage;
  item_updated: boolean;
  fts_updated: boolean;
  error: ReprocessErrorDetail | null;
  item: ItemDetail | null;
}

export interface ItemReingestResponse {
  already_applied: boolean;
  reingest: ItemReingestResult;
}

export interface SteerRequest extends InspectRequest {
  command: string;
}

export interface SteerReceipt {
  interpreted_as: string;
  changed_rules: SteerRule[];
  message: string;
  revocable_id?: OpaqueId | null;
  undo_target_kind?: 'steer_rule' | 'source' | null;
  undo_target_id?: OpaqueId | null;
}

export interface SteerUndoHandle {
  route_kind: SteerPreviewRouteKind;
  target: { kind: 'steer_rule' | 'source'; id: OpaqueId } | null;
  revision?: number | null;
}

export interface SteerResponse {
  receipt: SteerReceipt;
  undo_handle?: SteerUndoHandle | null;
}

export type SteerPreviewRouteKind = 'policy' | 'source' | 'search' | 'doctor' | 'invariant_conflict' | 'unknown';

export interface SteerPreview {
  route_kind: SteerPreviewRouteKind;
  interpreted_as: string;
  will_mutate: boolean;
  changed_rules: SteerRule[];
  message: string;
}

export interface SteerPreviewRequest {
  command: string;
  actor_kind: ActorKind;
  actor_id: string;
}

export interface SteerPreviewResponse {
  preview: SteerPreview;
}

export interface SteerUndoRequest extends InspectRequest {
  target_kind: 'steer_rule' | 'source';
  target_id: OpaqueId;
}

export interface SteerUndoResult {
  target_kind: 'steer_rule' | 'source';
  target_id: OpaqueId;
  undone: boolean;
  message: string;
  already_applied: boolean;
}

export interface RulesResponse {
  rules: SteerRule[];
}

export interface DeleteSourceResponse {
  source_id: OpaqueId;
  deleted: true;
  revision: number;
}

export interface ImportOpmlResponse {
  imported: number;
  skipped: number;
  folders_flattened: true;
}

/**
 * Manual RSS Fetch frontend contract lock.
 *
 * Acceptance-only schema declarations from the frontend-contract step. These
 * types intentionally do not add live API-client methods, DOM transitions, or
 * styling. The step description is authoritative for the two new POST routes;
 * docs/ARCHITECTURE.md §6 does not yet list them and only allows the common
 * error codes, while this step explicitly requires 409 conflict handling.
 */
export type EmptyJsonObject = { readonly [key: string]: never };

export const manualRssFetchEndpoints = {
  runIngest: '/api/ingest',
  fetchSource: '/api/sources/{id}/fetch'
} as const;

export type ManualRssFetchEndpointPath =
  | typeof manualRssFetchEndpoints.runIngest
  | typeof manualRssFetchEndpoints.fetchSource;

export interface ManualRssFetchRequestContract {
  readonly method: 'POST';
  readonly queryParams: false;
  readonly body: EmptyJsonObject;
}

export type ManualRssFetchErrorCode = ApiErrorCode | 'conflict';

export interface ManualRssFetchErrorBody {
  error: {
    code: ManualRssFetchErrorCode;
    message: string;
    details: Record<string, ApiErrorDetailValue>;
  };
}

export type ManualFetchStatus = 'idle' | 'fetching' | 'ok' | 'rss_fetch_error' | 'not_found';

export interface ManualFetchSourceError {
  source_id: OpaqueId | null;
  code: string;
  reason: string;
  message: string;
}

export type IngestRunStatus = 'completed' | 'completed_with_errors' | 'failed';

export interface IngestRunResult {
  scope: 'all' | 'source';
  source_id: OpaqueId | null;
  status: IngestRunStatus;
  started_at: Rfc3339UtcString;
  completed_at: Rfc3339UtcString;
  duration_ms?: number;
  sources_attempted: number;
  sources_succeeded: number;
  sources_failed: number;
  sources_skipped: number;
  items_discovered?: number;
  items_upserted: number;
  errors: ManualFetchSourceError[];
}

export interface ManualFetchResult {
  operation: 'ingest' | 'source_fetch';
  source_id: OpaqueId | null;
  completed: boolean;
  sources_total: number;
  sources_fetched: number;
  items_discovered: number;
  items_upserted: number;
  errors: ManualFetchSourceError[];
  completed_at?: Rfc3339UtcString;
  scope?: IngestRunResult['scope'];
  status?: IngestRunStatus;
  started_at?: Rfc3339UtcString;
  duration_ms?: number;
  sources_attempted?: number;
  sources_succeeded?: number;
  sources_failed?: number;
  sources_skipped?: number;
}

export type RunIngestSuccessResponse = ManualFetchResult;

export type FetchSourceSuccessResponse = ManualFetchResult;

export type ManualRssFetchApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: 404 | 409; body: ManualRssFetchErrorBody };

export interface SourceLedgerManualFetchRenderContract {
  readonly globalIdleLabel: null;
  readonly globalActiveLabel: null;
  readonly sourceIdleLabel: null;
  readonly sourceActiveLabel: null;
  readonly activeControlDisabled: false;
  readonly timestampFormat: 'HH:MM:SS';
  readonly timestampInputs: readonly ['last_fetch'];
  readonly diagnosticDisclosure: 'source info / 来源信息';
  readonly diagnosticDisclosureStyle: 'low-chrome-native-disclosure-not-bracket-command';
  readonly bracketActionStyle: 'bracket-padding-uppercase-terminal-hover-inversion-focus-visible';
  readonly accessibility: readonly [
    'native-details-summary',
    'named-delete-control',
    'visible-diagnostic-disclosure',
    'visible-keyboard-focus'
  ];
  readonly forbiddenPatterns: readonly [
    'spinner',
    'progress-animation',
    'box-shadow',
    'rounded-saas-button',
    'friendly-copy',
    'folder-affordance',
    'tag-affordance',
    'unread-count',
    'archive-affordance',
    'settings-slider',
    'drag-and-drop-ordering',
    'local-fake-job',
    'client-queue',
    'client-receipt',
    'optimistic-durable-state'
  ];
}

export const sourceLedgerManualFetchRenderContract: SourceLedgerManualFetchRenderContract = {
  globalIdleLabel: null,
  globalActiveLabel: null,
  sourceIdleLabel: null,
  sourceActiveLabel: null,
  activeControlDisabled: false,
  timestampFormat: 'HH:MM:SS',
  timestampInputs: ['last_fetch'],
  diagnosticDisclosure: 'source info / 来源信息',
  diagnosticDisclosureStyle: 'low-chrome-native-disclosure-not-bracket-command',
  bracketActionStyle: 'bracket-padding-uppercase-terminal-hover-inversion-focus-visible',
  accessibility: [
    'native-details-summary',
    'named-delete-control',
    'visible-diagnostic-disclosure',
    'visible-keyboard-focus'
  ],
  forbiddenPatterns: [
    'spinner',
    'progress-animation',
    'box-shadow',
    'rounded-saas-button',
    'friendly-copy',
    'folder-affordance',
    'tag-affordance',
    'unread-count',
    'archive-affordance',
    'settings-slider',
    'drag-and-drop-ordering',
    'local-fake-job',
    'client-queue',
    'client-receipt',
    'optimistic-durable-state'
  ]
};

/**
 * Frontend acceptance contract lock for route/fixture tests only.
 *
 * These declarations intentionally pin state expectations without implementing
 * rendered UI behavior. They are derived from docs/DESIGN.md Steer Input,
 * Source Ledger, Search and Retrieval, Desktop Split Scroll, Language Control,
 * Reprocess Library Action, and docs/UI_REGRESSION_CONTRACT.md hit-target and
 * negative UX assertions.
 */
export type LiveRegionLevel = 'off' | 'polite' | 'assertive';

export type SteerRoutePreviewState =
  | 'idle-reserved-blank'
  | 'focused-empty'
  | 'previewing-route'
  | 'submitting'
  | 'applied'
  | 'rejected';

export interface SteerRoutePreviewStateExpectation {
  readonly state: SteerRoutePreviewState;
  readonly previewSlotReserved: boolean;
  readonly visiblePreviewText: string | null;
  readonly forbiddenVisibleText: readonly string[];
  readonly inputAriaDescribedBy: 'steer-route-preview-status';
  readonly previewLiveRegion: LiveRegionLevel;
  readonly receiptLiveRegion: LiveRegionLevel;
  readonly errorLiveRegion: LiveRegionLevel;
}

export type SourceLedgerActionLabel =
  | '[RUN INGEST]'
  | '[INGESTING...]'
  | '[FETCH]'
  | '[FETCHING...]'
  | '[DELETE]'
  | '[IMPORT OPML]'
  | '[IMPORTING OPML...]'
  | '[EXPORT STATE]'
  | '[EXPORTING STATE...]'
  | '[IMPORT STATE]'
  | '[IMPORTING STATE...]';

export interface BracketHitTargetExpectation {
  readonly minWidthCssPx: 44;
  readonly minHeightCssPx: 44;
  readonly proof: readonly ['center-point', 'safe-interior-offset', 'elementFromPoint-topmost'];
  readonly disabledKeepsBounds: true;
  readonly noPointerObstruction: true;
}

export interface SourceLedgerControlExpectation {
  readonly label: SourceLedgerActionLabel;
  readonly role: 'button' | 'native-details-summary' | 'keyboard-reachable-file-input';
  readonly accessibleName: string;
  readonly hitTarget: BracketHitTargetExpectation;
  readonly liveRegion: LiveRegionLevel;
}

export interface SourceLedgerDetailsDisclosureExpectation {
  readonly triggerLabels: readonly ['source info', '来源信息'];
  readonly semantics: 'native-details-summary-or-button-with-aria-expanded';
  readonly collapsedByDefault: true;
  readonly diagnosticPlacement: 'labelled-disclosure-not-primary-copy';
  readonly visualStyle: 'low-chrome-not-bracket-command';
  readonly rawErrorPrefixPreserved: 'err:';
}

export type SearchRetrievalMode = 'lexical-fts-only' | 'find-alias-warning-only';

export interface SearchRetrievalFixtureExpectation {
  readonly mode: SearchRetrievalMode;
  readonly acceptedInputs: readonly ['plain text', 'source', 'time', 'resonated'];
  readonly forbiddenConcepts: readonly ['RAG chat', 'semantic answer engine', 'embeddings', 'vector DB'];
  readonly findAliasBehavior: 'warn-only-route-to-lexical-search';
  readonly warningLiveRegion: 'polite';
}

export interface SplitScrollFixtureExpectation {
  readonly desktop: {
    readonly feedRegion: 'independent-focusable-scroll-region';
    readonly inspectorRegion: 'independent-focusable-scroll-region';
    readonly feedTabIndex: 0;
    readonly inspectorTabIndex: 0;
    readonly selectingItemPreservesFeedScroll: true;
    readonly selectingItemResetsInspectorScrollTop: true;
  };
  readonly mobile: {
    readonly inspectorPresentation: 'full-screen-route';
    readonly backBehavior: 'returns-focus-and-preserves-feed-scroll';
    readonly inspectorStarAllowed: 'mobile-route-only';
  };
}

export type ProcessingControlLabel = 'LANG: EN' | 'LANG: ZH' | '语言: 英文' | '语言: 中文' | '[REPROCESS LIBRARY]' | '[重处理资料库]';

export interface ProcessingLanguageLowChromeExpectation {
  readonly labels: readonly ProcessingControlLabel[];
  readonly controlStyle: 'bracket-action-or-equivalent-low-chrome-text-action';
  readonly languageStates: readonly ['English', 'Chinese', 'updating', 'failed'];
  readonly reprocessStates: readonly ['default', 'confirming', 'running', 'complete', 'conflict', 'failed'];
  readonly runningDisablesWith: 'aria-disabled-not-native-disabled';
  readonly liveRegion: 'polite';
  readonly forbiddenConcepts: readonly ['settings dashboard', 'job dashboard', 'activity log', 'queue view', 'onboarding wizard', 'preference center'];
}

export interface FrontendAcceptanceContractLock {
  readonly steerRoutePreviewStates: readonly SteerRoutePreviewStateExpectation[];
  readonly sourceLedgerControls: readonly SourceLedgerControlExpectation[];
  readonly sourceLedgerDetailsDisclosure: SourceLedgerDetailsDisclosureExpectation;
  readonly searchRetrieval: readonly SearchRetrievalFixtureExpectation[];
  readonly splitScroll: SplitScrollFixtureExpectation;
  readonly processingLanguageLowChrome: ProcessingLanguageLowChromeExpectation;
  readonly negativeUxForbiddenConcepts: readonly string[];
  readonly runtimeRenderingIntentionallyAbsent: true;
}

export type ApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: 400 | 401 | 404 | 409 | 500 | 503; body: ErrorBody };
