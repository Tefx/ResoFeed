# ResoFeed Product Requirements Document

Version: 1.1
Status: Product requirements draft for architecture and UI/UX handoff

## 1. Product Identity

**Product name:** ResoFeed

**Product type:** Personal RSS intelligence system for humans and delegated AI agents.

**Positioning:** ResoFeed turns noisy, time-sensitive RSS feeds into a fresh, searchable, policy-steerable personal intelligence stream.

**Core promise:** ResoFeed helps the user stay informed without managing an inbox: fresh items get surfaced, valuable items become memory, and future behavior can be corrected in plain language.

**Guiding rule:**

> Today is for freshness. Star is for memory. Search is for retrieval. Coverage is for not missing the world.

### 1.1 Adoption promise

A new user should understand ResoFeed within one session:

- Today shows what deserves attention now.
- Resonate remembers what matters later.
- Steer corrects future behavior without settings work.

The user should not need to understand ranking systems, folders, archive states, or unread mechanics to feel in control.

### 1.2 Differentiation

ResoFeed is not a classic RSS reader optimized for unread management.

ResoFeed is not primarily a read-it-later archive.

ResoFeed is not a generic AI news digest detached from user-owned sources.

ResoFeed is a personal intelligence stream built on user-controlled RSS sources, trustworthy compression, durable memory, and natural-language steering.

The reason to switch from a conventional RSS reader or AI digest is that ResoFeed combines user-owned sources, efficient daily review, trustworthy summaries, durable memory, and plain-language correction in one minimal loop.

## 2. Target Users and Core Workflows

### 2.1 Primary user

The primary user is a human who reads RSS-derived intelligence across multiple contexts:

- lightweight mobile review during commute or downtime;
- focused desktop review at the start of a work session;
- later retrieval when looking for a remembered article or topic.

### 2.2 Delegated agents

Delegated agents act on behalf of the human. Examples include a delivery agent or a scheduled briefing agent.

ResoFeed itself does not own downstream delivery channels such as Telegram, Slack, email, or similar systems. It must expose enough product capability for authorized agents to retrieve, acknowledge, and feed back interactions without creating a second product surface.

ResoFeed must deliver its core daily value without requiring the user to configure delegated agents.

### 2.3 Core human workflows

1. **Commute review:** The user sees a short, high-signal digest produced by an external agent. They may inspect, star, or send simple feedback.
2. **Desk review:** The user opens ResoFeed and quickly scans new and relevant items, inspecting a subset in more depth.
3. **Long-term retrieval:** The user searches for an article or topic later. Previously resonated items should be easier to retrieve, but not manually filed.
4. **Policy correction:** The user can tell ResoFeed how to adjust future scoring or summaries in natural language.

### 2.4 First-run experience

As a single-tenant tool, ResoFeed has no onboarding wizards, no account registration flows, and no "ghost briefings" for empty states. The first useful experience must be fast, low-friction, and completely utilitarian.

Requirements:

- support importing existing RSS subscriptions via OPML, with all folder structures instantly flattened;
- support manual source entry exclusively by pasting URLs into the Steer input;
- explain Inspect, Resonate, and Steer in plain user language within the standard UI, not via a separate tour;
- produce an initial useful daily surface as soon as enough items are processed.

**First-session success:** A new user should be able to import or add sources, see a useful Today surface, inspect at least one item, resonate with at least one item, and understand that steering is optional. Agent setup, delivery-channel configuration, foldering, tagging, and ranking customization must not exist or be required for first value.
## 3. Product Vocabulary

This vocabulary defines product semantics only. Architecture and UI/UX own implementation details.

| Term | Product meaning | Must not mean |
| --- | --- | --- |
| **Fresh / recent** | Newly arrived or time-sensitive enough to deserve daily attention. | A fixed implementation window dictated by the PRD. |
| **Old** | No longer naturally competing for daily attention unless renewed by a related development. | Deleted, forgotten, or inaccessible. |
| **Inspect** | A deliberate allocation of attention to an item or externally delivered item. | Agreement, durable preference, or passive dwell-time tracking. |
| **Inspector** | The structured reading surface for a selected item, including generated summary, core insight, Key Points, provenance, and applicable status messages. | A second feed, a mini-article embedded in feed rows, or a place to hide provenance. |
| **Key Points** | A first-class generated content concept: a fixed set of 3–5 source-grounded, high-density points for structured reading. | Raw Markdown emitted by the model, optional decorative bullets, or content shown directly in feed rows. |
| **Source/provenance title** | The literal title captured from the RSS/source item and preserved as evidence. | A localized or model-rewritten display headline. |
| **Localized display title** | The Chinese display title generated for reading when Chinese is the processing language. | A replacement for literal source provenance. |
| **Resonate** | Durable value worth remembering and amplifying. | Agreement, ideological endorsement, pinning, or save-for-later. |
| **Steer** | Explicit natural-language correction to future system behavior. | Casual chat or a hidden configuration language. |
| **Trusted source** | A configured or justifiable source whose provenance is visible enough for coverage decisions. | A hardcoded source list hidden from the user. |
| **Coverage** | Lightweight awareness of relevant news-like items that may not deserve resonance. | A separate tab, a firehose, or generic world-news injection beyond the user’s source universe. |
| **Eligible for surfacing** | Allowed to appear in a daily or agent-mediated experience under product rules. | Guaranteed top placement. |
| **Surfaced externally** | Delivered or presented to the human by a delegated agent. | Merely fetched by an agent for silent evaluation. |

## 4. Product Principles

### 4.1 Complete minimalism

ResoFeed should be complete in its core loop from day one, but minimal in the number of concepts exposed to the user.

Minimalism means:

- no inbox-zero pressure;
- no unread-count optimization;
- no manual archive workflow;
- no secondary holding queues, isolated filter views, or moderation consoles;
- no folders or tag trees as primary organization;
- no settings screens full of ranking sliders;
- no separate human and agent behavior models.

### 4.2 Human-first, agent-compatible

The primary product must feel designed for human attention and recall. Agent access is a required capability, but not the product’s center of gravity.

Humans and agents should operate on the same product concepts: inspect, resonate, and steer.

### 4.3 Freshness before hoarding

RSS content is time-sensitive. ResoFeed must prevent old interesting items from permanently occupying daily attention. Long-term value should improve memory and retrieval, not block new information.

### 4.4 Trustworthy compression

Summaries must preserve factual density, source provenance, and uncertainty. ResoFeed must avoid vague blogger-style summaries and unsupported synthesis.

Trustworthy compression requires:

- clear source attribution;
- visible indication when only partial content was available;
- preservation of important uncertainty, disagreement, and caveats;
- easy access to the original article;
- avoidance of unsupported synthesis across sources;
- distinction between reported fact, source claim, and model-generated interpretation when relevant.

### 4.5 User Sovereignty (No Paternalism)

The system does not "protect" the user from their own choices. If a user subscribes to a high-volume source, the system delivers it. We do not build hidden rate-limiters, auto-collapsing spammers, or "smart" noise reduction beyond what the user explicitly Steers.

### 4.6 AI as Utility & Minimal Fallback Taxonomy

AI is treated as fundamental infrastructure (like electricity). We do not build complex UI degradation states, elaborate error screens, or secondary fallback modes for the rare event that the LLM API goes down.

However, the system **must** support and document a strict canonical fallback taxonomy to maintain operational transparency:
- `summary unavailable`: When the AI fails to generate a summary, show the raw feed excerpt when available.
- `partial extraction`: Internal/source-quality state used when full extraction is blocked (paywall/anti-bot) but RSS excerpt text exists; user-facing copy must describe this as source-text provenance such as `source text: RSS excerpt only` or compact `source excerpt`, not as model failure.
- `original unavailable`: When the source link is dead or malformed.
- `model latency/error`: Exposed only in the `/doctor` command.
- `RSS fetch error`: Exposed only in the `/doctor` command.

We explicitly forbid "cute" illustrations, skeleton loaders, or conversational apologies for these states.

### 4.7 Single-Tenant / Tool-like Nature

The product is a single-user tool, not a multi-tenant SaaS. There is no account registration flow, no onboarding wizards, no "ghost briefings" for empty states, and no complex auth models.

### 4.8 Complete State Portability

The user owns their data. Complete active-state portability is the JSON state bundle defined by `docs/ARCHITECTURE.md §5.5 State Portability`. Complete state includes the Source Ledger, current active steering policy rules, and currently resonated items. OPML import/export remains source-list exchange only and is not a complete state-restore format. Raw text may be used for human-readable feedback or diagnostics, but it is not a separate complete-state import contract.

## 5. Core Product Primitives

ResoFeed has exactly three core user-visible primitives.

Other product terms may appear as explanations, provenance, or system states, but Inspect, Resonate, and Steer are the only primary user-visible primitives.

### 5.1 Inspect

**Meaning:** The user or agent allocated attention to an item in a way relevant to the human workflow.

Examples:

- a human opens an item for more detail;
- a human opens an item from an external digest;
- an authorized agent confirms an item was successfully delivered or presented to the human in an external context.

Product requirements:

- Inspect is a context signal, not an endorsement.
- Inspect helps prevent duplicate surfacing between human and agent workflows.
- Inspect may influence short-term continuity, but must not become a durable preference by default.
- Inspect must not rely on passive surveillance such as dwell time, viewport tracking, or scroll-depth tracking.
- Silent agent evaluation must not count as Inspect unless the item was actually surfaced to the human.

### 5.2 Resonate

**Meaning:** The item is worth preserving as durable value.

Resonate is represented conceptually as a star. It means: “preserve and amplify this kind of value.” It does not necessarily mean “I agree.”

Product requirements:

- Resonate is the primary durable positive signal.
- Resonate improves future retrieval and may influence future relevance.
- Resonate must not pin old items indefinitely into the daily feed.
- Resonate must remain distinct from agreement, endorsement, or ideological alignment.
- Resonate must be reversible or correctable by the human.

### 5.3 Steer

**Meaning:** The user gives natural-language correction to the system’s future behavior.

Examples:

- "https://example.com/feed.xml" (pastes an RSS URL to subscribe)
- “There is too much XXX recently; reduce it.”
- “Push more YYY technical documents.”
- “Do not penalize ZZZ articles just because they disagree with me.”
- “Add AAA perspective to future summaries.”
- `/doctor` (outputs raw system health: RSS fetch errors, LLM API latency in plain text)

Product requirements:

- Steering must be expressible in natural language.
- Steering must adjust future scoring, surfacing, or summary behavior.
- Steering must be treated as an explicit correction, not as casual conversation.
- Steering changes **must** be understandable and reversible by the human.
- Steering **must** be a lightweight intent control with basic inputs. We accept reduced determinism for the sake of strict UI simplicity.
- Steering must not become a rule-management product: no rule builder, no manual weight editor, no per-rule CRUD workflow, and no requirement that the user maintain a complex policy document.

### 5.4 Intent Data Management

The system must manage user preferences—specifically Steering commands and current Resonate state—according to the following minimalist constraint:

- **Current State Only:** The system must treat user steering commands and resonated items as active state. The system is not required to maintain a complex event-sourced ledger of past corrections. When a rule is deleted or superseded by a new Steer command, the active policy is simply updated or softly deleted.
- **Data Transparency (Exportability):** The user's active steering rules and current resonance state must be exportable through the JSON state bundle, using human-readable fields where defined by architecture.

## 6. Actor Model and Authority

### 6.1 Actor classes

ResoFeed must distinguish at least these actor classes at the product level:

- **Human owner:** the primary user; highest product authority within safety, legality, and product-invariant constraints.
- **Delegated agent:** an authorized external agent acting on behalf of the human.
- **System process:** ResoFeed’s own automated ingestion, understanding, and ranking behavior.

### 6.2 Authority rules

- Human steering has priority over delegated-agent steering.
- Delegated-agent actions must be clearly attributable to the human via simple receipt tags (no extensive activity ledgers).
- Agents may inspect items and return user feedback.
- In the current product scope, possession of the owner token is the delegation boundary for external agents; ResoFeed does not maintain a separate per-agent authorization registry.
- Agents may resonate or steer only through owner-token-authorized workflows.
- The human must be able to correct or override agent-generated drift.
- Agent-generated steering must produce a user-visible receipt that identifies the agent, summarizes the change, and offers an understandable correction path.

### 6.3 Agent reliability rules

- Agent mutating actions must be safe under retries and loops; duplicate submissions of the same intended action must not corrupt user state.
- Agent silent evaluation must be separated from external surfacing.
- Agent-mediated delivery must be recorded in a way that prevents repetitive surfacing of the same item.
- Missing or invalid owner-token authority is rejected at the transport/auth boundary and must not create a holding queue, moderation queue, or pending-agent workflow.

## 7. Source Intake and Item Understanding

### 7.1 Feed intake

ResoFeed must:

- support configured RSS and Atom sources;
- remain continuously available for mobile and delegated-agent workflows even when the user’s personal computer is asleep; deployment topology is architecture-owned;
- detect source failures without blocking other sources;
- preserve enough source provenance for the user to understand where each item came from.

### 7.2 Source management: Steer + Flat Ledger

Source management adheres to a "Steer + Flat Ledger" hybrid pattern to strictly enforce the product's extreme KISS constraint and eliminate settings panels.

Requirements:

- **Source Addition:** Pasting an RSS URL directly into the existing `Steer` command input is the primary way to subscribe. There is no dedicated "Add Source" wizard and no second URL-entry field inside Source Ledger.
- **Source Ledger Access:** Source Ledger may be reached through a discreet `RESOFEED` surface menu. `SOURCE LEDGER` does not need to be a persistent always-visible top-level link as long as the menu entry is keyboard and pointer reachable.
- **Source Ledger:** Source management is restricted to a strictly flat, barebones "Source Ledger" view.
- **Manual Fetch Controls:** The Source Ledger explicitly may expose lightweight manual ingestion controls: one global `[RUN INGEST]` control that runs ingestion for all active sources and one per-source `[FETCH]` control that fetches a single source. These controls are operational commands, not a job dashboard.
- **No Hierarchies:** The ledger supports viewing the source name/URL, deleting it, viewing source diagnostics/details, importing OPML, exporting/importing portable state, and running the lightweight manual controls above. There are no folders, no tags, no pause/resume toggles, no drag-and-drop ordering, and no complex settings panels.
- **No Job Surface:** Manual controls must not create persistent jobs, queues, retry panels, command history, activity ledgers, sync/merge concepts, or portable manual-ingest receipts.
- **OPML Import:** OPML files can be imported via the ledger, but all folder structures within the OPML must be ignored and flattened instantly upon import.

### 7.3 Duplicate and story handling

ResoFeed must reduce attention waste from duplicate reporting.

Requirements:

- repeated versions of the same article **must** not appear as separate equal-priority items;
- multiple reports of the same story **must** be transparently clustered or otherwise made understandable as one story-level event;
- the user **must** be able to access source provenance when the system deduplicates or groups related feed items;
- grouping **must** preserve direct access to every original source item and provenance so false-positive grouping does not destroy or hide individual source context; grouping must never behave like source suppression, hidden volume throttling, or a spam folder.

### 7.4 Content extraction quality

ResoFeed must attempt to understand the full linked article, not only the feed excerpt.

Requirements:

- if full content is unavailable, the item **must** remain visible when appropriate rather than silently disappearing;
- if local full-content extraction and RSS excerpt fallback cannot recover usable source text and external recovery is configured, ResoFeed **must attempt external source-text recovery once** for eligible HTTP(S) links before classifying the original as unavailable;
- external source-text recovery **must** be general enough for JavaScript-heavy article pages, with X/Twitter links treated as a known high-value case rather than the only allowed host;
- extraction limitations **must** be visible as source-quality/provenance information (see Fallback Taxonomy);
- source text quality **must** be described separately from summary/model status: a model-backed summary may still be based on RSS excerpt text when full article extraction is unavailable;
- unusually large, inaccessible, paywalled, or boilerplate-heavy content **must** degrade gracefully;
- extractor sanitation **must** preserve valid article paragraphs while removing navigation, sidebars, footer/header content, executable metadata, login/signup shells, trend/sidebar chrome, metadata-only payloads, and obvious newsletter/privacy boilerplate;
- summary quality expectations **must** adapt to available source quality;
- when Chinese is the processing language, external-recovered source evidence must still produce complete Chinese generated reading content under the same contract as locally extracted evidence; source/provenance literals remain unchanged;
- Tavily source-acquisition failures must remain source-acquisition diagnostics: timeout maps to public item/reprocess `timeout`, provider/network/HTTP/schema failure maps to public item/reprocess `provider_error`, and sanitized unusable evidence maps to public `original_unavailable`; these failures must not be stored as OpenRouter `model_status`.

### 7.5 Item understanding outputs

Every processed item must provide enough information to support scanning, structured reading, ranking, retrieval, and agent handoff.

Required product-level outputs:

- objective quality assessment;
- value tier or equivalent priority category;
- localized display title when generated reading content is available in Chinese;
- preserved source/provenance title that remains literal and distinguishable from the localized display title;
- concise core insight as exactly one generated sentence;
- dense factual summary;
- Key Points as a first-class generated content concept with a fixed 3–5 source-grounded items for successful generated output;
- source and extraction provenance, including whether usable evidence came from local readable extraction, RSS excerpt fallback, or configured external recovery;
- topical metadata and searchable text for retrieval and ranking;
- concise rationale for why the item may deserve attention when surfaced;
- processing and re-ingest status messages that are user-facing and Chinese-localized when Chinese is the processing language.

Generated reading content must be Chinese-localized when Chinese is the processing language. Source and provenance literals, including URLs, source IDs, source names, source titles, product/company names without conventional Chinese renderings, and exact source quotes, must remain unchanged.

Failed re-ingest or reprocessing attempts must be non-destructive: the current usable generated content remains visible, and the latest attempt failure is recorded separately for user-facing status and diagnostics.

Historical items should be re-ingested after the new content contract is implemented so older content can gain localized display titles and Key Points where source data allows.

Exact data shapes, models, schemas, and storage choices are architecture-owned and not specified by this PRD.

## 8. Daily Feed Behavior

### 8.1 Unified daily attention surface

ResoFeed must provide a primary daily experience that lets the human quickly understand what is new, relevant, and worth inspecting without managing folders, numeric indicators, or archive states.

The feed list is the scanning surface. It may show compact item identity, localized display title, summary preview, provenance, and value/provenance labels, but it must not show Key Points. Users who need structured reading details should open the Inspector.

The product requirement is a unified low-friction daily experience. Specific layout, navigation, density, and visual hierarchy are UI/UX-owned.

### 8.2 Freshness constraint

Fresh items must have a reliable path into the daily experience.

Requirements:

- recent items must not be crowded out solely by older resonated interests;
- old resonated items **must** move from daily attention into memory/retrieval;
- old items may reappear only when they are useful context for a new related development;
- the default product policy **must** distinguish newly arrived items from older memory items.

### 8.3 Resonance constraint

Current resonance state should improve relevance and retrieval without becoming a hoarding mechanism.

Requirements:

- resonated topics may influence future relevance;
- resonated items **must** rank higher in later search when relevant;
- resonated items **must** not become persistent homepage pins by default.

### 8.4 Coverage constraint

News-like items often matter even when the user does not star them.

Requirements:

- ResoFeed **must** preserve awareness of small but relevant news from the user’s configured source universe;
- lack of resonance on news items **must** not automatically mean the user does not want news coverage;
- the feed algorithm **must** not invent a hidden "trusted source" taxonomy; trusted status is exclusively derived from explicitly configured subscriptions or transparently logged Steer intents, and must never be managed via a hidden editable category.
- coverage items **must** avoid overwhelming higher-value analysis or documents;

### 8.5 Daily habit loop

ResoFeed must support a repeatable daily rhythm without inbox-zero mechanics.

Requirements:

- the daily experience **must** be useful in a short session, such as a commute or workday start;
- the user **must** be able to leave without clearing, archiving, or triaging all items;
- the system **must** distinguish “important today” from “retrievable later”;
- external digests **must** provide enough context for quick judgment while preserving a path to inspect the original item;
- the product **must** avoid creating guilt through stale queues, badges, or unresolved counts.

### 8.6 Feed lifecycle

Feeds are persistent by default and remain accessible without automatic expiry mechanisms.

Requirements:

- unread items must not be deleted at midnight;
- if a user is busy for days, they should not lose their feed;
- the feed must provide pagination or continuous scroll, grouped softly by time (e.g., "Today", "Yesterday");
- empty states simply indicate "no new items" rather than punishing the user for missing days.

## 9. Policy and Conflict Rules

### 9.1 Baseline policy

ResoFeed must work well before the user customizes it.

Default behavior should prioritize:

- relevance;
- credibility;
- novelty;
- factual density;
- source quality;
- freshness.

### 9.2 Steering precedence

When rules conflict, ResoFeed must follow this product-level precedence:

1. **Safety and legality constraints.**
2. **Product invariants:** freshness, coverage, provenance, and minimalism.
3. **Human steering.**
4. **Delegated-agent steering.**
5. **Default scoring and summarization policy.**

Human steering can strongly influence ranking and summaries, but must not silently disable product invariants such as freshness and coverage. If a user explicitly requests behavior that conflicts with an invariant, ResoFeed should explain the conflict and offer the closest allowable interpretation.

### 9.3 Steering lifecycle

ResoFeed must make steering understandable.

Requirements:

- a steering instruction **must** have a visible interpretation or confirmation receipt inline;
- the human **must** be able to correct a bad interpretation via the Steer text input;
- active steering rules **must** remain inspectable at a product level through a single explicit text action (`export state`) and through terse inline receipts. There must be no dedicated Settings Dashboard or Policy Rules UI;
- materially conflicting steering **must** be surfaced in plain language when it affects future behavior;
- human steering **must** be reversible or supersedable;
- agent-generated steering **must** be visibly attributable and easy to correct;
- steering transparency **must** be provided through a concise human-readable summary or raw JSON export, not through a complex rule-management interface.

## 10. Search and Retrieval

Search is a first-class workflow, but not a core visual primitive on par with Inspect/Resonate/Steer. It may appear via command syntax inside the Steer input or as a lightweight retrieval surface, but must not become a fourth top-level navigation tab. Search is lexical and metadata-driven; ResoFeed must not become a built-in RAG product, semantic answer engine, or vector-search system.

Requirements:

- users **must** be able to search by keyword/plain text, source, time, and resonance status;
- resonated items **must** be easier to retrieve when relevant;
- non-resonated but inspected or high-quality items **must** remain retrievable;
- search **must** support practical recall through indexed title, summary, source, provenance, and extracted-text fields, without requiring embeddings or RAG-style generation;
- search results **must** explain enough provenance for the user to verify the result.

Exact retrieval algorithms and indexing strategies are architecture-owned, but the product boundary forbids embedding/vector search as a required capability. If future RAG-grade retrieval is desired, it should be a separate system or explicitly approved product expansion rather than hidden inside ResoFeed.

## 11. External Agent Capabilities

ResoFeed must support authorized external agents through an agent-compatible interface. MCP compatibility is a product requirement because external agent orchestration is part of the intended workflow. ResoFeed must support MCP over remote Streamable HTTP for authorized agents that do not run on the same host. Exact resources, tools, payload schemas, authentication, and protocol-version pinning are architecture-owned.

For PRD purposes, MCP compatibility means authorized external agents can perform the required capabilities in this section through an MCP-compatible interface, including remote Streamable HTTP transport. Local stdio MCP may exist as an implementation convenience, but it must not be the only supported MCP access path.

Required agent capabilities:

- retrieve eligible high-priority recent items;
- silently evaluate item candidates without changing human-visible inspection status;
- retrieve item detail for briefing or handoff;
- execute searches across the user's stored corpus, including older feed items and resonance status;
- maintain an active but minimal understanding of current steering preferences;
- report that an item was delivered or surfaced externally;
- forward human inspect, resonate, or steer actions from external contexts;
- avoid duplicating externally surfaced or human-inspected content unless a new related development makes resurfacing useful;
- preserve actor provenance for every agent-mediated action;
- safely tolerate retries, duplicate requests, and orchestration loops.

ResoFeed itself must not own Telegram, Slack, email, or other delivery-channel integrations as core product surfaces.

## 12. Trust and Explainability

### 12.1 Why this appeared

For surfaced items, ResoFeed **must** provide a concise explanation of why the item appeared when useful (e.g., when surfaced by an agent, steered by a rule, or contextually contradictory).

Examples:

- fresh from a trusted or configured source;
- related to a resonated topic;
- coverage item from configured sources;
- follow-up to a previously inspected story;
- surfaced by a delegated agent.

The explanation must not expose implementation details, but should help the user decide whether the system is behaving well.

### 12.2 Summary reliability

ResoFeed summaries and generated reading content **must** expose extraction limitations to enable objective verification.

Requirements:

- users **must** be able to tell when generated reading content is based on full article text versus RSS excerpt source text;
- source-text labels **must not** imply model failure when `model_status='ok'`; use plain provenance such as `source text: RSS excerpt only` alongside separate summary provenance such as `summary provenance: model-backed`;
- source/provenance titles and localized display titles **must** remain conceptually distinguishable so localization does not erase literal evidence;
- uncertainty, disagreement, or extraction limitations **must** be visible when material;
- source provenance **must** remain accessible from summaries, Key Points, and search results;
- summaries, core insights, and Key Points **must** avoid unsupported synthesis across unrelated sources;
- re-ingest failures **must** preserve existing usable content and communicate the latest attempt failure without presenting the item as newly empty or unusable.

## 13. Experience Requirements

These are product-level experience outcomes, not layout prescriptions.

ResoFeed must feel:

- fast enough that inspecting an item does not interrupt reading flow;
- predictable, with no requirement to clear a queue;
- transparent enough that users understand why surprising items appear;
- correctable through natural language rather than configuration panels;
- consistent across human and agent-mediated workflows;
- localized for Chinese reading workflows, with generated reading content and user-facing processing/re-ingest messages in Chinese while source/provenance literals remain unchanged.

The feed list must remain optimized for scanning, while Inspector must serve as the structured reading surface for summary, core insight, Key Points, provenance, and re-ingest status.

UI/UX owns visual form, interaction details, motion, density, information hierarchy, microcopy, and accessibility implementation details. Frontend details such as design tokens and font fallbacks are explicitly deferred to the later `docs/DESIGN.md` phase.

## 14. Explicit Non-Goals
The following are out of scope unless a future product decision explicitly reverses them:

- account registration flows, onboarding wizards, or "ghost briefings" for empty states;
- hidden rate-limiters, auto-collapsing spammers, or "smart" noise reduction (User Sovereignty);
- complex UI degradation states or elaborate error screens when the AI is down;
- numeric indicators or inbox-zero mechanics;
- archive workflows;
- moderation consoles, isolated filter views, holding queues, or extensive activity ledgers;
- privacy and anti-snooping mechanisms;
- save-for-later as a separate core primitive;
- agree/disagree or like/dislike controls;
- manual ranking-weight sliders;
- mandatory notes;
- dwell-time, viewport, or scroll-depth tracking as preference signals;
- folder hierarchies or tag trees as the primary organization model;
- built-in Telegram or notification-channel ownership;
- multi-user team SaaS features;
- browser-agent scraping, login-cookie scraping, account pools, proxy farms, CAPTCHA-solving workflows, or dedicated extraction sidecars as core runtime behavior.

## 15. Acceptance Criteria

Acceptance criteria are product-level behavioral tests. Architecture and QA must define measurable corpus thresholds, latency budgets, and exact evaluation fixtures before implementation where this PRD uses terms such as “appropriate,” “enough,” “some,” or “fast enough.”

### AC-1 Freshness protection

Given a test corpus with both newly arrived items and older resonated items, when the daily experience is generated, then newly arrived eligible items must be represented and older resonated items must not dominate solely because they were resonated.

### AC-2 Star is not pin

Given an item was resonated several days ago, when no new related development exists, then the item should improve search and future relevance but should not remain a persistent top daily item.

### AC-3 News coverage without stars

Given the user inspects news items but rarely resonates with them, when news-like items from trusted or configured sources continue to arrive, then ResoFeed must continue providing appropriate news coverage rather than concluding the user dislikes news.

### AC-4 Strict Policy Execution

Given the user sets a steer policy to explicitly filter or boost a specific topic, when new items arrive, then the system must correctly execute these filter rules regardless of resulting echo-chamber effects.

### AC-5 Interest is not agreement

Given a user inspects a controversial or opposing-view item without resonating, when future ranking is adjusted, then the system must not treat inspection alone as agreement or durable preference.

### AC-6 Human authority over agents

Given a delegated agent submits steering or resonance that the human later corrects, when future items are ranked, then the human correction must take precedence over the agent-mediated signal.

### AC-7 External handoff idempotency

Given an authorized external agent has already surfaced an item, when it requests candidates again, then ResoFeed must avoid repeatedly returning the same already-surfaced item unless a newer related item creates new context under the architecture ranking contract.

### AC-8 Steering clarity

Given the user submits a steering instruction, when the system applies it, then the user must be able to understand the interpreted change and correct it if wrong.

### AC-9 Agent evaluate vs deliver

Given an agent retrieves multiple candidate items for silent evaluation but only delivers a subset to the human, when the human later opens the primary experience, then undelivered evaluated items must remain eligible as not-yet-inspected items, while delivered items are treated as externally surfaced.

### AC-10 Agent mutation safety

Given an agent retries the same resonate or steer action because of a network failure or orchestration loop, when ResoFeed processes the repeated attempts, then the user-facing effect must occur only once and remain attributable.

### AC-11 Agent steering receipt

Given a delegated agent submits a steering instruction, when the human next interacts with the feed, then the human must be able to see what changed, which actor initiated it, and how to correct or supersede it.

### AC-12 Unauthorized agent action

Given an agent attempts to resonate or steer without owner-token authority, when the action is processed, then ResoFeed must reject it at the auth boundary and must not create a complex holding queue or moderation workflow.

### AC-13 Duplicate/story provenance

Given multiple sources report the same story, when ResoFeed transparently clusters them, then the user must be able to understand that multiple sources contributed and access every original source item and provenance.

### AC-14 Summary transparency

Given source extraction is partial, unavailable, contradictory, or low-confidence, when ResoFeed presents a summary, then the summary must reveal the relevant limitation without implying that model-backed summary generation failed. Source-text provenance (for example, RSS excerpt only) and summary provenance (model-backed versus fallback) must remain visually distinct.

### AC-15 First useful session

Given a new user imports or configures sources, when enough items are available, then ResoFeed must produce a usable first daily experience without requiring folders, archive rules, ranking sliders, or delivery-channel configuration.

### AC-16 State Portability

Given the user requests a complete state export, when executed, the system must output the JSON state bundle defined by architecture, including the Source Ledger, current active steering policy rules, and currently resonated items, and that exported state must be completely restorable via state import. OPML import/export remains source-list exchange only and is not complete state portability or complete state restore format.

### AC-17 Diagnostics Output

Given the user inputs `/doctor` in the Steer input, when processed, the system must output raw system health data (including RSS fetch errors and LLM API latency) in plain text.

### AC-18 Manual fetch controls

Given the Source Ledger exposes a global `[RUN INGEST]` control, when the user triggers it, then the system must skip already-busy sources, drain selected idle active sources through bounded in-request concurrency, report externally capacity-unavailable sources tersely, and return a result that lets the UI update the global last-ingest status without persisting delayed work.

Given the Source Ledger exposes a per-source `[FETCH]` control, when the user triggers it for a source that is not already active and source capacity is available, then the system must attempt that source fetch and return a success result that lets the UI update that source's last-fetch status.

Given the user triggers `[FETCH]` for a source already fetching/ingesting, or when source capacity is exhausted, then the system must reject the request with a terse conflict result and must not queue, persist, or retry the requested work.

Given the user triggers `[RUN INGEST]` while unrelated source fetches are active, then the system must skip/report busy sources, drain selected idle sources through any source slots it owns, report only externally capacity-unavailable starts, and must not queue, persist, or retry skipped work after the response.

Given a manual fetch encounters an RSS/network/source error, when the request completes, then the system must return an error result with terse diagnostic details suitable for inline `err: <diagnostic>` display and `/doctor` diagnostics.

Given a manual fetch exceeds the architecture's source fetch timeout, when the request completes, then the system must report the timeout as a fetch error and must not leave a persistent job, queue item, activity entry, or pending UI state behind.

Given Source Ledger renders these controls, when viewed in desktop or mobile web, then the controls must remain lightweight bracket actions and must not introduce folders, tags, source hierarchy, job dashboards, retry panels, settings screens, or activity ledgers.

### AC-19 Key Points contract

Given an item has successful generated reading content, when the item is inspected, then the Inspector must present Key Points as a first-class structured reading element containing exactly 3–5 source-grounded items, not as raw model-emitted Markdown.

### AC-20 Feed excludes Key Points

Given an item has generated Key Points, when the item appears in the feed list, then the feed row must not render those Key Points; opening the item must make the structured Key Points available in Inspector.

### AC-21 Chinese localization with literal provenance

Given Chinese is the processing language, when generated reading content or user-facing processing/re-ingest status is shown, then the localized display title, summary, core insight, Key Points, and status text must be Chinese, while source/provenance literals such as URLs, source IDs, source names, source titles, exact quoted terms, and company/product names without conventional Chinese renderings must remain unchanged.

### AC-22 Source title versus display title

Given source content has a literal source/provenance title and model-backed generated content, when the item is shown in feed, Inspector, search, or provenance context, then the user must be able to distinguish the localized display title from the source/provenance title, and a failed re-ingest must not replace a valid existing title with a URL-like or fallback string.

### AC-23 Non-destructive re-ingest failure

Given an item already has usable generated content, when a re-ingest attempt fails validation, times out, returns provider/decode error, or produces unavailable output, then ResoFeed must preserve the current usable title, summary, core insight, Key Points, value tier, and content status while recording and displaying the latest attempt failure as a separate user-facing status.

### AC-24 Historical content-contract re-ingest

Given the new content contract is implemented, when historical items eligible for re-ingest are processed, then successful attempts should update generated reading fields to the new contract, including localized display titles and Key Points, while failed attempts must preserve existing usable historical content and record only latest-attempt failure status.

### AC-25 External source-text recovery and multilingual completeness

Given local readable extraction and RSS excerpt fallback cannot recover usable source text for an eligible HTTP(S) item, when external recovery is configured, then ResoFeed must attempt the configured external source-text recovery path once before classifying the item as original unavailable.

Given external recovery returns usable source evidence, when the item is processed, then generated display title, summary, core insight, Key Points, value tier, and user-facing processing status must follow the current processing language completely, including Chinese output when `zh` is selected, while URLs, source IDs, source names, source titles, exact source quotes, and product/company names without conventional Chinese renderings remain literal.

Given external recovery returns login chrome, sidebar/trending content, metadata-only text, low-information text, provider errors, or times out, when ResoFeed records the attempt, then it must preserve any existing usable generated content, expose only safe source-acquisition diagnostics, and never leak external provider keys, `.env` paths, raw provider payloads, or request headers.

## 16. Ownership Boundaries

### 16.1 PRD owns

- product purpose;
- user and agent workflows;
- product primitives;
- policy and ranking rules;
- constraints and non-goals;
- acceptance criteria.

### 16.2 Software architecture owns

- database schema;
- data model implementation;
- storage and indexing choices;
- ranking implementation;
- MCP resource/tool contracts;
- background task design;
- deployment topology;
- service/module boundaries.

### 16.3 UI/UX design owns

- visual design;
- layout;
- interaction model;
- navigation;
- density;
- motion;
- microcopy;
- accessibility implementation details;
- frontend details such as design tokens and font fallbacks (deferred to `docs/DESIGN.md`).
