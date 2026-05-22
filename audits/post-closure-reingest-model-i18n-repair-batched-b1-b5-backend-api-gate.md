# Post-Closure Re-Ingest Model/i18n Batched B1-B5 Backend API Gate

Status: PASS

## Scope

Backend/API proof for B1 and B5, with R4 backend compatibility receipts. Product route implementation was already present in `internal/resofeed/http.go`; this gate records current passing implementation evidence rather than introducing new backend code.

## Required Command

Command:

```text
go test ./internal/resofeed -run 'TestPostClosure' -count=1 -v
```

Exit code: `0`

Raw stdout:

```text
=== RUN   TestPostClosureBackendRepairModelListMissingKeyAndAllModels
--- PASS: TestPostClosureBackendRepairModelListMissingKeyAndAllModels (0.00s)
=== RUN   TestPostClosureBackendRepairReingestStrictJSONAndPromptSafety
--- PASS: TestPostClosureBackendRepairReingestStrictJSONAndPromptSafety (0.01s)
=== RUN   TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed
=== RUN   TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/missing_owner_token_/api/runtime/openrouter-models
=== RUN   TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/invalid_owner_token_/api/runtime/openrouter-models
=== RUN   TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/rejects_query_/api/runtime/openrouter-models
=== RUN   TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/authorized_all-model_list_/api/runtime/openrouter-models
=== RUN   TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/missing_owner_token_/api/runtime/openrouter/models
=== RUN   TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/invalid_owner_token_/api/runtime/openrouter/models
=== RUN   TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/rejects_query_/api/runtime/openrouter/models
=== RUN   TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/authorized_all-model_list_/api/runtime/openrouter/models
--- PASS: TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed (0.00s)
    --- PASS: TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/missing_owner_token_/api/runtime/openrouter-models (0.00s)
    --- PASS: TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/invalid_owner_token_/api/runtime/openrouter-models (0.00s)
    --- PASS: TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/rejects_query_/api/runtime/openrouter-models (0.00s)
    --- PASS: TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/authorized_all-model_list_/api/runtime/openrouter-models (0.00s)
    --- PASS: TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/missing_owner_token_/api/runtime/openrouter/models (0.00s)
    --- PASS: TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/invalid_owner_token_/api/runtime/openrouter/models (0.00s)
    --- PASS: TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/rejects_query_/api/runtime/openrouter/models (0.00s)
    --- PASS: TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed/authorized_all-model_list_/api/runtime/openrouter/models (0.00s)
=== RUN   TestPostClosureModelListProviderFailureRedactionExpectedRed
--- PASS: TestPostClosureModelListProviderFailureRedactionExpectedRed (0.00s)
=== RUN   TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed
=== RUN   TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed/missing_token
=== RUN   TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed/invalid_token
=== RUN   TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed/invalid_query
=== RUN   TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed/success
--- PASS: TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed (0.00s)
    --- PASS: TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed/missing_token (0.00s)
    --- PASS: TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed/invalid_token (0.00s)
    --- PASS: TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed/invalid_query (0.00s)
    --- PASS: TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed/success (0.00s)
=== RUN   TestPostClosureItemReingestPromptModelIdempotencyFingerprintExpectedRed
--- PASS: TestPostClosureItemReingestPromptModelIdempotencyFingerprintExpectedRed (0.00s)
=== RUN   TestPostClosureItemReingestCurrentOperationGuardConflictExpectedRed
--- PASS: TestPostClosureItemReingestCurrentOperationGuardConflictExpectedRed (0.00s)
=== RUN   TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed
=== RUN   TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/missing_owner_token_rejected
=== RUN   TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/invalid_owner_token_rejected
=== RUN   TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/canonical_prompt_fixture_passes_request_scoped_model_and_prompt
=== RUN   TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/documented_compatibility_extra_prompt_fixture_passes_one-time_prompt
=== RUN   TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/conflicting_prompt_aliases_are_bad_request_and_do_not_call_model
=== RUN   TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/strict_json_rejects_language_without_leaking_prompt
--- PASS: TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed (0.00s)
    --- PASS: TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/missing_owner_token_rejected (0.00s)
    --- PASS: TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/invalid_owner_token_rejected (0.00s)
    --- PASS: TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/canonical_prompt_fixture_passes_request_scoped_model_and_prompt (0.00s)
    --- PASS: TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/documented_compatibility_extra_prompt_fixture_passes_one-time_prompt (0.00s)
    --- PASS: TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/conflicting_prompt_aliases_are_bad_request_and_do_not_call_model (0.00s)
    --- PASS: TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/strict_json_rejects_language_without_leaking_prompt (0.00s)
=== RUN   TestPostClosureChineseReingestRequiresExplicitOperationExpectedRed
--- PASS: TestPostClosureChineseReingestRequiresExplicitOperationExpectedRed (0.01s)
PASS
ok  	resofeed/internal/resofeed	0.215s
```

## Focused Real API Proof Command

Command:

```text
go test ./internal/resofeed -run 'TestPostClosure|TestBackendRealAPIProofThroughHTTPServer|TestBackendReingestSuccessThroughPublicStateImportSetup' -count=1 -v
```

Exit code: `0`

Key raw stdout excerpts:

```text
curl/model-list canonical path raw_status_body: HTTP/1.1 200 OK Content-Type=application/json; charset=utf-8 body={"models":[{"id":"openrouter/test-model","name":"Test Model"}]}
curl/model-list compatibility path raw_status_body: HTTP/1.1 200 OK Content-Type=application/json; charset=utf-8 body={"models":[{"id":"openrouter/test-model","name":"Test Model"}]}
curl/model-list provider failure redaction raw_status_body: HTTP/1.1 503 Service Unavailable Content-Type=application/json; charset=utf-8 body={"error":{"code":"provider_unavailable","message":"models unavailable","details":{}}}
curl/model-list missing owner token raw_status_body: HTTP/1.1 401 Unauthorized Content-Type=application/json; charset=utf-8 body={"error":{"code":"unauthorized","message":"owner token required","details":{}}}
curl/reingest after public setup raw_status_body: HTTP/1.1 200 OK Content-Type=application/json; charset=utf-8 body={"reingest":{"item_id":"public_setup_item","status":"completed","language":"en","item_updated":true,"fts_updated":true,...},"already_applied":false}
```

## Backend Gate Matrix

| requirement | proof source | result |
| --- | --- | --- |
| Canonical `/api/runtime/openrouter-models` exists | `TestPostClosureOpenRouterModelListHTTPRouteCompatibilityExpectedRed`, `TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed`, real API stdout canonical 200 | PASS |
| Compatibility `/api/runtime/openrouter/models` exists | Same tests + real API stdout compatibility 200 | PASS |
| Identical model-list semantics | `TestPostClosureModelListCanonicalAndCompatRouteSemanticsExpectedRed/success`; real API canonical and compatibility bodies both `{"models":[{"id":"openrouter/test-model","name":"Test Model"}]}` | PASS |
| Owner auth and strict query | Missing/invalid token and query subtests for both routes | PASS |
| Provider failures redacted | `TestPostClosureModelListProviderFailureRedactionExpectedRed`; real API 503 body omits raw provider secret/.env/owner-token text | PASS |
| `prompt` canonical accepted and request-scoped | `TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/canonical_prompt_fixture_passes_request_scoped_model_and_prompt` | PASS |
| `extra_prompt` compatibility accepted | `TestPostClosureItemReingestHTTPPromptExtraPromptOwnerAuthExpectedRed/documented_compatibility_extra_prompt_fixture_passes_one-time_prompt`; real API public setup reingest body uses `extra_prompt` and returns 200 | PASS |
| Conflicting prompt aliases/unknown language rejected | Conflicting aliases and strict JSON language subtests | PASS |
| Prompt/model not persisted | Real API stdout `no_durable_prompt_model_state_check` reports runtime metadata counts 0 | PASS |

## Gate Decision

Backend API implementation gate: PASS. B1 and B5 are proven by current raw stdout and named tests; R4 backend compatibility remains proven by both focused contract tests and real HTTP proof.
