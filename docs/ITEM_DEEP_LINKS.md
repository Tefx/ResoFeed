# ResoFeed Item Summary Deep Links

## Status
- **Feature status:** Approved for implementation
- **Architecture readiness:** READY
- **Implementation status:** Pending
- **Canonical public route:** `https://resofeed.tefx.one/items/{percent-encoded raw item_id}`
- **Scope owner:** ResoFeed web, HTTP, and MCP surfaces inside the existing single Go deployable

This document defines the complete product, architecture, navigation, authentication, error, compatibility, test, and release contract for stable item detail links. The corresponding canonical deltas in `docs/ARCHITECTURE.md` and `docs/DESIGN.md` remain authoritative if this document and either canonical document diverge.
## 1. Purpose

Telegram morning reports, email, browser bookmarks, and other authorized clients need a stable URL for each ResoFeed item. Opening that URL must show the same Item Inspector content and operations as an in-app item selection, survive refresh, recover through owner-token authentication, and preserve ordinary browser navigation.

The feature reuses the current `ItemDetail`, Provenance, Item Inspector, owner-token boundary, single Go binary, SQLite database, and SPA shell. It introduces no public anonymous summary surface, account model, reading-history ledger, sync service, router framework, or second detail implementation.

## 2. User-visible contract

For a normal ResoFeed-generated item ID:

```text
https://resofeed.tefx.one/items/item_97a1df0284aabd9923cec462328a50f6
```

Direct access must:

1. parse and validate the item path;
2. preserve the URL while owner-token state is determined;
3. prompt for the owner token when needed;
4. call the authenticated item-detail read operation;
5. render the existing Item Inspector with the returned detail;
6. preserve the same item across refresh;
7. expose a route-aware return to Feed;
8. avoid implicit inspection, delivery, or resonance mutations.

## 3. Scope

### 3.1 Included

- canonical item application paths and absolute URLs;
- legacy item-route compatibility;
- item/API path separation;
- cold load and refresh;
- owner-token recovery, including a later item-detail `401`;
- Feed and Search URL synchronization;
- Back, Forward, close, scroll, filter, selection, and focus restoration;
- explicit route, API, fallback, and duplicate states;
- Item Inspector reuse;
- MCP `app_url` projection for `list_candidate_items`, `search_items`, and `read_item`;
- unit, HTTP, MCP, component, browser, mobile-viewport, Tailnet, and Telegram verification;
- synchronized canonical architecture and design updates.

### 3.2 Excluded

- anonymous or unauthenticated summaries;
- search-engine indexing;
- signed or expiring public links;
- anonymous source-evidence access;
- user accounts, OAuth, or per-agent authorization;
- durable reading history, saved searches, navigation logs, or activity ledgers;
- a second detail component or standalone reader implementation;
- a new service, sidecar, worker, router dependency, state manager, or database.

## 4. Architecture decisions
The accepted delta below supersedes earlier RF-BUG clauses only where they require one shared `~base64url` grammar for browser and API item routes.

### 4.1 Separate browser application paths from item API paths

The browser and API use separate path codecs:

| Surface | Canonical input |
|---|---|
| Browser application route | `/items/{percent-encoded raw item_id}` |
| HTTP item operations | `/api/items/~{unpadded RFC4648 base64url(item_id)}` |
| MCP item input | raw opaque `item_id` |

The browser route provides the requested readable address for ordinary generated IDs. The API retains its opaque token because it carries `/`, `%`, Unicode, `?`, `#`, and similar bytes safely through Go HTTP routing and reverse proxies.

Frontend API calls must never derive their path from the browser application URL. Browser route helpers and API item-path helpers are separate contracts.

### 4.2 Canonical application path encoding

The exact application-route item-ID domain is a non-empty sequence of Unicode scalar values excluding Unicode General Category `Cc` control code points: U+0000–U+001F and U+007F–U+009F. Unpaired UTF-16 surrogates are not Unicode scalar values and are outside the domain. The encoder and parser accept exactly this same domain. Literal `.` and `..` are valid opaque IDs; they are data, never navigation directives.

`itemAppPath(itemId)` must:

- treat `itemId` as an opaque string in that domain;
- reject an empty string, an ill-formed Unicode string, or any `Cc` code point;
- encode UTF-8 bytes as one RFC3986 path segment;
- encode reserved characters exactly once;
- emit the whole-ID values `.` and `..` as the reserved canonical segments `!.` and `!..` respectively, never as literal or percent-encoded dot segments; this structural `!` prevents browser, proxy, and server dot-segment normalization;
- encode a leading literal `!` as `%21` so an ordinary raw ID cannot collide with either dot sentinel;
- encode a leading literal `~` as `%7E` so it cannot be confused with a legacy token;
- produce no query string or fragment;
- return `/items/{segment}`.

`itemAppUrl(itemId, origin?)` must:

- call `itemAppPath` rather than reproduce its rules;
- use the explicit origin when provided, otherwise the current browser origin;
- accept only HTTP(S) origins without credentials, query strings, or fragments;
- omit owner tokens and all authentication material.

Components, tests, MCP projections, and copy-link behavior must not concatenate `"/items/" + id` independently.

### 4.3 Route parsing and invalid links

The browser route parser returns one discriminated result:

- **canonical item route** — either exact dot sentinel `!.` / `!..` or a valid percent-encoded raw ID in the exact §4.2 domain;
- **legacy item route** — valid `~base64url` token whose decoded ID is in the exact §4.2 domain, plus its canonical replacement path;
- **invalid item route** — invalid syntax with no item API request;
- **non-item workbench route** — Feed, Search, Source Ledger, or Doctor.

At the frontend parser boundary, an item link is invalid when the route has an empty segment, malformed percent triplet, invalid UTF-8, a U+0000–U+001F or U+007F–U+009F code point, an extra literal path segment, or a malformed legacy token. The parser recognizes `!.` and `!..` only when the escaped segment is exactly one of those sentinels, before generic percent decoding; `%21.` and `%21..` decode to ordinary raw IDs beginning with `!` and never acquire dot semantics. Item IDs remain opaque: the client must not require an `item_` prefix, hexadecimal suffix, or fixed hash length.

The existing Go HTTP server owns one earlier boundary: a raw cold-load request target containing a malformed percent triplet, such as `/items/%ZZ`, is rejected at the server/request-target layer with HTTP `400 Bad Request` before static SPA dispatch. The SPA route parser, Inspector, and item API are not reached for that cold load. This server-level outcome is distinct from a **dispatchable invalid item route**—for example an extra segment, an encoded control code point, or a malformed legacy token—which reaches the SPA, keeps the invalid URL, renders the localized invalid-link Inspector state, and issues no item API request. If malformed-percent text reaches the frontend parser as an in-memory or synthetic input, it still returns `invalid item route`; that parser result does not imply that a raw malformed-percent HTTP cold load can reach the SPA.

For every well-formed raw request target whose escaped path is in the `/items/` namespace, the Go serving boundary must choose item-route SPA dispatch before percent-decoding, path cleaning, redirect normalization, or filesystem lookup. Canonical, legacy, and dispatchable-invalid item paths return the embedded SPA index and cannot resolve to a static asset. Encoded `/`, `.`, and `..` bytes remain item-ID data even when decoding them would resemble nested paths or dot segments. The server must not emit a path-cleaning redirect or substitute asset bytes for such a request. Raw malformed-percent targets remain the earlier `400 Bad Request` exception because request parsing fails before this dispatch rule.

For every ID accepted by `itemAppPath`, parsing the generated path must return the byte-identical raw ID. A syntactically valid ID that is absent from SQLite is a `404`, not an invalid-link state.

A valid legacy route remains loadable. After successful parsing, the browser uses `replaceState` to adopt the canonical application path without adding an entry to history.

### 4.4 Read-only navigation semantics

The following paths perform only authenticated item reads:

- external cold load;
- refresh;
- token recovery and retry;
- Back or Forward re-entry;
- temporary-error retry;
- automatic selection used to maintain desktop layout.

These paths must not call `mark_inspected`, `report_delivery`, or `resonate_item`.

A deliberate Feed or Search item activation may retain the current human-inspection mutation. The navigation controller must issue that mutation at most once for the explicit activation; URL updates, detail completion, refresh, Back, and Forward must not duplicate it.

Search auto-selection and Feed default selection are read-only because the user did not deliberately activate the selected item.

### 4.5 Authoritative duplicate resolution

The storage-level `ReadItemDetail` capability continues to address every stored item by its own ID. HTTP and MCP expose one `ItemReadResult` envelope:

```json
{
  "item": {},
  "resolved_from_item_id": null,
  "duplicate_target_item_id": null,
  "duplicate_target_available": null
}
```

All four fields are required. The three nullable relation fields have these exact meanings:

| Read outcome | `item` | `resolved_from_item_id` | `duplicate_target_item_id` | `duplicate_target_available` |
|---|---|---|---|---|
| Ordinary item | requested `ItemDetail` | `null` | `null` | `null` |
| Valid direct duplicate | authoritative target `ItemDetail` | requested duplicate ID | authoritative target ID | `true` |
| Broken/missing duplicate target | requested duplicate `ItemDetail` | `null` | missing target ID from the requested row | `false` |

The read result also fixes one effective mutation target for the deliberate inspection marker and every existing item-scoped Inspector mutation:

| Read outcome | Effective mutation item ID | `mark_inspected` target | `resonate_item` target | `reingest_item` target |
|---|---|---|---|---|
| Ordinary item | returned `item.id` (the requested ID) | effective mutation item ID | effective mutation item ID | effective mutation item ID |
| Valid direct duplicate | returned authoritative `item.id` (equal to `duplicate_target_item_id`) | effective mutation item ID | effective mutation item ID | effective mutation item ID |
| Broken/missing duplicate target | returned `item.id` (the requested duplicate ID) | effective mutation item ID | effective mutation item ID | effective mutation item ID |

The browser must use returned `item.id`, not the requested URL ID, as the target after a successful read. If a deliberate Feed/Search activation needs the human-inspection marker, it waits for this outcome and writes exactly that effective row at most once. Resonance and re-ingest use the same effective ID. No action may also mutate the requested duplicate row after successful resolution or the missing target row for a broken duplicate.

The requested URL remains valid and is not automatically redirected. Copy-link behavior uses the returned authoritative `item.id` after a successful resolution and the requested `item.id` for a broken target. Provenance and grouped-source disclosure remain backend-authoritative; the browser must not infer a duplicate group.

The Inspector shows one low-chrome relation line when `resolved_from_item_id` is non-null or `duplicate_target_available` is `false`. It does not create a second detail view.

### 4.6 MCP application URLs

MCP item-read outputs use transport-specific item projections:

```text
list_candidate_items.items[n].app_url
search_items.items[n].app_url
read_item.item.app_url
```

`app_url` is a required, non-null string on every returned MCP item summary or detail. It is derived from the effective normalized `MCPConfig.PublicURL` plus the canonical application path.

Runtime rules:

- explicit `--public-url` selects the effective Public URL after the origin normalization and validation in `docs/ARCHITECTURE.md`;
- accepted `--addr` forms are exactly an ASCII DNS hostname or IPv4 literal followed by `:PORT`, or a bracketed IPv6 literal without a zone identifier followed by `:PORT`; `PORT` is decimal `1..65535`; empty hosts, Unicode hostnames, unbracketed IPv6, IPv6 zones, `*`, schemes, paths, queries, fragments, and userinfo are rejected before binding;
- when `--public-url` is omitted, startup sets the effective normalized `MCPConfig.PublicURL` from `--addr`: a specific hostname or IP remains the origin host, DNS names are lowercased, IPv6 remains bracketed in URL form, `0.0.0.0` maps to `127.0.0.1`, and `[::]` maps to `[::1]`; the port is emitted in canonical decimal form and the result is `http://HOST:PORT` without a trailing slash;
- the wildcard mappings are local loopback origins only; production/Tailnet verification therefore requires explicit `--public-url https://resofeed.tefx.one`;
- explicit `--public-url` accepts only an absolute `http` or `https` origin whose host is written directly as `localhost`, a valid ASCII DNS hostname under the same label/length rules as `--addr`, a canonical dotted-decimal IPv4 literal, or a bracketed IPv6 literal without a zone identifier;
- an explicit dotted-decimal IPv4 literal has exactly four decimal components in `0..255`; each component is `0` or begins with `1..9`, so leading-zero and out-of-range forms are rejected rather than reinterpreted as DNS;
- an explicit host containing only ASCII digits and dots must satisfy that IPv4 grammar and cannot fall back to the DNS-hostname class;
- explicit DNS hosts are lowercased; explicit IPv4 remains canonical dotted decimal; explicit IPv6 is compressed, lowercased, and bracketed;
- explicit wildcard/unspecified hosts `0.0.0.0` and `[::]`, `*`, Unicode host spelling, trailing-dot DNS, percent-encoded hosts, malformed literals, unbracketed IPv6, IPv6 zones, IPvFuture, empty hosts, and input with leading/trailing whitespace are rejected before binding; startup performs no Unicode-to-IDNA conversion, while an already-ASCII `xn--` A-label is accepted only when it satisfies the ordinary ASCII DNS grammar;
- an explicit port may be omitted or contain only ASCII decimal digits with numeric value `1..65535`; leading zeros are accepted and normalized to canonical decimal, while empty, signed, non-decimal, zero, and out-of-range ports are rejected;
- normalization lowercases the scheme, removes a sole `/` path, omits explicit `:80` for `http` and `:443` for `https`, preserves every other normalized port, and emits no trailing slash;
- credentials/userinfo, non-HTTP(S) schemes, paths other than empty or `/`, queries, and fragments are rejected before binding;
- the effective normalized `MCPConfig.PublicURL`, whether explicit or derived, is the sole authoritative MCP absolute-link origin and is never null after successful startup;
- the field is never persisted to SQLite, FTS, state bundles, receipts, item metadata, or logs;
- the field contains no bearer token, credential, query string, or fragment.

HTTP and MCP continue to expose the same product read operation. MCP's `app_url` is transport navigation metadata, not a new item-state concept.

## 5. Item detail content contract

The deep-link detail reuses the current Item Inspector and `ItemDetail` contract. It must expose, when available:

- localized title;
- original source title;
- source name;
- published time;
- summary;
- core insight;
- structured key points;
- extraction status and extraction source;
- original article link;
- Provenance and grouped-source information;
- current resonance state;
- existing explicit Inspector operations.

When generated content is unavailable, the Inspector retains the existing fallback hierarchy and still shows source identity, original title, extraction state, source evidence when retained, and the original link. It must not render invented Summary, Core Insight, or Key Points sections.

A direct route must expose the same legitimate actions as an in-app Inspector. Route loading itself does not execute those actions. After a successful read, every item-scoped action targets the returned `item.id` according to the §4.5 outcome matrix.

## 6. Authentication recovery

### 6.1 Source of truth

The exact browser location and current browser history entry are the return target. The application must not place a return URL or owner token into query parameters, fragments, logs, HTML, or separate persistent storage.

### 6.2 Flow
1. Resolve the browser route before token hydration, mount the route-owned first surface, and set its exact functional title. Every canonical, legacy, or dispatchable invalid item route owns the Inspector surface and `RESOFEED · INSPECTOR`; TODAY or Search must not flash first.
2. If no token exists, keep the exact URL, Inspector surface, and Inspector title while rendering the existing Owner Token Prompt.
3. On submission, validate through the existing authenticated API boundary.
4. On success, persist the token under `resofeed.ownerToken`, re-read the current route, and dispatch by the parser result without changing the route-owned surface or title. Canonical and legacy item routes load the target detail; legacy canonical replacement remains governed by §4.3. Dispatchable invalid item routes retain the invalid URL, render the localized invalid-link Inspector error, and issue no item API request.
5. On failure, remove the rejected stored token when applicable, keep the target URL and history state, and permit another submission.
6. If a later item-detail request returns `401`, enter the same prompt flow without replacing the route.
7. After successful recovery, focus the Inspector heading or current route error state. This item-route-specific focus rule governs over the generic Owner Token Prompt target. On non-Inspector routes, accepted authentication retains the existing focus target defined by `docs/DESIGN.md`: the Steer input or first Feed item.

No unauthenticated API response or static HTML may include item summary content.
### 6.3 First-detail performance

With a stored token, the target item-detail GET starts in parallel with shell bootstrap reads. It must not wait for Feed, Source Ledger, OpenRouter model-list, or current-operation requests to finish before beginning. The Inspector may render its stable loading state while processing language and shell metadata resolve.

## 7. Navigation and browser history

### 7.1 History state

History state is versioned and contains bounded navigation primitives only:

```text
version
surface
itemId
originSurface
feedPaneScrollTop
windowScrollY
searchRegionScrollTop
returnFocusItemId
```

Search filters remain in one canonical browser URL grammar:

```text
/?q={query}[&source={source}][&from={YYYY-MM-DD}][&to={YYYY-MM-DD}][&resonated={true|false}][&limit={1..100}]
```

The grammar is bidirectional and deterministic:

- the pathname is exactly `/` and the fragment is empty;
- `q` appears exactly once, including as `q=` for an empty query; this distinguishes the default Search route `/?q=` from the Feed route `/`;
- optional keys are `source`, `from`, `to`, `resonated`, and `limit`; each appears at most once and only in the order shown; unknown, duplicate, empty optional, out-of-order, or otherwise invalid keys make the Search route invalid before any API request or history write;
- names and values use UTF-8 query-component encoding: ASCII letters, digits, `-`, `.`, `_`, and `~` remain literal; every other byte uses uppercase `%HH`; space is `%20` and a literal plus is `%2B`;
- decoded `q` is preserved byte-for-byte and may be empty, subject to the HTTP `500`-byte limit; `source` is non-empty; `from` and `to` are real calendar dates with `from <= to`; `resonated` is exactly `true` or `false`; `limit` is canonical base-10 `1..100` without leading zeroes;
- null optional filters are omitted; effective default `limit=50` is omitted; all non-default values are emitted;
- the browser sends the same decoded state to `GET /api/search`; the returned `SearchQueryEcho` must equal it field-for-field (`q`, nullable `source`, nullable `from`, nullable `to`, nullable `resonated`, and effective `limit`), and serializing that echo must reproduce the same canonical browser URL;
- every cold load, refresh, Back, Forward, or visible-Close restoration re-runs lexical retrieval from that canonical URL; the restored query/filter state is stable, while the current SQLite/FTS corpus is authoritative and may produce different result membership, order, or count;
- recorded selection and originating-focus item IDs are best-effort references into the newly retrieved results; if either recorded item no longer appears, restore no selection and focus the Search query control after retrieval and layout instead of auto-selecting or focusing a substitute row;
- restore Search scroll only after current results and layout are ready, and clamp the stored coordinate to the current result-region bounds for whichever element owns Search scrolling;
- selection IDs and scroll/focus coordinates do not enter the query string; result rows and result arrays enter neither the query string nor history state.

History state must not contain item payloads, result arrays, owner tokens, saved searches, reading history, or command history.

Unknown, malformed, or future history-state versions are ignored safely and reconstructed from the URL.

### 7.2 Opening from Feed or Search

Before opening an item:

1. capture the active Feed/Search scroll coordinates and originating focus item;
2. `replaceState` the current Feed/Search history entry with that state;
3. `pushState` one item history entry with the selected item ID and origin surface;
4. update the address bar to `itemAppPath(item.id)`;
5. show the existing summary preview immediately when available;
6. load detail through the independent API item path.

Desktop Search keeps its result list visible beside the Inspector during the live session. Desktop Feed keeps the normal split workbench. Mobile uses the full-screen Inspector route.

### 7.3 Back and Forward
- Back restores the previous Feed/Search URL and state.
- Forward restores the item entry and reloads detail with GET only.
- Feed restoration uses the current Feed result set; it never treats a recorded selection or focus ID as authoritative after Feed refresh, ranking change, source removal, ingestion change, or date rollover.
- After current Feed data and layout are ready, restore the recorded selection and originating-row focus only when both referenced items remain. If either reference is absent and the current Feed is non-empty, desktop selects the first current Feed item under the normal TODAY auto-selection rule, narrow clears selection, and both layouts focus the first current Feed item. If the current Feed is empty, both layouts clear selection and focus the Steer input.
- Clamp each recorded Feed-pane and window scroll coordinate to its current bounds after data and layout are ready, then apply the clamped coordinate for the active Feed scroll owner. The absent-reference fallback does not reset a valid stored coordinate to `0`.
- Search restoration reparses the canonical query/filter URL and re-runs lexical retrieval; it never restores result rows from history, and current corpus changes may alter result membership, order, or count.
- After current Search results and layout are ready, restore recorded selection and originating-row focus only when both referenced items remain available. If either disappeared, restore no selection and focus the Search query control. Clamp the stored scroll coordinate to the current result-region bounds for the active Search scroll owner.
- A navigation generation prevents stale fetch or restoration work from changing the current route.
- A deleted item encountered on Forward remains on its item URL and shows the explicit not-found state.

On desktop TODAY, leaving the explicit item route restores the recorded Feed selection when both Feed references remain; otherwise the deterministic first-current-item fallback above preserves the rule that a non-empty desktop Feed keeps an Inspector selection. On narrow layouts, leaving the item route visibly closes the full-screen detail and applies the recorded-or-fallback selection and focus rules above.
### 7.4 Close behavior
- Item opened from a ResoFeed Feed/Search history entry: visible Close uses `history.back()` and restores that recorded origin against current data. Its visible text and accessible name are route-aware: `Return to TODAY` / `返回今日` for a recorded Feed/TODAY origin, and `Return to Search` / `返回搜索` for a recorded Search origin. Search re-runs lexical retrieval from the canonical URL; after current results and layout are ready, it restores recorded selection/focus only if both referenced items still appear, otherwise restores no selection and focuses the Search query control, with scroll clamped to the current result-region bounds.
- For a recorded Feed origin, restoration waits for current Feed data and layout. When both recorded selection and originating-focus items remain, restore them. If either is absent and Feed is non-empty, desktop selects the first current Feed item, narrow clears selection, and both layouts focus the first current Feed item. If Feed is empty, both layouts clear selection and focus the Steer input. Clamp recorded Feed-pane and window scroll coordinates to current bounds and apply the active owner's clamped coordinate; do not reset a valid stored coordinate solely because a recorded item disappeared.
- Browser Back and Forward use the same recorded Feed/Search entries and restoration contract in §7.3.
- External/cold item entry without a ResoFeed origin entry: visible Close uses visible text and accessible name `Return to Feed` / `返回列表`, replaces the current item history entry with `/`, and establishes a fresh Feed fallback instead of restoring any background Feed state. It must not push a Feed entry. After Feed data and layout are ready, reset both the Feed-pane and window scroll coordinates to `0`. If Feed has items, desktop selects the first item under the normal TODAY auto-selection rule, while narrow keeps no item selected until deliberate activation; both layouts focus the first Feed item. If Feed is empty, both layouts clear selection and focus the Steer input. Because the item entry is replaced, a subsequent browser Back leaves ResoFeed or continues to the pre-existing browser entry and cannot reopen the closed Inspector.
- Native mobile edge-swipe remains the browser/platform Back operation, not visible Close: from a recorded Feed/Search origin it restores that origin; from an external direct entry it follows the browser's pre-existing history and may leave ResoFeed. The sticky visible Close remains available when native Back is unavailable.
- Close must not unconditionally push a new Feed entry because that would make Back reopen the supposedly closed detail.
- `Escape` remains a distinct keyboard shortcut defined by `docs/DESIGN.md`: on a narrow Inspector route it returns to TODAY after inner controls decline the key. It does not claim parity with visible Close or browser Back, and it creates no durable navigation history.
## 8. Error and fallback states
| State | Trigger | Visible behavior | Recovery | Route behavior |
|---|---|---|---|---|
| Server-level malformed request target | raw cold load contains a malformed percent triplet such as `/items/%ZZ` | HTTP `400 Bad Request` from the existing Go server/request parser; SPA and Inspector do not load | correct or replace the URL | request is rejected before SPA dispatch; no item API request |
| Invalid item link | dispatchable invalid route syntax, including extra segment, encoded control code point, or malformed legacy token | localized “Invalid item link” / “无效的文章链接” in the Inspector surface | route-aware return action | retain invalid URL until user leaves; no item API request |
| Not found | authenticated detail returns `404 not_found` | localized “Item does not exist or was deleted” / “文章不存在或已被删除” | route-aware return action | retain item URL |
| Unauthorized | detail returns `401 unauthorized` | existing Owner Token Prompt | retry after token | retain item URL and history |
| Temporary API failure | network, `500`, or retryable `503` | terse localized error | explicit Retry and route-aware return action | retain item URL |
| Summary unavailable | detail exists with unavailable generated fields | render available provenance/evidence fields | existing re-ingest action when allowed | retain item URL |
| Duplicate resolved | authoritative item returned with relation metadata | render authority plus merge relation | normal detail actions | retain requested URL |
| Merge target unavailable | broken duplicate relation | render requested item plus warning | route-aware return action / original link | retain requested URL |

Dispatchable invalid route syntax must never cause the first Feed item to appear under the invalid URL. A raw malformed-percent cold load has no SPA-visible state because the Go serving boundary rejects it first.

The stable Inspector landmark remains mounted for dispatchable item loading and failures. Loading uses a polite status announcement. Asynchronous failures use an alert. Every SPA error state provides the route-aware return action from §7.4: visible text and accessible name `Return to TODAY` / `返回今日` for a recorded Feed/TODAY origin, `Return to Search` / `返回搜索` for a recorded Search origin, and `Return to Feed` / `返回列表` for an external/cold entry. For invalid-link, not-found, temporary API/network, and every other SPA error that exposes this action, activation invokes visible Close behavior: it restores the recorded Feed/Search origin with `history.back()` against current data, or replaces an external/cold item entry with `/` and establishes the fresh Feed fallback without pushing a Feed entry. Retry repeats only the read operation.
## 9. Component and module boundaries

### 9.1 `web/src/lib/workbench-route.ts`

Owns:

- canonical application-path encoding;
- legacy-token recognition;
- route validation and canonical replacement path;
- versioned history-state shape and validation;
- `itemAppPath` and `itemAppUrl`.

Does not own API calls, DOM mutation, authentication, or item data.

### 9.2 `web/src/lib/api-client.ts`

Owns authenticated item HTTP paths and requests. It uses a separate API item-token helper. It does not consume browser application paths.

### 9.3 `web/src/routes/+page.svelte`

Owns route coordination, token recovery, request generations, History API updates, scroll/focus restoration, and mapping response states into the Inspector. Feed and Search components only emit item activations.

### 9.4 `web/src/routes/components/Inspector.svelte`

Remains the sole detail renderer. It owns ready, fallback, relation, loading, and error presentation plus existing explicit item actions. It does not parse URLs or authenticate requests.

### 9.5 Go read/application boundary

Owns authoritative duplicate resolution while preserving direct storage reads. The transport receives an explicit resolution result rather than inferring duplicate authority in the UI.

### 9.6 Go MCP transport

Owns `PublicURL`-based `app_url` decoration for the three MCP item-read outputs. It does not persist navigation metadata.

## 10. Architecture basis

### 10.1 System layers

1. SQLite durable item and state storage.
2. Go read/application operations.
3. Go authenticated HTTP/MCP and static-asset shell.
4. Pure frontend route/history contracts.
5. Frontend navigation/authentication shell.
6. Feed, Search, and shared Item Inspector presentation.

Allowed dependency direction:

```text
Presentation
  -> navigation shell
  -> route contract and typed API client
  -> HTTP/MCP transport
  -> read operations
  -> SQLite
```

### 10.2 Source-of-truth matrix

| Fact | Owner |
|---|---|
| Item detail and current item state | SQLite and `ItemDetail` read operation |
| Duplicate authority | persisted `duplicate_of_item_id` and backend read projection |
| Browser item application path grammar | canonical architecture contract and frontend route helper |
| Browser Search URL/filter grammar | §7.1 and the frontend route helper; HTTP `SearchQueryEcho` is the round-trip equality check |
| HTTP item path grammar | existing opaque API token codec |
| Current deep-link target | browser location |
| Back/Forward restoration | current browser history entry |
| Owner token | existing browser-local token storage |
| Browser absolute-link origin | current/explicit browser origin |
| MCP absolute-link origin | effective normalized `MCPConfig.PublicURL`, populated from explicit `--public-url` or the total `--addr` derivation before MCP wiring |
| Detail presentation | existing Item Inspector |

### 10.3 Service catalog

The existing `cmd/resofeed` binary remains the only deployable. It serves static UI, JSON HTTP, MCP, and background ingest. No service or database is added.

### 10.4 Runtime contract

```text
Resolve URL
-> hydrate token
-> prompt in place when unauthorized
-> begin authenticated detail read
-> render shared Inspector
-> coordinate browser history
-> restore prior workbench state on traversal
```

Every item navigation has a generation identity. Stale responses cannot alter the current selection, route, error, focus, or content.

### 10.5 State strata

| Stratum | Allowed content |
|---|---|
| Durable | existing SQLite items, sources, item state, rules, receipts |
| Browser-persistent | existing owner token only |
| History-ephemeral | route, item ID, origin surface, scroll, return focus |
| Component-ephemeral | preview, loading/error, request generations |
| Process configuration | normalized Public URL |
| Derived | item application path and absolute app URL |

No navigation or `app_url` field enters portable state.

### 10.6 Transport rules

Allowed:

- public static SPA shell;
- authenticated API/MCP reads;
- encoded opaque ID in browser path;
- transport-derived MCP app URL.

Forbidden:

- item content in unauthenticated HTML;
- tokens in URLs or logs;
- mutation calls from route restoration;
- app-path reuse as API-path construction;
- request-host guessing for MCP public URLs;
- client-inferred duplicate groups.

### 10.7 Cross-cutting governance

- **Registries:** none added.
- **Lifecycle ordering:** route before token; auth before item data; restore after data/layout.
- **Coordination:** direct calls, browser History API, existing request-generation guards.
- **Wiring:** explicit imports, props, callbacks, typed client, and Go handler configuration.
- **Owners:** route helper owns grammar; page shell owns navigation; backend read owns authority; MCP shell owns absolute links.

No event bus, global mutable application store, DI container, or implicit global navigation mutation is permitted.

### 10.8 Shared abstractions

| Name | Owner | Consumers | Reason |
|---|---|---|---|
| `ResolvedWorkbenchRoute` | frontend route module | page shell and route tests | shared canonical/legacy/invalid result |
| `WorkbenchHistoryState` | frontend route module | page shell and browser tests | bounded restoration contract |
| `ItemReadResult` | Go read/HTTP contract | HTTP, MCP, frontend API types | exact ordinary/resolved/broken duplicate envelope |
| Item application-link contract | architecture spec | TypeScript and Go transport | cross-language URL parity |
| `itemAppPath` / `itemAppUrl` | frontend route module | Feed, Search, Inspector/copy | prevents path drift |
| server app-link projection | Go transport | three MCP item tools | prevents repeated Public URL logic |

Other state remains module-local.

### 10.9 Module split recommendations

No new layered package tree is needed. Keep changes in the existing flat modules. A small flat Go app-link helper is justified because three MCP tools consume it. Route/history pure logic stays in the existing frontend route module unless implementation and tests cease to fit comfortably together.

### 10.10 UX and runtime surfaces

| Surface | Entry | Required proof |
|---|---|---|
| Web detail | `/items/{item_id}` | URL, accessibility snapshot, network trace |
| JSON detail | `/api/items/~{unpadded RFC4648 base64url(item_id)}` | authenticated status/body contract |
| MCP item reads | `/mcp` | `app_url` values and absence of secrets |
| Tailnet public app | `https://resofeed.tefx.one` | external browser and Telegram evidence |

### 10.11 Open questions and readiness

- **Blocking open questions:** none.
- **Readiness:** READY.

## 11. Verification matrix
### 11.1 Unit tests

- canonical app-path generation and absolute URL generation;
- valid canonical path decode;
- valid legacy token decode and canonical replacement;
- invalid percent, invalid UTF-8, empty ID, extra segment, malformed legacy token;
- explicit distinction between frontend malformed-percent parser input and server-level malformed-percent cold-load handling;
- exact shared domain rejection for U+0000–U+001F, U+007F–U+009F, and ill-formed Unicode;
- generator-parser byte-identical round trips for every accepted fixture;
- leading literal `~` collision;
- exact canonical `!.` and `!..` generation and byte-identical parsing for the valid opaque IDs `.` and `..`, plus `%21.` / `%21..` non-collision for ordinary IDs beginning with literal `!`;
- `/`, `%`, `?`, `#`, `+`, space, Unicode, emoji, and composed/decomposed Unicode;
- canonical Search URL serialization and parsing for `q`, `source`, `from`, `to`, `resonated`, and `limit`, including exact key order, `%20`/`%2B`, uppercase escapes, `q=` for empty Search, nullable-filter omission, default-limit omission, and exact `SearchQueryEcho` round trips;
- Search route rejection for missing `q`, unknown/duplicate/out-of-order keys, empty optional values, non-canonical encoding, invalid dates/ranges, invalid booleans, and invalid/non-canonical limits;
- history-state validation and unknown-version fallback;
- independent application-path and API-path generation.

### 11.2 Go HTTP tests

- static SPA fallback for canonical, legacy, and dispatchable invalid item routes;
- a raw malformed-percent request target such as `/items/%ZZ` receives HTTP `400 Bad Request` from a real Go server before the SPA/static handler; assert handler-not-hit, no redirect, no item API request, and no item-content response;
- a real Go server round trip for raw ID `~slash/%?hash#雪`, using its exact canonical percent-encoded browser path and opaque API token;
- the static request reaches the SPA without redirect/path-cleaning drift, and the authenticated detail read receives the byte-identical raw ID;
- real-server cases for raw IDs `.` and `..`, plus one fixture whose encoded slash/dot sequence would clean to an existing embedded asset path: each exact canonical request returns the SPA index bytes with no `Location` header, redirect, or asset-byte substitution, and the authenticated detail read receives the byte-identical raw ID;
- authenticated detail read with opaque API token;
- `401`, `404`, and temporary failure envelopes;
- exact ordinary, duplicate-resolved, and broken-target `ItemReadResult` fields and nullability;
- no mutation of `item_state` from GET;
- no item content in unauthenticated static HTML.

### 11.3 MCP tests

- all three item-read tools expose required non-null `app_url` at the specified location;
- explicit production Public URL yields exact production-style absolute links;
- accepted explicit Public URL cases cover uppercase HTTP(S) scheme/DNS input, `localhost`, valid ASCII DNS including a valid `xn--` A-label, canonical IPv4, bracketed non-zone IPv6, omitted port, leading-zero port, default `:80`/`:443`, non-default port, and empty or sole `/` path; assert exact lowercase host/scheme, compressed bracketed IPv6, canonical decimal port, default-port omission, non-default-port preservation, and no trailing slash in every emitted `app_url`;
- rejected explicit Public URL cases cover credentials, non-HTTP(S) schemes, empty host, wildcard/unspecified host, `*`, Unicode host spelling (without IDNA conversion), trailing-dot DNS, percent-encoded host, numeric dotted host that is not canonical IPv4, leading-zero or out-of-range IPv4 components, malformed/bracketless/zone-bearing IPv6, IPvFuture, empty/signed/non-decimal/zero/out-of-range port, non-root path, query, fragment, and surrounding whitespace; every case exits before binding;
- omitted `--public-url` produces exact normalized origins for accepted `--addr` classes: ASCII DNS hostname, `localhost`, specific IPv4, `0.0.0.0`, specific bracketed IPv6, and `[::]`; assert DNS lowercase, canonical decimal port, bracketed IPv6 URL form, and both wildcard-to-loopback mappings;
- startup rejects every excluded bind-address class before binding: missing host/port, non-decimal or out-of-range port, unbracketed IPv6, IPv6 zone, Unicode hostname, `*`, scheme/path/query/fragment/userinfo contamination, and malformed DNS/IPv4/IPv6 literals;
- every successful explicit or derived startup exposes that exact non-null effective normalized `MCPConfig.PublicURL` to all three item-read projections;
- credential-bearing Public URLs are rejected before binding and never appear in output or logs;
- route encoding matches frontend generation;
- `read_item` returns the exact `ItemReadResult` relation fields while preserving optional top-level `fallback_reason` compatibility;
- raw owner token, Authorization header, credentials, query, and fragment are absent;
- read tools do not change inspected, delivered, or resonated state.

### 11.4 Frontend component and API-client tests

- direct item route loads the shared Inspector;
- invalid and not-found routes keep a stable Inspector state;
- direct route exposes existing legitimate detail actions;
- API client uses the API token helper rather than `itemAppPath`;
- duplicate relation is displayed once for resolved and broken-target outcomes;
- summary-unavailable fallback remains readable;
- copy-link uses the authoritative `itemAppUrl` after successful resolution.

### 11.5 Browser tests
Desktop and narrow/mobile matrices must cover:

- authenticated canonical cold load and refresh;
- before token hydration or shell API work, direct canonical, direct legacy, and dispatchable invalid item routes mount the Inspector-owned first surface and exact `RESOFEED · INSPECTOR` document title with no intermediate TODAY/Search surface or title;
- missing token -> prompt -> success -> target detail while the exact item URL, Inspector surface, and `RESOFEED · INSPECTOR` title remain stable;
- missing token -> prompt -> accepted token on a dispatchable invalid item route retains the invalid URL and localized invalid-link Inspector error while issuing zero item API requests;
- rejected stored token -> retry -> target detail with the same identity assertions;
- later item-detail `401` -> prompt -> retry with the same identity assertions;
- accepted authentication on a non-Inspector route moves focus to the Steer input or first Feed item, while accepted authentication on an Inspector item route moves focus to the Inspector heading or current route error state; each case asserts the active element after route data and layout are ready;
- invalid dispatchable route, `404`, network failure, `500`, and retryable `503` retain the Inspector surface and exact Inspector title;
- raw malformed-percent cold load such as `/items/%ZZ` produces the selected server-level HTTP `400` document outcome, does not load the SPA/Inspector, and issues no item API request; this case must not assert the dispatchable invalid-link UI;
- Feed click -> item URL -> Back -> Forward, asserting exact title transitions `RESOFEED · TODAY` -> `RESOFEED · INSPECTOR` -> `RESOFEED · TODAY` -> `RESOFEED · INSPECTOR` and no intermediate wrong surface/title;
- recorded-Feed history-mutation matrices open an item, then change Feed membership before Back or visible Close so the recorded selection or originating-focus item is absent and the current Feed scroll bounds shrink. Non-empty-current-Feed cases separately cover each missing reference and assert clamped active-owner scroll, first-current-item selection on desktop only, and first-current-item focus on both desktop and narrow. Empty-current-Feed cases assert clamped scroll, no selection on either layout, and Steer-input focus;
- Search with filters -> item URL -> visible Close/Back -> Forward, asserting the exact canonical Search URL, decoded fields, returned `SearchQueryEcho`, result scroll, originating focus, and exact title transitions `RESOFEED · SEARCH` <-> `RESOFEED · INSPECTOR`;
- a Search history-mutation fixture opens an item, mutates the indexed corpus before Back so the recorded selected/origin row no longer matches and the current result region is shorter, then proves Back re-runs lexical retrieval from the canonical URL, stores no result rows or arrays, preserves URL/query/filter echo, restores no selection, focuses the Search query control, and clamps the stored scroll coordinate to the current result-region bounds;
- Search fixtures cover empty/default `/?q=` and non-default Unicode/space/literal-plus filters; refresh and traversal reproduce the same canonical URL and filter state, with default `limit=50` omitted from the URL and present in the echo;
- visible Close and browser Back restore the recorded Feed/Search origin, filters, scroll, and focus;
- route-aware visible-Close browser matrices assert both visible text and accessible name, plus the resulting target: recorded Feed/TODAY origin uses `Return to TODAY` / `返回今日` and restores the recorded Feed entry; recorded Search origin uses `Return to Search` / `返回搜索` and restores the canonical Search URL; external/cold entry uses `Return to Feed` / `返回列表` and replaces the item entry with `/`;
- SPA-error return-action matrices repeat those three label-to-target assertions for dispatchable-invalid, not-found, and temporary API/network states: recorded Feed/TODAY and Search origins restore against current data, while external/cold entries are replaced with `/`, establish the fresh Feed fallback, and cannot reopen the Inspector on the next Back;
- narrow-route `Escape` returns to TODAY as the documented distinct shortcut and does not claim visible-Close/Back parity;
- narrow/mobile native browser Back restores Feed and Search origins without custom swipe behavior; external direct-entry native Back follows pre-existing browser history;
- external direct-detail visible Close matrices cover desktop and narrow with both non-empty and empty Feed fixtures: Close replaces the item entry with `/`, resets Feed-pane and window scroll coordinates to `0` after Feed data/layout, and the next browser Back cannot reopen the Inspector; for non-empty Feed, desktop selects and both layouts focus the first Feed item while narrow has no selection; for empty Feed, both layouts have no selection and focus the Steer input;
- Feed pane, Search result, and window scroll restoration;
- originating row focus restoration;
- legacy route canonicalization with `replaceState` while the Inspector first surface/title remain stable;
- canonical browser navigation for raw ID `~slash/%?hash#雪` preserves the exact encoded address through cold load, refresh, Back, and Forward, while the authenticated API request resolves the byte-identical raw ID;
- rapid A -> B navigation with stale A responses;
- item deletion between history creation and Forward;
- network trace proving route/refresh/auth retry/history traversal issue no inspect, delivery, or resonance writes;
- explicit Feed/Search activation produces at most one intended inspection write;
- ordinary, resolved-direct-duplicate, and broken-target fixtures prove deliberate inspection, resonance, and re-ingest each mutate exactly the §4.5 effective item row and no other item, `item_state`, or `search_fts` row.

Use a Telegram-WebView-equivalent mobile viewport and user agent in automated coverage. Automation complements the required real-client release checks.
### 11.6 Release verification

Required environments:

- Safari;
- Chrome;
- Telegram iOS;
- Telegram Android;
- Telegram Desktop;
- email-client link opening;
- Codex or equivalent external automation consuming MCP `app_url`;
- the production Tailnet/Caddy route at `https://resofeed.tefx.one`.

For each Telegram client, capture:

1. link opens the canonical percent-encoded `https://resofeed.tefx.one/items/{segment}` address;
2. the first SPA surface is Inspector with exact title `RESOFEED · INSPECTOR`, including before missing-authentication recovery; TODAY or Search never appears first;
3. missing authentication shows the token prompt without changing that URL, surface, or title;
4. successful token entry returns to the same item URL and moves focus to the Inspector heading or current route error state;
5. Inspector content is readable in the client viewport;
6. refresh/reopen preserves the item and Inspector identity;
7. item state remains unchanged unless the user invokes an explicit action.

Safari and Chrome evidence must also capture accepted authentication on a non-Inspector route and prove focus moves to the Steer input or first Feed item, separate from the Inspector-route focus case above.

Desktop and narrow/mobile release evidence must separately capture Feed-origin and canonical Search-origin item entry, native browser Back, visible Close, Forward where the platform exposes it, external direct entry, external visible Close to `/`, and Back after that Close. Feed/Search origins restore their exact URL, filters, scroll owner, and focus; external native Back follows pre-existing browser history. External-Close evidence uses both non-empty and empty Feed fixtures in each layout and waits for Feed data/layout before asserting outcomes: Feed-pane and window scroll coordinates are `0`; with items, desktop selects and both layouts focus the first Feed item while narrow has no selection; without items, both layouts have no selection and focus the Steer input. The replaced external item entry cannot reopen on later Back. No custom edge-swipe implementation is permitted.

Tailnet/Caddy evidence must seed or fixture the raw ID `~slash/%?hash#雪`, open its exact canonical application URL through `https://resofeed.tefx.one`, and prove all of the following without proxy normalization: the browser address is unchanged, the static SPA fallback succeeds, the authenticated API lookup receives the byte-identical raw ID, the Inspector renders that item, and the returned MCP `app_url` equals the same credential-free canonical URL. Capture explicit and omitted/local-derived Public URL checks separately; production uses explicit `https://resofeed.tefx.one`.

Malformed-percent evidence is separate: send a raw `/items/%ZZ` cold-load request through the real serving boundary and capture HTTP `400` before SPA dispatch. Do not classify that server-level response as the SPA invalid-link screen; separately capture one dispatchable invalid item route rendering the localized Inspector error.

## 12. Documentation sync

Implementation completion requires synchronized updates to:

- `docs/ARCHITECTURE.md`;
- `docs/DESIGN.md`;
- `docs/ITEM_DEEP_LINKS.md` if implementation clarifies a contract without changing scope;
- `README.md` or `docs/USAGE.md` for user-facing deep-link and authentication behavior;
- HTTP/MCP schema documentation;
- route, API, component, browser, Tailnet, and Telegram verification evidence.

Documentation must not advertise the deep-link feature as shipped before runtime verification passes.

## 13. Execution order

1. Lock the canonical contract and expected-red tests.
2. Implement pure route/link/history primitives and independent API paths.
3. Implement duplicate-resolved reads and MCP app URLs.
4. Implement frontend route, authentication, error, Inspector, and copy behavior.
5. Implement Back/Forward, scroll, focus, and accessibility restoration.
6. Run local unit, HTTP, MCP, and browser verification.
7. Deploy through the existing Tailnet stack.
8. Run real Telegram/client verification.
9. Perform independent architecture, design, security, and release review.

The vectl planner owns the formal phase/step mutation and must preserve completed plan history while adding this remediation as new work.
