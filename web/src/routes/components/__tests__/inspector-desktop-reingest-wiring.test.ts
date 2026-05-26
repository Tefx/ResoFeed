import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Inspector from '../Inspector.svelte';
import { expectedRedItem } from '../../../test/contract-fixtures';

describe('desktop split-pane Inspector re-ingest wiring', () => {
  it('keeps the rendered desktop Inspector re-ingest affordance available', () => {
    render(Inspector, {
      props: {
        item: expectedRedItem,
        mode: 'desktop-split',
        language: 'zh',
        showReingest: true
      }
    });

    const inspector = screen.getByRole('complementary', { name: 'SQLite FTS 改变排序契约' });
    expect(within(inspector).getByLabelText('Item re-ingest')).toBeVisible();
    expect(within(inspector).getByRole('button', { name: '[重新处理本文]' })).toBeVisible();
  });

  it('wires desktop split-pane page state without depending on currentSurface === inspector', () => {
    const pageSource = readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf8');

    expect(pageSource).toContain("showReingest={!isNarrow || currentSurface === 'inspector'}");
    expect(pageSource).not.toContain("showReingest={currentSurface === 'inspector'}");
  });
});
