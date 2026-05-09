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
  value_tier: string | null;
  published_at: Rfc3339UtcString | null;
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

export type ApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: 400 | 401 | 404 | 500; body: ErrorBody };
