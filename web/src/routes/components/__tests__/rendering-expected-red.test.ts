import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import FeedContractStub from '../FeedContractStub.svelte';
import FirstUseEmptyState from '../FirstUseEmptyState.svelte';
import InspectorContractStub from '../InspectorContractStub.svelte';
import OwnerTokenPrompt from '../OwnerTokenPrompt.svelte';
import SearchRetrievalContractStub from '../SearchRetrievalContractStub.svelte';
import SourceLedgerContractStub from '../SourceLedgerContractStub.svelte';
import StatePortabilityContractStub from '../StatePortabilityContractStub.svelte';
import {
  expectedRedItem,
  expectedRedResonatedItem,
  expectedRedSource
} from '../../../test/contract-fixtures';

describe('expected-red rendering contracts from docs/DESIGN.md', () => {
  it('renders the owner-token prompt as the local access gate and exposes missing focus/submission behavior', async () => {
    const user = userEvent.setup();
    render(OwnerTokenPrompt, { props: { state: 'empty' } });

    expect(screen.getByText('RESOFEED')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Enter owner token' })).toBeVisible();

    const tokenInput = screen.getByLabelText('Owner token');
    expect(tokenInput).toHaveAttribute('type', 'password');
    expect(tokenInput).toHaveFocus();

    await user.type(tokenInput, 'rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG');
    await user.click(screen.getByRole('button', { name: 'submit' }));

    expect(window.localStorage.getItem('resofeed.ownerToken')).toBe(
      'rfeed_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG'
    );
  });

  it('renders owner-token rejection as an assertive accessible error', () => {
    render(OwnerTokenPrompt, { props: { state: 'rejected' } });

    expect(screen.getByRole('alert')).toHaveTextContent('err: owner token rejected');
    expect(screen.getByLabelText('Owner token')).toHaveFocus();
  });

  it('renders the first-use empty state with the required static loop copy', () => {
    render(FirstUseEmptyState, { props: { state: 'no-sources' } });

    const region = screen.getByRole('region', { name: 'TODAY' });
    expect(within(region).getByText('Paste RSS URL in Steer or import OPML.')).toBeVisible();
    expect(within(region).getByText('Inspect opens the item.')).toBeVisible();
    expect(within(region).getByText('Star preserves durable value.')).toBeVisible();
    expect(within(region).getByText('Steer is optional correction.')).toBeVisible();
    expect(within(region).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders feed rows with visible provenance and exposes missing keyboard inspect plus star toggle behavior', async () => {
    const user = userEvent.setup();
    render(FeedContractStub, {
      props: { items: [expectedRedItem, expectedRedResonatedItem], selectedItemId: expectedRedItem.id }
    });

    const feed = screen.getByRole('list', { name: 'Today feed contract items' });
    expect(within(feed).getByText('SQLite FTS changes ranking contract')).toBeVisible();
    expect(within(feed).getAllByLabelText('Source: Example Source')[0]).toBeVisible();
    expect(within(feed).getAllByLabelText('Extraction: partial_extraction')[0]).toBeVisible();
    expect(within(feed).getByLabelText('Externally surfaced by agent')).toBeVisible();

    const openButton = screen.getByRole('button', {
      name: 'Open Inspector for: SQLite FTS changes ranking contract'
    });
    openButton.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'SQLite FTS changes ranking contract' })).toHaveFocus();

    const star = screen.getByRole('button', { name: 'Resonate item' });
    await user.click(star);
    expect(star).toHaveAccessibleName('Remove resonance');
    expect(star).toHaveTextContent('★');
  });

  it('renders the inspector and exposes missing detail-focus/provenance completion', () => {
    render(InspectorContractStub, { props: { item: expectedRedItem, mode: 'desktop-split' } });

    const inspector = screen.getByRole('complementary', { name: 'SQLite FTS changes ranking contract' });
    expect(within(inspector).getByText('INSPECTOR')).toBeVisible();
    expect(within(inspector).getByRole('link', { name: 'original link' })).toHaveAttribute(
      'href',
      expectedRedItem.url
    );
    expect(within(inspector).getByText('partial')).toBeVisible();
    expect(within(inspector).getByText('why: fresh from configured source')).toBeVisible();
    expect(within(inspector).getByRole('heading', { name: expectedRedItem.title })).toHaveFocus();
  });

  it('renders the flat Source Ledger and exposes missing destructive confirmation behavior', async () => {
    const user = userEvent.setup();
    render(SourceLedgerContractStub, { props: { sources: [expectedRedSource] } });

    const ledger = screen.getByRole('region', { name: 'SOURCE LEDGER' });
    expect(within(ledger).getByRole('button', { name: 'import OPML' })).toBeVisible();
    expect(within(ledger).getByText(expectedRedSource.url)).toBeVisible();

    await user.click(within(ledger).getByRole('button', { name: 'Delete source: Example Source' }));
    expect(within(ledger).getByRole('button', { name: 'confirm delete source: Example Source' })).toBeVisible();
  });

  it('renders state portability warning and exposes missing import/export live feedback', async () => {
    const user = userEvent.setup();
    render(StatePortabilityContractStub, { props: { state: 'idle' } });

    const portability = screen.getByRole('region', { name: 'State Portability' });
    expect(
      within(portability).getByText('import replaces active sources, rules, and stars')
    ).toBeVisible();

    await user.click(within(portability).getByRole('button', { name: 'import state' }));
    expect(within(portability).getByLabelText('Choose state JSON')).toBeVisible();

    await user.click(within(portability).getByRole('button', { name: 'export state' }));
    expect(within(portability).getByRole('status')).toHaveTextContent('exported state.json');
  });

  it('renders search/retrieval and exposes missing filters plus provenance-rich result anatomy', () => {
    render(SearchRetrievalContractStub, { props: { items: [expectedRedItem], query: 'sqlite' } });

    const search = screen.getByRole('region', { name: 'Search and Retrieval' });
    expect(within(search).getByLabelText('Plain text query')).toHaveValue('sqlite');
    expect(within(search).getByLabelText('Source filter')).toBeVisible();
    expect(within(search).getByLabelText('From date')).toBeVisible();
    expect(within(search).getByLabelText('Resonated only')).toBeVisible();
    expect(within(search).getByRole('region', { name: 'Search results' })).toHaveTextContent('1 results');
    expect(within(search).getByText('match: summary')).toBeVisible();
    expect(within(search).getByText('src: Example Source')).toBeVisible();
  });
});
