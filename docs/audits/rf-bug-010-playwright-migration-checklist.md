# RF-BUG-010 Playwright Lane Migration Checklist
The foundation check records native Playwright project/file/title discovery identities. Both collections must be non-empty and contain exactly the legacy three-file set and replacement five-file set. Discovery uses `--list`; this step does not execute either product-semantic lane.

| Legacy behavior source | Replacement coverage | Preserved behavior owned by downstream verification |
|---|---|---|
| `search-click-inspector-contract.expected-red.spec.ts` | `inspector-selection.browser-contract.spec.ts`, `routes.browser-contract.spec.ts` | Search/feed activation keeps the current item, URL, readable Inspector state, keyboard activation, and responsive navigation synchronized. |
| `mobile-inspector-token-hydration.spec.ts` | `initial-route.browser-contract.spec.ts`, `routes.browser-contract.spec.ts` | Cold and refreshed Inspector routes hydrate the saved owner token without exposing the prompt; missing-token routes retain the owner-token gate. |
| `source-ledger-navigation-regression.expected-red.spec.ts` | `source-ledger-responsive.browser-contract.spec.ts`, `source-ledger-delete.browser-contract.spec.ts` | SOURCE LEDGER remains directly and keyboard reachable, responsive controls stay operable, and destructive source actions preserve confirmation/focus behavior. |

## Native lane sets

Legacy discovery set (three files):

1. `search-click-inspector-contract.expected-red.spec.ts`
2. `mobile-inspector-token-hydration.spec.ts`
3. `source-ledger-navigation-regression.expected-red.spec.ts`

Replacement discovery set (five protected acceptance files):

1. `inspector-selection.browser-contract.spec.ts`
2. `initial-route.browser-contract.spec.ts`
3. `routes.browser-contract.spec.ts`
4. `source-ledger-responsive.browser-contract.spec.ts`
5. `source-ledger-delete.browser-contract.spec.ts`

`scripts/rf-bug-010-standard-json.mjs discover` rejects empty collections, any test execution during discovery, and file-set drift. `scripts/vectl-check.mjs` runs the generic adapter-envelope check, case-local real-runtime isolation, intentional-failure standard artifact proof, and both discovery collections. It emits no product-semantic replacement execution marker.

After Search, route, Source Ledger, State, and responsive repairs land, the downstream lane-migration runtime check owns native list/run equality, zero retries, first-attempt passes, and the final legacy-removal decision. Protected acceptance files remain unchanged in this foundation step.
## Native lane sets

Legacy set (three files):

1. `search-click-inspector-contract.expected-red.spec.ts`
2. `mobile-inspector-token-hydration.spec.ts`
3. `source-ledger-navigation-regression.expected-red.spec.ts`

Replacement set (five files):

1. `inspector-selection.browser-contract.spec.ts`
2. `initial-route.browser-contract.spec.ts`
3. `routes.browser-contract.spec.ts`
4. `source-ledger-responsive.browser-contract.spec.ts`
5. `source-ledger-delete.browser-contract.spec.ts`

`scripts/rf-bug-010-standard-json.mjs` compares each lane's Playwright JSON collection and execution reports. `scripts/vectl-check.mjs` runs both comparisons after isolated fixture and intentional-failure artifact checks. Protected acceptance files remain unchanged.
