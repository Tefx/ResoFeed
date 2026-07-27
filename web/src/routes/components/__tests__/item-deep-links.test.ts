import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import Inspector from '../Inspector.svelte';

describe('ITEM-DEEP-LINK Inspector route states', () => {
  it('keeps the Inspector landmark, localized error, Retry, and route-aware return available', async () => {
    const onReturn = vi.fn();
    const onRetry = vi.fn();

    render(Inspector, {
      props: {
        item: null,
        mode: 'mobile-route',
        error: 'Item does not exist or was deleted',
        returnLabel: 'Return to Feed',
        onReturn,
        onRetry
      }
    });

    expect(screen.getByRole('complementary', { name: 'INSPECTOR' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Item does not exist or was deleted');
    await fireEvent.click(screen.getByRole('button', { name: 'Return to Feed' }));
    await fireEvent.click(screen.getByRole('button', { name: '[RETRY]' }));
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the desktop route return command visible alongside the stable loading landmark', () => {
    render(Inspector, {
      props: {
        item: null,
        mode: 'desktop-split',
        loading: true,
        returnLabel: 'Return to TODAY',
        onReturn: vi.fn()
      }
    });

    expect(screen.getByRole('complementary', { name: 'INSPECTOR' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('loading');
    expect(screen.getByRole('button', { name: 'Return to TODAY' })).toHaveClass('bracket-action');
    expect(screen.getByRole('button', { name: 'Return to TODAY' })).not.toHaveClass('back-command');
  });
});
