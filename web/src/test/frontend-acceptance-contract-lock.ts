import type { FrontendAcceptanceContractLock } from '$lib/api-contract';

const canonicalHitTarget = {
  minWidthCssPx: 44,
  minHeightCssPx: 44,
  proof: ['center-point', 'safe-interior-offset', 'elementFromPoint-topmost'],
  disabledKeepsBounds: true,
  noPointerObstruction: true
} as const;

/**
 * Contract-only fixture expectations for srdct-frontend-contract-lock.
 *
 * This file intentionally has no Svelte component imports and no DOM mutation.
 * It pins frontend acceptance expectations for future rendered tests without
 * completing the UI behavior in this step.
 */
export const frontendAcceptanceContractLock = {
  steerRoutePreviewStates: [
    {
      state: 'idle-reserved-blank',
      previewSlotReserved: true,
      visiblePreviewText: null,
      forbiddenVisibleText: ['[IDLE]', 'Steer or paste RSS URL...', 'duplicate hint'],
      inputAriaDescribedBy: 'steer-route-preview-status',
      previewLiveRegion: 'off',
      receiptLiveRegion: 'polite',
      errorLiveRegion: 'assertive'
    },
    {
      state: 'focused-empty',
      previewSlotReserved: true,
      visiblePreviewText: null,
      forbiddenVisibleText: ['[IDLE]', 'duplicate hint'],
      inputAriaDescribedBy: 'steer-route-preview-status',
      previewLiveRegion: 'polite',
      receiptLiveRegion: 'polite',
      errorLiveRegion: 'assertive'
    },
    {
      state: 'previewing-route',
      previewSlotReserved: true,
      visiblePreviewText: 'route preview text only when command has a route',
      forbiddenVisibleText: ['[IDLE]', 'duplicate hint'],
      inputAriaDescribedBy: 'steer-route-preview-status',
      previewLiveRegion: 'polite',
      receiptLiveRegion: 'polite',
      errorLiveRegion: 'assertive'
    },
    {
      state: 'submitting',
      previewSlotReserved: true,
      visiblePreviewText: 'applying',
      forbiddenVisibleText: ['[IDLE]', 'spinner', 'progressbar'],
      inputAriaDescribedBy: 'steer-route-preview-status',
      previewLiveRegion: 'polite',
      receiptLiveRegion: 'polite',
      errorLiveRegion: 'assertive'
    },
    {
      state: 'applied',
      previewSlotReserved: true,
      visiblePreviewText: 'applied: <terse receipt>',
      forbiddenVisibleText: ['[IDLE]', 'chat transcript', 'rule builder'],
      inputAriaDescribedBy: 'steer-route-preview-status',
      previewLiveRegion: 'polite',
      receiptLiveRegion: 'polite',
      errorLiveRegion: 'assertive'
    },
    {
      state: 'rejected',
      previewSlotReserved: true,
      visiblePreviewText: 'err: <raw diagnostic>',
      forbiddenVisibleText: ['[IDLE]', 'friendly apology', 'toast'],
      inputAriaDescribedBy: 'steer-route-preview-status',
      previewLiveRegion: 'assertive',
      receiptLiveRegion: 'polite',
      errorLiveRegion: 'assertive'
    }
  ],
  sourceLedgerControls: [
    { label: '[RUN INGEST]', role: 'button', accessibleName: '[RUN INGEST]', hitTarget: canonicalHitTarget, liveRegion: 'polite' },
    { label: '[INGESTING...]', role: 'button', accessibleName: '[INGESTING...]', hitTarget: canonicalHitTarget, liveRegion: 'polite' },
    { label: '[FETCH]', role: 'button', accessibleName: 'Fetch source: <name>', hitTarget: canonicalHitTarget, liveRegion: 'polite' },
    { label: '[FETCHING...]', role: 'button', accessibleName: 'Fetch source: <name>', hitTarget: canonicalHitTarget, liveRegion: 'polite' },
    { label: '[DETAILS]', role: 'native-details-summary', accessibleName: 'Source diagnostics for: <name>', hitTarget: canonicalHitTarget, liveRegion: 'off' },
    { label: '[DELETE]', role: 'button', accessibleName: 'Delete source: <name>', hitTarget: canonicalHitTarget, liveRegion: 'assertive' },
    { label: '[IMPORT OPML]', role: 'keyboard-reachable-file-input', accessibleName: '[IMPORT OPML]', hitTarget: canonicalHitTarget, liveRegion: 'polite' },
    { label: '[IMPORTING OPML...]', role: 'button', accessibleName: '[IMPORTING OPML...]', hitTarget: canonicalHitTarget, liveRegion: 'polite' },
    { label: '[EXPORT STATE]', role: 'button', accessibleName: '[EXPORT STATE]', hitTarget: canonicalHitTarget, liveRegion: 'polite' },
    { label: '[EXPORTING STATE...]', role: 'button', accessibleName: '[EXPORTING STATE...]', hitTarget: canonicalHitTarget, liveRegion: 'polite' },
    { label: '[IMPORT STATE]', role: 'keyboard-reachable-file-input', accessibleName: '[IMPORT STATE]', hitTarget: canonicalHitTarget, liveRegion: 'polite' },
    { label: '[IMPORTING STATE...]', role: 'button', accessibleName: '[IMPORTING STATE...]', hitTarget: canonicalHitTarget, liveRegion: 'polite' }
  ],
  sourceLedgerDetailsDisclosure: {
    triggerLabel: '[DETAILS]',
    semantics: 'native-details-summary-or-button-with-aria-expanded',
    collapsedByDefault: true,
    diagnosticPlacement: 'labelled-disclosure-not-primary-copy',
    rawErrorPrefixPreserved: 'err:'
  },
  searchRetrieval: [
    {
      mode: 'lexical-fts-only',
      acceptedInputs: ['plain text', 'source', 'time', 'resonated'],
      forbiddenConcepts: ['RAG chat', 'semantic answer engine', 'embeddings', 'vector DB'],
      findAliasBehavior: 'warn-only-route-to-lexical-search',
      warningLiveRegion: 'polite'
    },
    {
      mode: 'find-alias-warning-only',
      acceptedInputs: ['plain text', 'source', 'time', 'resonated'],
      forbiddenConcepts: ['RAG chat', 'semantic answer engine', 'embeddings', 'vector DB'],
      findAliasBehavior: 'warn-only-route-to-lexical-search',
      warningLiveRegion: 'polite'
    }
  ],
  splitScroll: {
    desktop: {
      feedRegion: 'independent-focusable-scroll-region',
      inspectorRegion: 'independent-focusable-scroll-region',
      feedTabIndex: 0,
      inspectorTabIndex: 0,
      selectingItemPreservesFeedScroll: true,
      selectingItemResetsInspectorScrollTop: true
    },
    mobile: {
      inspectorPresentation: 'full-screen-route',
      backBehavior: 'returns-focus-and-preserves-feed-scroll',
      inspectorStarAllowed: 'mobile-route-only'
    }
  },
  processingLanguageLowChrome: {
    labels: ['LANG: EN', 'LANG: ZH', '语言: 英文', '语言: 中文', '[REPROCESS LIBRARY]', '[重处理资料库]'],
    controlStyle: 'bracket-action-or-equivalent-low-chrome-text-action',
    languageStates: ['English', 'Chinese', 'updating', 'failed'],
    reprocessStates: ['default', 'confirming', 'running', 'complete', 'conflict', 'failed'],
    runningDisablesWith: 'aria-disabled-not-native-disabled',
    liveRegion: 'polite',
    forbiddenConcepts: ['settings dashboard', 'job dashboard', 'activity log', 'queue view', 'onboarding wizard', 'preference center']
  },
  negativeUxForbiddenConcepts: [
    'settings dashboard',
    'job dashboard',
    'activity log',
    'queue view',
    'queues',
    'jobs',
    'dashboards',
    'operation history',
    'onboarding wizard',
    'preference center',
    'backup-management UI',
    'provider tabs',
    'marketplace UI',
    'folders',
    'tags',
    'unread counts',
    'mark-all-read',
    'archive bins',
    'sync/merge',
    'vector/RAG',
    'semantic answer engine',
    'AI-magic copy',
    'SaaS apology copy'
  ],
  runtimeRenderingIntentionallyAbsent: true
} satisfies FrontendAcceptanceContractLock;
