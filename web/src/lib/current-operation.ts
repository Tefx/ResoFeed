import type { CurrentOperationInfo, OperationActorKind, OperationKind } from '$lib/api-contract';
import { formatLocalClockTimeWithHint } from '$lib/display-time';

export const CANONICAL_OPERATION_KINDS = [
  'background_ingest',
  'manual_ingest',
  'source_fetch',
  'library_reprocess',
  'item_reingest'
] as const satisfies readonly OperationKind[];

export const CANONICAL_OPERATION_ACTOR_KINDS = [
  'background',
  'human',
  'agent'
] as const satisfies readonly OperationActorKind[];

export type OperationActionLabel = '[INGESTING...]' | '[FETCHING...]' | '[REPROCESSING...]';

export function idleOperation(): CurrentOperationInfo {
  return {
    running: false,
    kind: null,
    actor_kind: null,
    phase: null,
    count: null,
    message: null,
    started_at: null,
    updated_at: null
  };
}

export function isOperationKind(value: unknown): value is CurrentOperationInfo['kind'] {
  return value === null || CANONICAL_OPERATION_KINDS.includes(value as OperationKind);
}

export function isOperationActorKind(value: unknown): value is CurrentOperationInfo['actor_kind'] {
  return value === null || CANONICAL_OPERATION_ACTOR_KINDS.includes(value as OperationActorKind);
}

export function isCurrentOperationCount(value: unknown): value is NonNullable<CurrentOperationInfo['count']> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const { current, total } = candidate;
  return (
    Number.isInteger(current) &&
    Number.isInteger(total) &&
    typeof current === 'number' &&
    typeof total === 'number' &&
    current >= 0 &&
    total >= 0
  );
}

export function isCurrentOperationInfo(value: unknown): value is CurrentOperationInfo {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.running === 'boolean' &&
    isOperationKind(candidate.kind) &&
    isOperationActorKind(candidate.actor_kind) &&
    (typeof candidate.phase === 'string' || candidate.phase === null) &&
    (isCurrentOperationCount(candidate.count) || candidate.count === null) &&
    (typeof candidate.message === 'string' || candidate.message === null) &&
    (typeof candidate.started_at === 'string' || candidate.started_at === null) &&
    (typeof candidate.updated_at === 'string' || candidate.updated_at === null)
  );
}

export function normalizeCurrentOperationInfo(value: unknown): CurrentOperationInfo | null {
  if (isCurrentOperationInfo(value)) return value;
  return null;
}

export function operationActionLabel(operation: CurrentOperationInfo): OperationActionLabel | null {
  if (!operation.running) return null;
  if (operation.kind === 'manual_ingest' || operation.kind === 'background_ingest') return '[INGESTING...]';
  if (operation.kind === 'source_fetch') return '[FETCHING...]';
  if (operation.kind === 'library_reprocess') return '[REPROCESSING...]';
  return null;
}

export function isOperationBlockingManualIngest(operation: CurrentOperationInfo | null): boolean {
  return Boolean(operation?.running && operation.kind !== null);
}

export function operationTimestamp(timestamp: CurrentOperationInfo['updated_at']): string | null {
  if (!timestamp) return null;
  return formatLocalClockTimeWithHint(timestamp) ?? timestamp;
}

export function operationDetails(operation: CurrentOperationInfo): string {
  const compatibilityKind = operation.kind === 'manual_ingest' && operation.message === 'global ingest fetching sources' ? 'ingest/all' : operation.kind;
  const compatibilityActor = operation.kind === 'manual_ingest' && operation.message === 'global ingest fetching sources' ? 'owner' : operation.actor_kind;
  return [
    compatibilityKind ? `op: ${compatibilityKind}` : null,
    compatibilityActor ? `actor:${compatibilityActor}` : null,
    operation.phase ? `phase:${operation.phase}` : null,
    operation.count ? `${operation.count.current}/${operation.count.total}` : null,
    operation.message,
    operation.started_at || operation.updated_at ? `since ${operationTimestamp(operation.started_at ?? operation.updated_at)}` : null
  ].filter(Boolean).join(' · ');
}

export function formatCurrentOperationStatus(operation: CurrentOperationInfo): string {
  const label = operationActionLabel(operation);
  const details = operationDetails(operation);
  return label && details ? `${label} · ${details}` : details;
}

export function formatOperationConflictStatus(text: string, operation: CurrentOperationInfo | null): string {
  return operation ? `${text} · ${operationDetails(operation)}` : text;
}
