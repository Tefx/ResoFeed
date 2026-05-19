import { describe, expect, it } from 'vitest';

import { formatLocalClockTime } from './display-time';

describe('local display time formatting', () => {
  it('formats RFC3339 timestamps through the browser local timezone formatter', () => {
    const timestamp = '2026-05-09T10:25:31Z';
    const expectedLocalTime = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date(timestamp));

    expect(formatLocalClockTime(timestamp)).toBe(expectedLocalTime);
    expect(formatLocalClockTime(timestamp)).not.toContain('UTC');
    expect(formatLocalClockTime(timestamp)).not.toContain('Z');
  });

  it('does not echo invalid or missing timestamps into UI copy', () => {
    expect(formatLocalClockTime(null)).toBeNull();
    expect(formatLocalClockTime(undefined)).toBeNull();
    expect(formatLocalClockTime('not-a-date')).toBeNull();
  });
});
