import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { expectedRedItem } from '../../../test/contract-fixtures';
import SearchRetrieval from '../SearchRetrieval.svelte';

describe('SearchRetrieval filter disclosure', () => {
  it('keeps secondary filters collapsed initially while preserving explicit open behavior', async () => {
    const user = userEvent.setup();
    render(SearchRetrieval, {
      props: {
        items: [expectedRedItem],
        query: 'sqlite',
        sources: [{ id: 'src_expected', url: 'https://example.test/feed.xml', title: 'Expected Source', last_fetch_at: null, last_fetch_status: 'ok', last_fetch_error: null, is_active: true, revision: 1 }],
        onSearch: async () => ({
          items: [expectedRedItem],
          query: { q: 'sqlite', source: null, from: null, to: null, resonated: null, limit: 50 }
        })
      }
    });

    const search = screen.getByRole('region', { name: 'Search and Retrieval' });
    const summary = within(search).getByText('filters');
    const filters = summary.closest('details');
    expect(filters).toBeInstanceOf(HTMLDetailsElement);
    expect(filters).not.toHaveAttribute('open');
    expect(within(search).getByLabelText('Source filter')).not.toBeVisible();

    await user.click(summary);

    expect(filters).toHaveAttribute('open');
    const sourceFilter = within(search).getByLabelText('Source filter');
    expect(sourceFilter).toBeVisible();
    expect(sourceFilter.tagName).toBe('SELECT');
    expect(within(sourceFilter as HTMLSelectElement).getByRole('option', { name: 'All sources' })).toBeVisible();
    expect(within(sourceFilter as HTMLSelectElement).getByRole('option', { name: 'Expected Source' })).toBeVisible();
    const fromDate = within(search).getByLabelText('From date');
    expect(fromDate).toBeVisible();
    expect(fromDate).toHaveAttribute('type', 'text');
    expect(fromDate).toHaveAttribute('placeholder', 'YYYY-MM-DD');
    const toDate = within(search).getByLabelText('To date');
    expect(toDate).toHaveAttribute('type', 'text');
    expect(toDate).toHaveAttribute('placeholder', 'YYYY-MM-DD');
    expect(within(search).getByLabelText('Resonated only')).toBeVisible();
    expect(within(search).getByLabelText('Result limit')).toHaveValue('50');
  });
});
