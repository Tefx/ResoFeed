import http from 'node:http';
const feedXml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\">\n  <channel>\n    <title>ResoFeed E2E Local Source</title>\n    <link>https://example.test/</link>\n    <description>Deterministic local RSS fixture for browser E2E.</description>\n    <item>\n      <title>Local fixture item one</title>\n      <link>about:blank</link>\n      <guid>fixture-item-one</guid>\n      <pubDate>Sat, 09 May 2026 10:00:00 GMT</pubDate>\n      <description></description>\n    </item>\n  </channel>\n</rss>";
const port = 50386;
const server = http.createServer((request, response) => {
  if (request.url === '/e2e-feed.xml') {
    response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
    response.end(feedXml);
    return;
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('not found');
});
server.listen(port, '127.0.0.1', () => { console.log(`fixture feed server listening on ${port}`); });
process.on('SIGTERM', () => server.close(() => process.exit(0)));