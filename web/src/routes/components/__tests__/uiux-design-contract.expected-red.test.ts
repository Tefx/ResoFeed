import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(__dirname, '../../../..');
const file = (path: string) => readFileSync(resolve(repo, path), 'utf8');

const page = () => file('src/routes/+page.svelte');
const appCss = () => file('src/app.css');
const tokensCss = () => file('src/lib/design-tokens.css');
const feed = () => file('src/routes/components/Feed.svelte');
const inspector = () => file('src/routes/components/Inspector.svelte');
const ledger = () => file('src/routes/components/SourceLedger.svelte');
const search = () => file('src/routes/components/SearchRetrieval.svelte');
const portability = () => file('src/routes/components/StatePortability.svelte');
const ownerPrompt = () => file('src/routes/components/OwnerTokenPrompt.svelte');
const firstUse = () => file('src/routes/components/FirstUseEmptyState.svelte');

function cssVar(css: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match) throw new Error(`missing ${name}`);
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

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function expectAbsent(source: string, forbidden: RegExp, requirementId: string): void {
  expect(source, `${requirementId}: forbidden runtime text/surface matched ${forbidden}`).not.toMatch(forbidden);
}

function expectPresent(source: string, required: RegExp, requirementId: string): void {
  expect(source, `${requirementId}: required runtime proof missing ${required}`).toMatch(required);
}

describe('UIUX expected-red design contract coverage', () => {
  it('DESIGN.TOKENS.BASE_SYSTEM and DESIGN.COLOR.DARK_MODE_SHELL require token/style conformance and a wired dark hierarchy', () => {
    const css = appCss();
    const tokens = tokensCss();

    for (const token of [
      '--rf-color-background-dark',
      '--rf-color-surface-dark',
      '--rf-color-text-dark',
      '--rf-color-muted-dark',
      '--rf-color-focus-dark'
    ]) {
      expectPresent(tokens, new RegExp(`${token}:\\s*#`, 'u'), 'DESIGN.COLOR.DARK_MODE_SHELL');
    }

    expectPresent(tokens, /@media\s*\(prefers-color-scheme:\s*dark\)|\[data-theme=['"]dark['"]|\.dark\b/u, 'DESIGN.COLOR.DARK_MODE_SHELL');
    expectAbsent(css, /gradient|blob|purple|#8b5cf6|#a855f7/iu, 'DESIGN.COLOR.DARK_MODE_SHELL');
  });

  it('DESIGN.COLOR.CONTRAST_STATUS_SEMANTICS enforces contrast ratios and non-color status semantics', () => {
    const tokens = tokensCss();
    const pairs: Array<[string, string, string]> = [
      ['--rf-color-text', '--rf-color-background', 'text/background'],
      ['--rf-color-muted', '--rf-color-background', 'muted/background'],
      ['--rf-color-muted', '--rf-color-surface', 'muted/surface'],
      ['--rf-color-danger', '--rf-color-surface', 'danger/surface'],
      ['--rf-color-warning', '--rf-color-surface', 'warning/surface'],
      ['--rf-color-success', '--rf-color-surface', 'success/surface'],
      ['--rf-color-accent-contrast', '--rf-color-accent', 'accent-contrast/accent']
    ];

    for (const [fg, bg, label] of pairs) {
      expect(contrast(cssVar(tokens, fg), cssVar(tokens, bg)), `DESIGN.COLOR.CONTRAST_STATUS_SEMANTICS ${label}`).toBeGreaterThanOrEqual(4.5);
    }

    const runtime = `${feed()}\n${inspector()}\n${ledger()}\n${page()}\n${ownerPrompt()}`;
    expectPresent(runtime, /err:|failed|失败|source excerpt|来源摘录|summary unavailable|摘要不可用|★|☆/u, 'DESIGN.COLOR.CONTRAST_STATUS_SEMANTICS');
    expectAbsent(runtime, /class:[\w-]*error\s*=\{[^}]+\}\s*>\s*\{?\s*['"]?\s*$/u, 'DESIGN.COLOR.CONTRAST_STATUS_SEMANTICS');
  });

  it('DESIGN.TOKENS.FLEXIBLE rows require explicit runtime disposition rather than silent optionality', () => {
    const css = appCss();
    expectPresent(css, /\[DEVIATION\]:|surface-active|contract-inspector|surface-nav-menu|source-ledger/u, 'DESIGN.TOKENS.FLEXIBLE.SURFACE');
    expectPresent(css, /\[DEVIATION\]:|aria-current='true'|surface-active|selected/u, 'DESIGN.TOKENS.FLEXIBLE.SURFACE_ACTIVE');
    expectPresent(`${feed()}\n${search()}`, /aria-label=.*Source|aria-label=.*来源|quality: high|feed-meta/u, 'DESIGN.TOKENS.FLEXIBLE.METADATA_TOKEN');
  });

  it('DESIGN.FEED.ITEM_ANATOMY_NO_KEY_POINTS and DESIGN.FEED.NO_REPEATED_PREFIXES keep Feed dense and selected state non-layout-shifting', () => {
    const src = `${feed()}\n${appCss()}`;
    expectAbsent(src, /key_points|inspector-key-points|<ul|<li|markdown|source-disclosure|RE-INGEST ITEM|重新处理本文/u, 'DESIGN.FEED.ITEM_ANATOMY_NO_KEY_POINTS');
    expectAbsent(src, />\s*src:\s*\{|来源标题：|source title:|条目 URL|来源 URL|价值:/u, 'DESIGN.FEED.NO_REPEATED_PREFIXES');
    expectPresent(src, /grid-template-columns:\s*3px|min-width:\s*44px|aria-current=\{selectedItemId/u, 'DESIGN.TOKENS.FLEXIBLE.SURFACE_ACTIVE');
  });

  it('DESIGN.INSPECTOR.FRONTMATTER_ORDER and DESIGN.INSPECTOR.COMPACT_EVIDENCE_LINKS require fixed compact Frontmatter and links', () => {
    const src = inspector();
    expectPresent(src, /<dl[^>]+class="[^"]*frontmatter|class="[^"]*inspector-frontmatter/u, 'DESIGN.INSPECTOR.FRONTMATTER_ORDER');
    expectPresent(src, /ORIGINAL[\s\S]*LINKS[\s\S]*AI STATUS[\s\S]*ATTEMPT/u, 'DESIGN.INSPECTOR.FRONTMATTER_ORDER');
    expectPresent(src, /摘要[\s\S]*核心洞察[\s\S]*要点/u, 'DESIGN.INSPECTOR.FRONTMATTER_ORDER');
    expectAbsent(src, /条目 URL|来源 URL|item url|source url|canonical url|original url|>\s*\{item\.url\}\s*</iu, 'DESIGN.INSPECTOR.COMPACT_EVIDENCE_LINKS');
    expectPresent(src, /original link|feed link|原文链接|来源链接/u, 'DESIGN.INSPECTOR.COMPACT_EVIDENCE_LINKS');
  });

  it('DESIGN.INSPECTOR.REINGEST.* requires Inspector-only item scope, authority copy, clearing, focus/live-region states, failed preservation, and source disclosure', () => {
    const src = inspector();
    const nonInspector = `${feed()}\n${ledger()}\n${search()}\n${page()}`;
    expectPresent(src, /\[REGENERATE\]|\[重新生成\]/u, 'DESIGN.INSPECTOR.REINGEST.ITEM_SCOPED');
    expectAbsent(nonInspector, /\[REGENERATE\]|\[重新生成\]|reingest-model|reingest-prompt/u, 'DESIGN.INSPECTOR.REINGEST.ITEM_SCOPED');
    expectPresent(src, /guidance only; cannot override schema, language, source identifiers, safety, status, or persistence/u, 'DESIGN.INSPECTOR.REINGEST.AUTHORITY_PROMPT');
    expectAbsent(`${src}\n${page()}\n${portability()}`, /localStorage\.setItem\([^)]*(?:reingest|prompt|model)|state\.json[\s\S]*(?:reingest|prompt|model)|steering receipt[\s\S]*(?:prompt|model)/iu, 'DESIGN.INSPECTOR.REINGEST.PERSISTENCE_CLEARING');
    expectPresent(src, /resetReingestTransientState[\s\S]*reingestModel\s*=\s*'default'[\s\S]*reingestPrompt\s*=\s*''/u, 'DESIGN.INSPECTOR.REINGEST.PERSISTENCE_CLEARING');
    expectPresent(src, /last re-ingest failed|上次重处理失败/u, 'DESIGN.INSPECTOR.REINGEST.FAILED_PRESERVATION');
    expectPresent(src, /reingestStatusLive\(\)|aria-disabled=\{reingestState === 'submitting'/u, 'DESIGN.INSPECTOR.REINGEST.ACCESSIBILITY_STATES');
    expectAbsent(src, /'confirming'|\[CONFIRM RE-INGEST\]|\[确认重处理\]|\[CANCEL\]|\[取消\]/u, 'DESIGN.INSPECTOR.REINGEST.ACCESSIBILITY_STATES');
    expectPresent(src, /<details[^>]+aria-label=\{localizedChrome\('Text evidence', '文本证据'\)\}/u, 'DESIGN.INSPECTOR.SOURCE_DISCLOSURE.DEFAULT_COLLAPSED');
    expectAbsent(`${src}\n${page()}`, /localStorage\.setItem\([^)]*(?:disclosure|details|sourceText)|sessionStorage\.setItem\([^)]*(?:disclosure|details|sourceText)/iu, 'DESIGN.INSPECTOR.SOURCE_DISCLOSURE.DEFAULT_COLLAPSED');
  });

  it('IR-MODEL-* encodes the Inspector item re-ingest model selector contract', () => {
    const src = `${inspector()}\n${page()}`;
    const outside = `${feed()}\n${ledger()}\n${search()}\n${portability()}`;
    expectPresent(src, /model:|模型：/u, 'IR-MODEL-OPENROUTER-ONLY');
    expectPresent(src, /OpenRouter/u, 'IR-MODEL-OPENROUTER-ONLY');
    expectAbsent(src, /provider tab|marketplace|setup|settings|account surface|anthropic tab|openai tab/iu, 'IR-MODEL-OPENROUTER-ONLY');
    expectPresent(src, /openRouterModels\(\)|\/api\/runtime\/openrouter-models/u, 'IR-MODEL-LIST-SOURCE');
    expectAbsent(src, /openrouter\/models[\s\S]*(?:catch|fallback|authority)/iu, 'IR-MODEL-LIST-SOURCE');
    expectPresent(src, /model:\s*reingestModel === 'default' \? null : reingestModel/u, 'IR-MODEL-DEFAULT-NULL');
    expectAbsent(src, /model:\s*['"]account_default['"]|value="account_default"/u, 'IR-MODEL-DEFAULT-NULL');
    expectPresent(src, /models: loading|模型：加载中/u, 'IR-MODEL-STATES');
    expectPresent(src, /err: models unavailable|err: 模型不可用/u, 'IR-MODEL-STATES');
    expectAbsent(`${src}\n${outside}`, /localStorage\.setItem\([^)]*(?:model|openrouter)|state\.json[\s\S]*model|runtime_metadata[\s\S]*model/iu, 'IR-MODEL-NO-DURABLE-PREF');
    expectAbsent(outside, /reingest-model|model:\s*<select>|模型：<select>|openRouterModels/u, 'IR-MODEL-PLACEMENT');
  });

  it('DESIGN.SOURCE_LEDGER and DESIGN.STATE_PORTABILITY enforce exact bracket actions, diagnostic exceptions, and active-only state', () => {
    const src = `${ledger()}\n${portability()}`;
    for (const token of ['[RUN INGEST]', '[INGESTING...]', '[FETCH]', '[FETCHING...]', '[IMPORT OPML]', '[IMPORTING OPML...]', '[EXPORT STATE]', '[EXPORTING STATE...]', '[IMPORT STATE]', '[IMPORTING STATE...]', '[DELETE]']) {
      expectPresent(src, new RegExp(token.replace(/[\[\].]/g, '\\$&'), 'u'), 'DESIGN.SOURCE_LEDGER.RAW_PROVENANCE_EXCEPTION');
    }
    expectAbsent(src, /\[DETAILS\]|\[运行抓取\]|\[抓取\]|\[导入 OPML\]|\[导出状态\]|\[导入状态\]|\[删除\]|\[详情\]/u, 'DESIGN.SOURCE_LEDGER.RAW_PROVENANCE_EXCEPTION');
    expectPresent(src, /source info|来源信息/u, 'DESIGN.SOURCE_LEDGER.RAW_PROVENANCE_EXCEPTION');
    expectPresent(src, /source_url:|feed_url:|url:\s*\{source\.url\}|err:/u, 'DESIGN.SOURCE_LEDGER.RAW_PROVENANCE_EXCEPTION');
    expectPresent(src, /Import State replaces active sources, rules, and stars/u, 'DESIGN.STATE_PORTABILITY.ACTIVE_ONLY');
    expectAbsent(src, /reading history|command history|activity ledger|persistent search|sync|merge|settings|receipt/i, 'DESIGN.STATE_PORTABILITY.ACTIVE_ONLY');
  });

  it('DESIGN.AUTH.OWNER_TOKEN_PROMPT and DESIGN.EMPTY.FIRST_USE enforce auth and first-use copy', () => {
    expectPresent(ownerPrompt(), /Enter owner token[\s\S]*err: owner token rejected[\s\S]*aria-live="assertive"/u, 'DESIGN.AUTH.OWNER_TOKEN_PROMPT');
    expectAbsent(ownerPrompt(), /account|login|register|profile|password reset|cloud/iu, 'DESIGN.AUTH.OWNER_TOKEN_PROMPT');
    for (const line of ['Paste RSS URL in Steer or import OPML.', 'Inspect opens the item.', 'Star preserves durable value.', 'Steer is optional correction.']) {
      expectPresent(firstUse(), new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'), 'DESIGN.EMPTY.FIRST_USE');
    }
    expectAbsent(firstUse(), /wizard|tour|carousel|celebrat|ghost|progress/iu, 'DESIGN.EMPTY.FIRST_USE');
  });

  it('DESIGN.SEARCH.* enforces lexical retrieval surface, desktop preservation, mobile Back restoration, and no durable histories', () => {
    const src = `${page()}\n${search()}`;
    expectPresent(src, /GET \/api\/search|apiClient\(\)\.search|onSearch\(\{/u, 'DESIGN.SEARCH.ROUTING_LEXICAL_STEER');
    expectAbsent(`${page().match(/surface-nav-menu[\s\S]*?<\/details>/u)?.[0] ?? page()}`, /SEARCH|搜索与检索|search-query/u, 'DESIGN.SEARCH.ROUTING_LEXICAL_STEER');
    expectPresent(src, /preservedSearchScrollTop[\s\S]*currentSurface = 'search'[\s\S]*searchRegion\.scrollTop = preservedSearchScrollTop/u, 'DESIGN.SEARCH.DESKTOP_DETAIL_PRESERVES_FILTERED_SLICE');
    expectPresent(src, /aria-current=\{selectedItemId === item\.id \? 'true' : undefined\}/u, 'DESIGN.SEARCH.DESKTOP_DETAIL_PRESERVES_FILTERED_SLICE');
    expectPresent(src, /syncSearchHistory\(preservedSearchWindowScrollY\)[\s\S]*window\.history\.pushState\(\{\}, '', `\/items/u, 'DESIGN.SEARCH.MOBILE_BACK_RESTORES_EPHEMERAL_SEARCH_STATE');
    expectPresent(src, /replaceSurfaceFromLocation[\s\S]*searchScrollY[\s\S]*restoreSearchScrollPosition/u, 'DESIGN.SEARCH.MOBILE_BACK_RESTORES_EPHEMERAL_SEARCH_STATE');
    expectAbsent(src, /localStorage\.setItem\([^)]*(?:search|history|session)|sessionStorage\.setItem\([^)]*(?:search|history|session)|saved search|reading history|command history|activity ledger|persistent search sessions?|settings (?:surface|dashboard|panel)|sync\/merge|sync state|merge state/iu, 'DESIGN.SEARCH.NO_DURABLE_HISTORIES');
  });

  it('DESIGN.LANGUAGE_CONTROL and DESIGN.REPROCESS_LIBRARY require opened RESOFEED utility-menu proof and negative placements', () => {
    const shell = page();
    const inspectorSrc = inspector();
    expectPresent(shell, /details[^>]+aria-label="RESOFEED surface menu"[\s\S]*runtime-language-controls[\s\S]*processingLanguageButtonText/u, 'DESIGN.LANGUAGE_CONTROL.UTILITY_MENU_POSITIVE_PROOF');
    expectAbsent(inspectorSrc, /LANG:|语言:\s*(?:英文|中文)|processing language controls/u, 'DESIGN.LANGUAGE_CONTROL.UTILITY_MENU_POSITIVE_PROOF');
    expectPresent(shell, /details[^>]+aria-label="RESOFEED surface menu"[\s\S]*reprocessDefaultLabel/u, 'DESIGN.REPROCESS_LIBRARY.UTILITY_MENU_ONLY');
    expectAbsent(`${inspectorSrc}\n${ledger()}\n${search()}`, /\[REPROCESS LIBRARY\]|\[重处理资料库\]|reprocess existing library/iu, 'DESIGN.REPROCESS_LIBRARY.UTILITY_MENU_ONLY');
    const doctorBlock = /doctor-surface[\s\S]*?\/section>/u.exec(shell)?.[0] ?? '';
    expectAbsent(doctorBlock, /\[REPROCESS LIBRARY\]|\[重处理资料库\]/u, 'DESIGN.REPROCESS_LIBRARY.UTILITY_MENU_ONLY');
  });

  it('DESIGN.STEER, DESIGN.AGENTS, DESIGN.MOBILE, and DESIGN.STATES cover receipts, provenance, touch targets, and state families', () => {
    const runtime = `${page()}\n${feed()}\n${search()}\n${ledger()}\n${inspector()}\n${appCss()}`;
    expectPresent(runtime, /steerFeedback|contract-steering-receipt|aria-live="polite"|aria-live="assertive"/u, 'DESIGN.STEER.INPUT_RECEIPT_OPERATION');
    expectAbsent(runtime, /activity ledger|command history|policy roster|settings dashboard|chat transcript/iu, 'DESIGN.STEER.INPUT_RECEIPT_OPERATION');
    expectPresent(runtime, /agent:\$\{actor\}|agent:external|created_by_actor_kind === 'agent'/u, 'DESIGN.AGENTS.RECEIPT_MARKERS');
    expectAbsent(runtime, /agent registry|agent dashboard|per-agent|activity feed|portable agent receipt/iu, 'DESIGN.AGENTS.RECEIPT_MARKERS');
    expectPresent(runtime, /@media \(max-width: 1079px\)[\s\S]*min-height:\s*44px|width:\s*44px[\s\S]*height:\s*44px/u, 'DESIGN.MOBILE.PARITY_TOUCH_TARGETS');
    expectPresent(runtime, /:hover|:focus-visible|disabled|aria-disabled|\[DELETE\]|\[INGESTING\.\.\.\]|err:|source excerpt|来源摘录|No sources|no results/u, 'DESIGN.STATES.INTERACTION_AND_FAILURE');
    expectAbsent(runtime, /spinner|skeleton|toast|animate-pulse|loading\.\.\.|\.\.\.\s*<\/span>/iu, 'DESIGN.STATES.INTERACTION_AND_FAILURE');
  });

  it('DESIGN.ANTI_FEATURES.NO_SAAS_DASHBOARD_ONBOARDING forbids negative product surfaces globally', () => {
    const runtime = `${page()}\n${feed()}\n${inspector()}\n${ledger()}\n${search()}\n${portability()}\n${ownerPrompt()}\n${firstUse()}`;
    for (const forbidden of [
      /reading history/iu,
      /command history/iu,
      /activity ledger/iu,
      /persistent search sessions?/iu,
      /settings (?:surface|dashboard|panel)/iu,
      /sync\/merge|sync state|merge state/iu,
      /portable search|portable session/iu,
      /unread count|mark all read|archive bin/iu,
      /folder|tag tree|source category/iu,
      /provider marketplace|provider tabs|account setup/iu
    ]) {
      expectAbsent(runtime, forbidden, 'DESIGN.ANTI_FEATURES.NO_SAAS_DASHBOARD_ONBOARDING');
    }
  });
});
