export const E2E_OWNER_TOKEN = 'rfeed_e2e_owner_token_00000000000000000000000000000000';
export const E2E_FAKE_OPENROUTER_KEY = 'resofeed_e2e_non_secret_openrouter_key';

export const fixtureFeedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>ResoFeed E2E Local Source</title>
    <link>https://example.test/</link>
    <description>Deterministic local RSS fixture for browser E2E.</description>
    <item>
      <title>Local fixture item one</title>
      <link>https://example.test/items/one</link>
      <guid>fixture-item-one</guid>
      <pubDate>Sat, 09 May 2026 10:00:00 GMT</pubDate>
      <description>Fixture excerpt for local browser verification.</description>
    </item>
  </channel>
</rss>`;

export const fixtureOpml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>ResoFeed E2E OPML</title></head>
  <body>
    <outline text="Folder that must be flattened">
      <outline text="ResoFeed E2E Local Source" title="ResoFeed E2E Local Source" type="rss" xmlUrl="http://127.0.0.1:9/e2e-feed.xml" />
    </outline>
  </body>
</opml>`;

export interface E2ERunInfo {
  readonly baseURL: string;
  readonly binaryPath: string;
  readonly dbPath: string;
  readonly ownerToken: string;
  readonly artifactRoot: string;
  readonly server: {
    readonly pid: number;
    readonly stdoutPath: string;
    readonly stderrPath: string;
  };
  readonly sanitizedEnvironment: {
    readonly allowedVariables: readonly string[];
    readonly openRouterKey: 'ci-safe-fake-key' | 'live-redacted' | 'absent';
    readonly notesPath: string;
  };
}
