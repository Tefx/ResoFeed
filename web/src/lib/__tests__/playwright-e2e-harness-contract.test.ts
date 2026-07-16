import { describe, expect, it } from 'vitest';
import {
  hasExactLaneFiles,
  redactHarnessEvidence,
  RF_BUG_010_IDENTITIES,
  RF_BUG_010_OLD_LANE,
  RF_BUG_010_REPLACEMENT_LANE
} from '../playwright-e2e-harness-contract';

describe('RF-BUG-010 harness contract', () => {
  it('pins the repaired generic selected/executed identity set', () => {
    expect(RF_BUG_010_IDENTITIES).toEqual([
      'RF-BUG-010 adapter-envelope',
      'RF-BUG-010 artifact-contract',
      'RF-BUG-010 harness-isolation',
      'RF-BUG-010 lane-discovery'
    ]);
    expect(new Set(RF_BUG_010_IDENTITIES).size).toBe(4);
  });

  it('pins the old-three and replacement-five native file sets', () => {
    expect(hasExactLaneFiles([...RF_BUG_010_OLD_LANE], RF_BUG_010_OLD_LANE)).toBe(true);
    expect(hasExactLaneFiles([...RF_BUG_010_REPLACEMENT_LANE], RF_BUG_010_REPLACEMENT_LANE)).toBe(true);
    expect(RF_BUG_010_OLD_LANE).toHaveLength(3);
    expect(RF_BUG_010_REPLACEMENT_LANE).toHaveLength(5);
    expect(hasExactLaneFiles([...RF_BUG_010_OLD_LANE, 'extra.spec.ts'], RF_BUG_010_OLD_LANE)).toBe(false);
  });

  it('redacts credentials from runtime, browser, and URL evidence', () => {
    const evidence = [
      'rfeed_owner_123 sk-or-v1-secret Authorization: Bearer abc',
      'Cookie=session',
      'OPENROUTER_KEY=value TAVILY_API_KEY=value',
      'https://user:pass@example.test/path?token=abc'
    ].join('\n');
    const redacted = redactHarnessEvidence(evidence);
    expect(redacted).not.toMatch(/owner_123|sk-or-v1-secret|Bearer abc|session|=value|user:pass|token=abc/u);
    expect(redacted.match(/<redacted>/gu)).toHaveLength(8);
  });
});
