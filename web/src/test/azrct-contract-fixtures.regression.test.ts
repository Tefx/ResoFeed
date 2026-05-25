import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '..');

// Spec-Fixture Conformance: exact documented format from docs/ARCHITECTURE.md §5.5
// State bundle v1 field contract / JSON example (lines 674-733). This fixture
// intentionally contains no convenience fields beyond the documented schema.
const documentedStateBundleFixture = {
  schema_version: 'resofeed.state.v1',
  exported_at: '2026-05-09T00:00:00Z',
  sources: [
    {
      id: 'src_01',
      url: 'https://example.com/feed.xml',
      title: 'Example'
    }
  ],
  steer_rules: [
    {
      id: 'rule_01',
      rule_text: 'Push more technical documents.'
    }
  ],
  resonated_items: [
    {
      item_id: 'item_01',
      url: 'https://example.com/article',
      source_url: 'https://example.com/feed.xml',
      title: 'Example article'
    }
  ]
} as const;

describe('AZRCT closure static regression contracts', () => {
  test('state fixture uses the exact documented portable-state shape and excludes runtime processing_language', () => {
    expect(Object.keys(documentedStateBundleFixture)).toEqual([
      'schema_version',
      'exported_at',
      'sources',
      'steer_rules',
      'resonated_items'
    ]);
    expect(JSON.stringify(documentedStateBundleFixture)).not.toMatch(/processing_language|runtime_metadata|agent_receipts/u);
  });

  test('P2-preview-drift: docs/ui-preview.html shows LANG/reprocess surfaces and excerpt labels without stale partial copy', () => {
    const preview = fs.readFileSync(path.join(repoRoot, 'docs/ui-preview.html'), 'utf8');
    expect(preview).toMatch(/LANG: EN|LANG: ZH|语言: 英文|语言: 中文/u);
    expect(preview).toMatch(/\[REPROCESS LIBRARY\]|\[重处理资料库\]/u);
    expect(preview).toMatch(/source excerpt|excerpt|来源摘录|摘录/u);
    expect(preview).not.toMatch(/>\s*partial\s*</iu);
  });
});
