import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webRoot = resolve(__dirname, '../../../..');
const read = (path: string) => readFileSync(resolve(webRoot, path), 'utf8');

function cssVar(css: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`, 'u').exec(css);
  if (!match) throw new Error(`missing ${name}`);
  return match[1];
}

function darkCssVar(css: string, name: string): string {
  const darkBlock = css.match(/@media \(prefers-color-scheme: dark\)\s*\{[\s\S]+\}\s*$/u)?.[0] ?? '';
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`, 'u').exec(darkBlock);
  if (!match) throw new Error(`missing dark ${name}`);
  return match[1];
}

function srgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(raw.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function channel(value: number): number {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = srgb(hex).map(channel);
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return Number(((light + 0.05) / (dark + 0.05)).toFixed(2));
}

describe('UIUX token and base-state integration proof', () => {
  const tokens = read('src/lib/design-tokens.css');

  it('records contrast ratios for approved light and dark shell/status pairings', () => {
    const pairs: Array<[string, string, number, string]> = [
      ['--rf-color-text', '--rf-color-background', 4.5, 'shell/feed normal text'],
      ['--rf-color-muted', '--rf-color-background', 4.5, 'feed/search muted text'],
      ['--rf-color-muted', '--rf-color-surface', 4.5, 'inspector/ledger muted text'],
      ['--rf-color-danger', '--rf-color-surface', 4.5, 'error/destructive status'],
      ['--rf-color-warning', '--rf-color-surface', 4.5, 'warning/attempt status'],
      ['--rf-color-success', '--rf-color-surface', 4.5, 'success status'],
      ['--rf-color-accent-contrast', '--rf-color-accent', 4.5, 'active Resonate star'],
      ['--rf-color-focus', '--rf-color-background', 3, 'light focus ring'],
      ['--rf-color-text-dark', '--rf-color-background-dark', 4.5, 'dark shell normal text'],
      ['--rf-color-muted-dark', '--rf-color-background-dark', 4.5, 'dark shell muted text'],
      ['--rf-color-muted-dark', '--rf-color-surface-dark', 4.5, 'dark surface muted text'],
      ['--rf-color-focus-dark', '--rf-color-background-dark', 3, 'dark focus ring'],
      ['--rf-component-status-error-text-color', '--rf-color-surface-dark', 4.5, 'dark error/destructive status'],
      ['--rf-component-status-warning-text-color', '--rf-color-surface-dark', 4.5, 'dark warning/attempt status'],
      ['--rf-component-status-success-text-color', '--rf-color-surface-dark', 4.5, 'dark success status']
    ];

    const measured = Object.fromEntries(pairs.map(([fg, bg, minimum, label]) => {
      const foreground = label.startsWith('dark ') && fg.startsWith('--rf-component-') ? darkCssVar(tokens, fg) : cssVar(tokens, fg);
      const ratio = contrastRatio(foreground, cssVar(tokens, bg));
      expect(ratio, `${label}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(minimum);
      return [label, ratio];
    }));

    expect(measured).toMatchInlineSnapshot(`
      {
        "active Resonate star": 6.98,
        "dark error/destructive status": 9.34,
        "dark focus ring": 10.28,
        "dark shell muted text": 8.23,
        "dark shell normal text": 13.58,
        "dark success status": 9.45,
        "dark surface muted text": 7.45,
        "dark warning/attempt status": 9.87,
        "error/destructive status": 7.05,
        "feed/search muted text": 5.17,
        "inspector/ledger muted text": 5.55,
        "light focus ring": 4.99,
        "shell/feed normal text": 13.81,
        "success status": 6.33,
        "warning/attempt status": 5.84,
      }
    `);
  });

  it('keeps dark token overrides available for computed contrast proof', () => {
    expect(tokens).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/u);
  });

});
