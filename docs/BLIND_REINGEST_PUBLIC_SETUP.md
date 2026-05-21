<!-- Public black-box setup note for backend API contract probes. -->

# Blind Re-Ingest Public Setup Path

ResoFeed exposes an owner-authenticated JSON setup path that can seed an item for
black-box `POST /api/items/{id}/reingest` probes without direct SQLite writes or
private package internals:

1. Start `resofeed serve` with an owner token and, for a positive model-backed
   re-ingest, a valid runtime `OPENROUTER_KEY`.
2. Host or choose an HTTP article URL whose content can be fetched by the
   ResoFeed process.
3. `POST /api/state/import` with `Content-Type: application/json` and
   `Authorization: Bearer <owner-token>` using a `resofeed.state.v1` bundle that
   contains:
   - one `sources[]` row whose `url` matches the article's `source_url`, and
   - one `resonated_items[]` row with the desired `item_id`, article `url`, and
     matching `source_url`.
4. Probe `POST /api/items/{item_id}/reingest` with strict JSON mutation fields.

This uses the existing portable state import boundary only. It does not add an
admin daemon, test-only HTTP route, account concept, direct database setup,
durable job, prompt/model preference state, or sidecar.

Minimal bundle shape:

```json
{
  "schema_version": "resofeed.state.v1",
  "exported_at": "2026-05-22T00:00:00Z",
  "sources": [
    {"id": "blind_source", "url": "https://example.test/feed.xml", "title": "Blind Source"}
  ],
  "steer_rules": [],
  "resonated_items": [
    {"item_id": "blind_item", "url": "https://example.test/article", "source_url": "https://example.test/feed.xml", "title": "Blind Item"}
  ]
}
```
