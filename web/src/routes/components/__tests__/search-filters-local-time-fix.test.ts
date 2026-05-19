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
    expect(within(search).getByLabelText('Source filter')).toBeVisible();
    expect(within(search).getByLabelText('From date')).toBeVisible();
    expect(within(search).getByLabelText('Resonated only')).toBeVisible();
    expect(within(search).getByLabelText('Result limit')).toHaveValue('50');
  });
});
