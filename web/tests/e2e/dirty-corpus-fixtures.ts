import http, { type Server } from 'node:http';
import net from 'node:net';

export interface DirtyCorpusItem {
  readonly id: string;
  readonly title: string;
  readonly linkPath: string;
  readonly pubDate: string | null;
  readonly description: string;
  readonly articleHtml?: string;
  readonly rawPrimaryForbidden: readonly string[];
  readonly readablePrimaryExpected: readonly string[];
}

export interface DirtyCorpusServer {
  readonly server: Server;
  readonly feedUrl: string;
  readonly baseUrl: string;
}

const longParagraph = 'Readable long-form paragraph for layout wrapping and line-length validation. '.repeat(170);
const veryLongTitle = `Very long title ${'with deterministic overflow pressure '.repeat(9)}ending marker`;
const veryLongPath = `/article/${'very-long-url-segment-'.repeat(18)}terminal`;

export const dirtyCorpusItems: readonly DirtyCorpusItem[] = [
  {
    id: 'json_ld_blob_item',
    title: 'JSON-LD blob should not become article copy',
    linkPath: '/article/json-ld-blob',
    pubDate: 'Sun, 10 May 2026 10:08:00 GMT',
    description: `{ "@context": "https://schema.org", "@type": "NewsArticle", "headline": "Tracker object", "author": [{ "@type": "Person", "name": "Schema Person" }], "image": ["https://cdn.example.invalid/raw.jpg"], "publisher": { "@type": "Organization", "name": "Schema Publisher" } } Readable article lead after the metadata blob.`,
    rawPrimaryForbidden: ['{ "@context"', '"@type"', '"publisher"'],
    readablePrimaryExpected: ['Readable article lead']
  },
  {
    id: 'follow_prompt_repeated_lead_item',
    title: 'Follow prompt cleanup preserves readable article prose',
    linkPath: '/article/follow-prompt-repeated-lead',
    pubDate: 'Sun, 10 May 2026 10:07:45 GMT',
    description: '',
    articleHtml: '<article><p>summary-like lead repeated by the site summary-like lead repeated by the site Follow us on Twitter for more newsletters Second readable paragraph confirms the body is not empty after bounded cleanup.</p></article>',
    rawPrimaryForbidden: ['Follow us on Twitter for more newsletters', 'summary-like lead repeated by the site'],
    readablePrimaryExpected: ['Second readable paragraph confirms the body is not empty after bounded cleanup.']
  },
  {
    id: 'inline_json_ld_runtime_item',
    title: 'Readable dirty-content article',
    linkPath: '/article/inline-json-ld-runtime',
    pubDate: 'Sun, 10 May 2026 10:07:30 GMT',
    description: 'Readable deterministic summary from dirty feed.',
    articleHtml: '<article><p>Readable lead paragraph that should remain primary. { "@context":"https://schema.org", "@type":"NewsArticle", "tracking":"huge raw payload should not be primary" } More readable body after dirty payload.</p></article>',
    rawPrimaryForbidden: ['{ "@context"', '"@context":"https://schema.org"', '"@type":"NewsArticle"', '"tracking"'],
    readablePrimaryExpected: ['Readable lead paragraph that should remain primary.', 'More readable body after dirty payload.']
  },
  {
    id: 'long_description_item',
    title: 'Long description should stay readable in Inspector',
    linkPath: '/article/long-description',
    pubDate: 'Sun, 10 May 2026 10:07:00 GMT',
    description: longParagraph,
    articleHtml: `<article><p>${longParagraph}</p><p>Readable extracted-text terminal marker.</p></article>`,
    rawPrimaryForbidden: ['[object Object]', '{ "raw"'],
    readablePrimaryExpected: ['Readable long-form paragraph', 'Readable extracted-text terminal marker']
  },
  {
    id: 'html_fragment_item',
    title: 'HTML fragment should render as readable text',
    linkPath: '/article/html-fragment',
    pubDate: 'Sun, 10 May 2026 10:06:00 GMT',
    description: '<p>Readable &amp; linked <a href="https://example.invalid/path">anchor text</a></p><ul><li>first point</li><li>second point</li></ul>',
    rawPrimaryForbidden: ['<p>', '<a href=', '<ul>', '<li>'],
    readablePrimaryExpected: ['Readable & linked', 'anchor text', 'first point']
  },
  {
    id: 'script_style_leftover_item',
    title: 'Script and style leftovers should be hidden from primary copy',
    linkPath: '/article/script-style-leftovers',
    pubDate: 'Sun, 10 May 2026 10:05:00 GMT',
    description: '<style>.ad{display:block}</style><script>window.__tracker = "leak";</script><p>Readable copy after tracking leftovers.</p>',
    articleHtml: '<html><head><style>.tracking{color:red}</style><script>window.__tracker = "article leak";</script></head><body><p>Readable article copy after leftovers.</p></body></html>',
    rawPrimaryForbidden: ['<script', '<style', 'window.__tracker', '.tracking'],
    readablePrimaryExpected: ['Readable article copy after leftovers']
  },
  {
    id: 'missing_summary_date_author_item',
    title: 'Missing metadata keeps honest placeholders',
    linkPath: '',
    pubDate: null,
    description: '',
    rawPrimaryForbidden: ['undefined', 'null null', 'Invalid Date'],
    readablePrimaryExpected: ['summary unavailable']
  },
  {
    id: 'very_long_url_title_item',
    title: veryLongTitle,
    linkPath: veryLongPath,
    pubDate: 'Sun, 10 May 2026 10:04:00 GMT',
    description: 'Readable summary for a hostile long URL and long title case.',
    rawPrimaryForbidden: ['[object Object]'],
    readablePrimaryExpected: ['Readable summary for a hostile long URL']
  },
  {
    id: 'escaped_entities_item',
    title: 'Escaped entities should decode once',
    linkPath: '/article/escaped-entities',
    pubDate: 'Sun, 10 May 2026 10:03:00 GMT',
    description: 'AT&amp;T uses &#x27;quotes&#x27; &amp; Unicode café — malformed &notanentity; should stay readable.',
    rawPrimaryForbidden: ['&amp;', '&#x27;'],
    readablePrimaryExpected: ['AT&T', "'quotes'", 'café']
  },
  {
    id: 'media_enclosure_metadata_item',
    title: 'Media enclosure metadata stays secondary',
    linkPath: '/article/media-enclosure',
    pubDate: 'Sun, 10 May 2026 10:02:00 GMT',
    description: 'Readable media story lead. enclosure: url=https://media.example.invalid/audio.mp3 type=audio/mpeg length=123456 image=https://media.example.invalid/poster.jpg',
    rawPrimaryForbidden: ['enclosure:', 'audio/mpeg', 'length=123456', 'poster.jpg'],
    readablePrimaryExpected: ['Readable media story lead']
  },
  {
    id: 'partial_extraction_item',
    title: 'Partial extraction explains excerpt limitation',
    linkPath: '/article/does-not-exist',
    pubDate: 'Sun, 10 May 2026 10:01:00 GMT',
    description: 'Readable feed excerpt survives when the original article cannot be fetched.',
    rawPrimaryForbidden: ['[object Object]'],
    readablePrimaryExpected: ['Readable feed excerpt survives', 'source text: RSS excerpt only']
  },
  {
    id: 'model_error_item',
    title: 'Model error keeps raw terse status',
    linkPath: '',
    pubDate: 'Sun, 10 May 2026 10:00:00 GMT',
    description: '',
    rawPrimaryForbidden: ['Sorry', 'Oops', 'ghost'],
    readablePrimaryExpected: ['summary unavailable']
  }
];

export function dirtyCorpusInventory(): string {
  return dirtyCorpusItems.map((item) => `${item.id}: ${item.title}`).join('\n');
}

export async function startDirtyCorpusServer(): Promise<DirtyCorpusServer> {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = http.createServer((request, response) => {
    if (request.url === '/dirty-corpus.xml') {
      response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
      response.end(dirtyCorpusFeedXml(baseUrl));
      return;
    }
    const item = dirtyCorpusItems.find((candidate) => candidate.linkPath !== '' && request.url === candidate.linkPath);
    if (item?.articleHtml) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(item.articleHtml);
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('not found');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  return { server, feedUrl: `${baseUrl}/dirty-corpus.xml`, baseUrl };
}

export async function stopDirtyCorpusServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

export function dirtyCorpusOpml(feedUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Dirty Inspector Corpus OPML</title></head>
  <body><outline text="Dirty Inspector Corpus" title="Dirty Inspector Corpus" type="rss" xmlUrl="${escapeXml(feedUrl)}" /></body>
</opml>`;
}

function dirtyCorpusFeedXml(baseUrl: string): string {
  const items = dirtyCorpusItems.map((item) => {
    const link = item.linkPath === '' ? '' : `${baseUrl}${item.linkPath}`;
    const pubDate = item.pubDate ? `<pubDate>${item.pubDate}</pubDate>` : '';
    return `<item>
      <guid>${escapeXml(item.id)}</guid>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(link)}</link>
      ${pubDate}
      <description><![CDATA[${item.description}]]></description>
    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Dirty Inspector Corpus</title>
    <link>${baseUrl}/</link>
    <description>Dirty RSS cases for Inspector regression tests.</description>
    ${items}
  </channel>
</rss>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'string' || address === null) {
        server.close(() => reject(new Error('unable to reserve TCP port')));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}
