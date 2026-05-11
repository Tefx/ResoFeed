## pbar-runtime-liveness-probe Evidence

Black-box liveness artifacts captured without inspecting implementation source.

Docs read:
- `README.md` Quick start
- `docs/USAGE.md` Quick Start, HTTP Command Reference, Search, Source Ledger and OPML, Diagnostics `/doctor`
- `docs/DESIGN.md` App Shell, Steer Input, Source Ledger, Diagnostics Output, Search and Retrieval
- `docs/ARCHITECTURE.md` System Boundary, HTTP Surface, Frontend Boundary

Primary machine-readable artifacts:
- `probe-summary.json`: process launch, port probe, HTTP route/API probe outputs.
- `browser-auth-proof.json`: authenticated browser route state/text proof for `/`, `/doctor`, and `/source-ledger`.

Screenshots:
- `browser-auth-root.png`
- `browser-auth-doctor.png`
- `browser-auth-source-ledger.png`

Raw response artifacts:
- `route-root.html`, `route-doctor.html`, `route-source-ledger.html`
- `get-_api_search.txt`, `get-_api_sources.txt`, `get-_api_feed_today.txt`, `get-_api_doctor.txt`

Runtime secrets and test owner token strings were redacted from committed artifacts.
