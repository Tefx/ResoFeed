import { describe, expect, it } from 'vitest';

import { formatLocalClockTime } from './display-time';

describe('UTC clock display formatting', () => {
  it('formats RFC3339 timestamps as stable HH:MM:SS UTC-derived operational clock copy', () => {
    const timestamp = '2026-05-09T10:25:31Z';
    const expectedOperationalTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date(timestamp));

    expect(formatLocalClockTime(timestamp)).toBe(expectedOperationalTime);
    expect(formatLocalClockTime(timestamp)).not.toContain('UTC');
    expect(formatLocalClockTime(timestamp)).not.toContain('Z');
  });

  it('does not echo invalid or missing timestamps into UI copy', () => {
    expect(formatLocalClockTime(null)).toBeNull();
    expect(formatLocalClockTime(undefined)).toBeNull();
    expect(formatLocalClockTime('not-a-date')).toBeNull();
  });
});
