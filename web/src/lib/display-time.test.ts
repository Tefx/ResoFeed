import { describe, expect, it } from 'vitest';

import { formatLocalClockTime, formatLocalClockTimeWithHint, localTimezoneHint } from './display-time';

describe('local clock display formatting', () => {
  it('formats RFC3339 timestamps as stable HH:MM:SS in the browser local timezone', () => {
    const timestamp = '2026-05-09T10:25:31Z';
    const expectedOperationalTime = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date(timestamp));

    expect(formatLocalClockTime(timestamp)).toBe(expectedOperationalTime);
    expect(formatLocalClockTime(timestamp)).not.toContain('UTC');
    expect(formatLocalClockTime(timestamp)).not.toContain('Z');
  });

  it('adds terse local timezone hints without changing the stable HH:MM:SS clock', () => {
    const timestamp = '2026-05-09T10:25:31Z';
    const clock = formatLocalClockTime(timestamp);

    expect(localTimezoneHint('en')).toBe('local');
    expect(localTimezoneHint('zh')).toBe('本地');
    expect(formatLocalClockTimeWithHint(timestamp, 'en')).toBe(`${clock} local`);
    expect(formatLocalClockTimeWithHint(timestamp, 'zh')).toBe(`${clock} 本地`);
  });

  it('does not echo invalid or missing timestamps into UI copy', () => {
    expect(formatLocalClockTime(null)).toBeNull();
    expect(formatLocalClockTime(undefined)).toBeNull();
    expect(formatLocalClockTime('not-a-date')).toBeNull();
    expect(formatLocalClockTimeWithHint('not-a-date')).toBeNull();
  });
});
