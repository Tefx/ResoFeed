/** Canonical frontend API contracts from docs/ARCHITECTURE.md §6. */
export type Rfc3339UtcString = string;
export type CalendarDateString = string;
export type OpaqueId = string;

export type ApiErrorCode = 'unauthorized' | 'bad_request' | 'not_found' | 'internal';

export interface ErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details: Record<string, string | number | boolean>;
  };
}

export type ExtractionStatus = 'full' | 'partial_extraction' | 'summary_unavailable' | 'original_unavailable';
export type ModelStatus = 'ok' | 'summary_unavailable' | 'model_latency_error';
export type ActorKind = 'human' | 'agent';

export interface ItemSummary {
  id: OpaqueId;
  source_id: OpaqueId;
  source_title: string;
  url: string;
  title: string;
  summary: string | null;
  core_insight: string | null;
  display_excerpt?: string | null;
  value_tier: string | null;
  published_at: Rfc3339UtcString | null;
  first_seen_at?: Rfc3339UtcString | null;
  extraction_status: ExtractionStatus;
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
}

export interface ItemDetail extends ItemSummary {
  feed_excerpt: string | null;
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

export interface SteerRequest extends InspectRequest {
  command: string;
}

export interface SteerReceipt {
  interpreted_as: string;
  changed_rules: SteerRule[];
  message: string;
}

export interface SteerResponse {
  receipt: SteerReceipt;
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
    details: Record<string, string | number | boolean>;
  };
}

export type ManualFetchStatus = 'idle' | 'fetching' | 'ok' | 'rss_fetch_error' | 'not_found';

export interface ManualFetchSourceError {
  source_id: OpaqueId;
  code: string;
  message: string;
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
  readonly diagnosticDisclosure: '[DETAILS]';
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
  diagnosticDisclosure: '[DETAILS]',
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

export type ApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: 400 | 401 | 404 | 500; body: ErrorBody };
