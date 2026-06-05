import { describe, expect, it } from 'vitest';

import { frontendAcceptanceContractLock } from '../test/frontend-acceptance-contract-lock';

describe('frontend acceptance contract lock fixtures', () => {
  it('pins Steer route preview idle semantics, aria-describedby, and live-region levels', () => {
    const idle = frontendAcceptanceContractLock.steerRoutePreviewStates.find((state) => state.state === 'idle-reserved-blank');

    expect(idle).toMatchObject({
      previewSlotReserved: true,
      visiblePreviewText: null,
      inputAriaDescribedBy: 'steer-route-preview-status',
      previewLiveRegion: 'off',
      receiptLiveRegion: 'polite',
      errorLiveRegion: 'assertive'
    });
    expect(idle?.forbiddenVisibleText).toEqual(expect.arrayContaining(['[IDLE]', 'duplicate hint']));
  });

  it('pins Source Ledger bracket controls, source-info disclosure, OPML/state actions, and 44px targets', () => {
    const labels = frontendAcceptanceContractLock.sourceLedgerControls.map((control) => control.label);

    expect(labels).toEqual(expect.arrayContaining([
      '[RUN INGEST]',
      '[FETCH]',
      '[DELETE]',
      '[IMPORT OPML]',
      '[EXPORT STATE]',
      '[IMPORT STATE]'
    ]));
    expect(labels).not.toContain('[DETAILS]');
    for (const control of frontendAcceptanceContractLock.sourceLedgerControls) {
      expect(control.hitTarget).toMatchObject({ minWidthCssPx: 44, minHeightCssPx: 44, disabledKeepsBounds: true });
      expect(control.hitTarget.proof).toEqual(expect.arrayContaining(['elementFromPoint-topmost']));
    }
    expect(frontendAcceptanceContractLock.sourceLedgerDetailsDisclosure).toMatchObject({
      triggerLabels: ['source info', '来源信息'],
      collapsedByDefault: true,
      visualStyle: 'low-chrome-not-bracket-command',
      rawErrorPrefixPreserved: 'err:'
    });
  });

  it('pins lexical-only search/no-RAG and warning-only find alias expectations', () => {
    expect(frontendAcceptanceContractLock.searchRetrieval).toHaveLength(2);
    for (const expectation of frontendAcceptanceContractLock.searchRetrieval) {
      expect(expectation.acceptedInputs).toEqual(['plain text', 'source', 'time', 'resonated']);
      expect(expectation.forbiddenConcepts).toEqual(expect.arrayContaining(['RAG chat', 'semantic answer engine', 'embeddings', 'vector DB']));
      expect(expectation.findAliasBehavior).toBe('warn-only-route-to-lexical-search');
      expect(expectation.warningLiveRegion).toBe('polite');
    }
  });

  it('pins desktop independent scroll and mobile full-screen Inspector route expectations', () => {
    expect(frontendAcceptanceContractLock.splitScroll.desktop).toEqual({
      feedRegion: 'independent-focusable-scroll-region',
      inspectorRegion: 'independent-focusable-scroll-region',
      feedTabIndex: 0,
      inspectorTabIndex: 0,
      selectingItemPreservesFeedScroll: true,
      selectingItemResetsInspectorScrollTop: true
    });
    expect(frontendAcceptanceContractLock.splitScroll.mobile).toMatchObject({
      inspectorPresentation: 'full-screen-route',
      backBehavior: 'returns-focus-and-preserves-feed-scroll',
      inspectorStarAllowed: 'mobile-route-only'
    });
  });

  it('pins low-chrome processing language/reprocess controls and forbidden concepts', () => {
    expect(frontendAcceptanceContractLock.processingLanguageLowChrome.labels).toEqual(expect.arrayContaining([
      'LANG: EN',
      'LANG: ZH',
      '[REPROCESS LIBRARY]'
    ]));
    expect(frontendAcceptanceContractLock.processingLanguageLowChrome.runningDisablesWith).toBe('aria-disabled-not-native-disabled');
    expect(frontendAcceptanceContractLock.processingLanguageLowChrome.forbiddenConcepts).toEqual(expect.arrayContaining([
      'settings dashboard',
      'job dashboard',
      'activity log'
    ]));
    expect(frontendAcceptanceContractLock.runtimeRenderingIntentionallyAbsent).toBe(true);
  });
});
