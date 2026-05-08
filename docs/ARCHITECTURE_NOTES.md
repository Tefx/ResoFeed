# Architecture Notes: ResoFeed Steering & State

*These are preliminary technical notes for the Software Architect. They capture the constraints and proposed patterns from the product discovery phase. They are NOT final architectural decisions.*

## The "Plaintext Policy Compiler" Pattern
**Problem:** How do we implement natural language steering (RLHF) and resonance (stars) without a traditional database, while maintaining extreme KISS and avoiding LLM "prompt drift" (where rewriting a prompt iteratively destroys older rules)?

**Proposed Minimalist Architecture (Event Sourcing via Plaintext):**
1. **The Intent Log (Append-Only):**
   - User actions (Steer commands, Resonate stars) are NOT used to mutate a complex database or immediately overwrite a system prompt.
   - They are atomically appended to a flat log file (e.g., `intents.log` or `events.jsonl`).
   - Example:
     ```text
     [2026-05-08T10:00Z] STEER | "No more Oscar news"
     [2026-05-08T10:05Z] STAR  | https://example.com/tech-article
     ```
   - This solves concurrency (OS-level atomic appends) and provides a perfect, uncorruptible audit trail of user preferences.

2. **The Policy Compiler (Materialized View):**
   - The actual filtering rubric used by the daily batch job (e.g., `policy.md`) is treated as a *compiled artifact* (a materialized view), not the source of truth.
   - Periodically (or before the daily run), a background process feeds the `intents.log` to an LLM to synthesize/compress it into the current `policy.md`.
   - If the LLM hallucinates or corrupts `policy.md`, the system can simply re-compile it from the immutable `intents.log`.

## Core Directives for the Architect
- **No RDBMS for Preferences:** Keep state in human-readable, exportable plaintext/JSON.
- **Resilience:** The daily batch job must survive LLM outages. If the compiler fails, it should degrade gracefully (e.g., use the last known good `policy.md` or raw un-filtered RSS).
- **Compaction:** The architect will need to design the trigger for when/how the `intents.log` is compacted so the LLM context window doesn't blow up after a year of use.