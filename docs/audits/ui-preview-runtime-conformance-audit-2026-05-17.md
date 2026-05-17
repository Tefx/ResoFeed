# UI Preview Runtime Conformance Audit Availability Bridge

Date: 2026-05-17

This isolated worktree did not contain the original locked audit body referenced as `docs/audits/ui-preview-runtime-conformance-audit-2026-05-17.md` by earlier verification handoffs. To keep isolated follow-up verification self-contained, this tracked bridge records the authoritative replacement artifacts available inside isolated worktrees.

Authoritative replacements:

- `docs/audits/ui-preview-runtime-conformance-audit-remediation-contract-matrix-2026-05-17.md` — tracked F01-F25 acceptance matrix, authority refs, boundary lock, proof-family map, and note that the original locked audit was absent from the isolated worktree.
- `artifacts/ui-preview-runtime-conformance-audit-remediation.browser-render-retest/report.md` — tracked browser retest proof register and F01-F25 behavior claims.
- `artifacts/ui-preview-runtime-conformance-audit-remediation.browser-render-retest/computed-style-measurements.json` — tracked computed geometry/style evidence, including the previously failing mobile Source Ledger measurement.
- `artifacts/ui-preview-runtime-conformance-audit-remediation.browser-render-retest/mobile-390x844-source-ledger.png` — tracked visual artifact showing the 390x844 Source Ledger title/status collision that downstream remediation must close.

Boundary lock:

- Preserve `docs/DESIGN.md`, `docs/ui-preview.html`, and `docs/ARCHITECTURE.md` as the UI/runtime and architecture authorities.
- Do not introduce accounts/OAuth/per-agent registry, vector DB/RAG, sync/merge, durable ingest jobs/queues/activity ledgers, settings dashboards, folders/tags/unread/archive flows, or service/repository/DI layers.

Use this file only as an availability bridge for isolated verification. The replacement artifacts above remain the substantive evidence sources.
