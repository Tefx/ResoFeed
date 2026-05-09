# Terminal/API Capture (redacted)

Commands used values redacted: OPENROUTER_KEY=<OPENROUTER_KEY_REDACTED>; owner token not printed.

## account-default
GET /api/doctor -> 200 text/plain; charset=utf-8
```text
rss: ok
openrouter: ok configured_model=account_default resolved_model=unknown
extraction: ok
ingest: last_run=never
```
GET / -> 200 text/html; charset=utf-8
GET /mcp without auth -> 401 application/json; charset=utf-8
```text
{"error":{"code":"unauthorized","message":"owner token required","details":{}}}
```

## configured-model
GET /api/doctor -> 200 text/plain; charset=utf-8
```text
rss: ok
openrouter: ok configured_model=openai/gpt-4.1-mini resolved_model=unknown
extraction: ok
ingest: last_run=never
```
GET / -> 200 text/html; charset=utf-8
GET /mcp without auth -> 401 application/json; charset=utf-8
```text
{"error":{"code":"unauthorized","message":"owner token required","details":{}}}
```
