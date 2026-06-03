export function formatLocalClockTime(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

export function localTimezoneHint(language: 'en' | 'zh' = 'en'): string {
  return language === 'zh' ? '本地' : 'local';
}

export function formatLocalClockTimeWithHint(timestamp: string | null | undefined, language: 'en' | 'zh' = 'en'): string | null {
  const clock = formatLocalClockTime(timestamp);
  return clock ? `${clock} ${localTimezoneHint(language)}` : null;
}
