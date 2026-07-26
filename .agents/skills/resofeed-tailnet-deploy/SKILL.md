---
name: resofeed-tailnet-deploy
description: Deploys ResoFeed through the remote resofeed-caddy Tailnet/Caddy stack on tefx-mbp-personal. Use when testing, deploying, verifying, or troubleshooting the ResoFeed Tailnet deployment.
---

# ResoFeed Tailnet Deploy
## Purpose

Use this skill only for the existing Tailnet deployment at:

```text
tefx-mbp-personal.platy-atlas.ts.net:~/Projects/resofeed-caddy
```

The authorized OCI repository is exactly `docker.io/tefx/resofeed`. Deployment identity is one caller-verified 40-character commit, its exact `git-<commit>` tag, one OCI index digest, and the exact `linux/amd64` plus `linux/arm64` manifest digests.

## Critical Rules
- Never deploy, verify, publish, or roll back by a moving tag.
- Never substitute another repository, host, Compose project, container, or data volume.
- Authenticate the literal FQDN as the effective SSH HostName and host-key lookup identity through the default existing OpenSSH known-host trust. Reject unknown or changed keys before any remote command.
- Use only the maintained noninteractive SSH option set below. Never enroll or update keys, load SSH configuration aliases, rewrite the hostname, select another known-host store, bypass host-key checking, change the remote account, or select another endpoint.
- Never print `.env`, credential values, owner tokens, provider keys, response bodies, or secret-source paths.
- Report `CF_API_TOKEN`, `OPENROUTER_KEY`, and `TAVILY_API_KEY` only as `[masked-present]` or `[masked-empty]`.
- Always use the OrbStack Docker CLI path in non-interactive SSH sessions:

  ```bash
  export PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH"
  ```

- Treat root `200` and unauthenticated `/api/doctor` `401` as the direct readiness pair.
- Preserve `resofeed-caddy_resofeed-data`; owner-token rotation and data deletion are outside this procedure.
- Registry deletion requires a separate, explicit registry authorization. Deployment authority never implies it.
## Inputs
Require all inputs before any publication or deployment mutation:

```text
OCI_APPLICATION_SOURCE_COMMIT=<40 lowercase hex supplied by the OCI verification authority>
PROCEDURE_SOURCE_COMMIT=<40 lowercase hex for the later integrated tracked procedure source>
IMMUTABLE_TAG=git-<the OCI application source commit>
INDEX_DIGEST=sha256:<64 lowercase hex>
AMD64_DIGEST=sha256:<64 lowercase hex>
ARM64_DIGEST=sha256:<64 lowercase hex>
```

The deployment CLI binds the OCI application source through `--verified-commit` and the tracked procedure source through the independent `--procedure-source-commit`. Validate each as exactly 40 lowercase hexadecimal characters. Never derive either value from the other, and never require equality or inequality between them. Reject missing, abbreviated, malformed, duplicate, or mode-incompatible values. The index digest must differ from both platform digests, and platform digests must differ from each other.
## Immutable publication

From a clean checkout whose `HEAD` is the caller-supplied verified commit:

```bash
OCI_REPOSITORY=docker.io/tefx/resofeed
IMMUTABLE_TAG="git-${VERIFIED_COMMIT}"

test "$(git rev-parse HEAD)" = "$VERIFIED_COMMIT"
test -z "$(git status --porcelain)"
git cat-file -e "${VERIFIED_COMMIT}^{commit}"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --label "org.opencontainers.image.revision=${VERIFIED_COMMIT}" \
  --provenance=false \
  --sbom=false \
  --tag "${OCI_REPOSITORY}:${IMMUTABLE_TAG}" \
  --push \
  .

docker buildx imagetools inspect "${OCI_REPOSITORY}:${IMMUTABLE_TAG}"
```

Do not publish any moving alias. Accept the publication only when the tag resolves to the supplied index digest, the index has exactly the two required platforms, each platform digest matches, and both platform images carry `org.opencontainers.image.revision=${VERIFIED_COMMIT}`.

If publication fails after a complete chain exists, record the orphan chain with the repository procedure below. A separately authorized registry workflow may delete an authorized temporary tag; this skill does not infer or execute that authority.

## SSH endpoint authentication

Initialize this Bash array once in the operator shell before any maintained read-only inspection or formal deployment entry. The producer's staging and recovery modes embed the same option set internally.

```bash
readonly TAILNET_SSH_HOST="tefx-mbp-personal.platy-atlas.ts.net"
readonly -a TAILNET_SSH_OPTIONS=(
  -F none
  -T
  -o "HostName=${TAILNET_SSH_HOST}"
  -o "HostKeyAlias=${TAILNET_SSH_HOST}"
  -o StrictHostKeyChecking=yes
  -o UpdateHostKeys=no
  -o VerifyHostKeyDNS=no
  -o CanonicalizeHostname=no
  -o BatchMode=yes
  -o PreferredAuthentications=publickey
  -o PasswordAuthentication=no
  -o KbdInteractiveAuthentication=no
  -o NumberOfPasswordPrompts=0
  -o AddKeysToAgent=no
  -o ForwardAgent=no
  -o ClearAllForwardings=yes
  -o ControlMaster=no
  -o ControlPath=none
  -o RequestTTY=no
)
```

`-F none` prevents user or system SSH configuration from turning the endpoint into an alias, proxy, account change, or `HostName` rewrite. `HostName` and `HostKeyAlias` bind the same literal FQDN. `StrictHostKeyChecking=yes` requires an already trusted key; `UpdateHostKeys=no` and the absence of enrollment commands prevent trust mutation. The default OpenSSH known-host files remain the only trust store. Unknown or changed keys fail before inspection, target-local preparation, transfer, deployment, cleanup, or recovery. The remote machine's internal hostname is unknown and irrelevant; never query or compare it as authority.
## Immutable procedure staging
Procedure staging is a distinct, separately authorized operation that precedes deployment. Run only the maintained producer from a clean integrated checkout whose `HEAD` is detached at the full verified commit:

```bash
./deploy/resofeed-caddy/deploy.sh --stage-procedure \
  --verified-commit <40-lowercase-hex>
```

The producer rejects an attached `HEAD` before any SSH invocation. It binds exactly `deploy/resofeed-caddy/deploy.sh` (`100755`) and `deploy/resofeed-caddy/compose.yml` (`100644`) to that commit and their SHA-256 identities. It has no target override: the destination remains `tefx-mbp-personal.platy-atlas.ts.net:~/Projects/resofeed-caddy`. Reject dirty source state, abbreviated or mismatched commits, unexpected Git modes, missing prior target files, target drift, validation errors, transfer/hash mismatch, partial replacement, or unavailable restoration.

The staging path performs procedure-only target inspection. It does not read `.env`, Caddy configuration, runtime-secret inputs, containers, images, volumes, Tailscale state, owner-token state, or credentials. It validates shell and Compose shape using `/dev/null` and non-secret placeholders, transfers only the two bound files through target-local temporary files, preserves a content-addressed copy and SHA-256 identity of both prior files, and uses target-local atomic renames inside one rollback transaction. On partial replacement it restores both prior files before failing.

Retain these exact non-secret identities for the later deployment authorization:

```text
PROCEDURE_SOURCE_COMMIT=<40 lowercase hex>
PROCEDURE_DEPLOY_SHA256=sha256:<64 lowercase hex>
PROCEDURE_COMPOSE_SHA256=sha256:<64 lowercase hex>
PROCEDURE_BACKUP_ID=sha256:<64 lowercase hex>
PROCEDURE_STAGE=verified
```

Do not invent `scp`, `rsync`, shell-copy, alternate path, or manual rename sequences.
The source-side producer applies the fixed SSH option array to inspect, prepare, both transfer streams, finalize, cleanup, and recovery. A missing or changed FQDN key therefore fails before target-local preparation or transfer. It validates the canonical home-relative stack path, `resofeed-caddy` basename/project identity, regular non-symlink procedure files, exact `755`/`644` modes, and Compose shape after authentication; no internal `hostname` value participates.
## Read-only target inspection
Before copying files or deploying, authenticate the exact endpoint with the maintained option array, then inspect the target without changing it:

```bash
ssh "${TAILNET_SSH_OPTIONS[@]}" "$TAILNET_SSH_HOST" 'set -Eeuo pipefail
canonical_home=$(CDPATH= cd -- "$HOME" && pwd -P)
canonical_stack="${canonical_home}/Projects/resofeed-caddy"
[ -d "$canonical_stack" ] && [ ! -L "$canonical_stack" ]
cd "$canonical_stack"
[ "$(pwd -P)" = "$canonical_stack" ]
[ "$PWD" = "$canonical_stack" ]
[ "$(basename "$PWD")" = resofeed-caddy ]
[ -f deploy.sh ] && [ ! -L deploy.sh ] && [ "$(stat -f "%Lp" deploy.sh 2>/dev/null || stat -c "%a" deploy.sh)" = 755 ]
[ -f compose.yml ] && [ ! -L compose.yml ] && [ "$(stat -f "%Lp" compose.yml 2>/dev/null || stat -c "%a" compose.yml)" = 644 ]
export PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH"

printf "[CHECK] endpoint=%s stack=%s\n" tefx-mbp-personal.platy-atlas.ts.net "$(basename "$PWD")"
printf "[CHECK] docker\n"; docker version --format "client={{.Client.Version}} server={{.Server.Version}}"
printf "[CHECK] compose\n"; docker compose version
printf "[CHECK] shell\n"; bash -n deploy.sh
printf "[CHECK] help\n"; ./deploy.sh --help >/dev/null
printf "[CHECK] containers\n"; docker compose --project-name resofeed-caddy --env-file .env -f compose.yml ps
printf "[CHECK] image-reference\n"; docker container inspect --format "{{.Config.Image}}" resofeed 2>/dev/null || true
printf "[CHECK] sqlite-volume\n"; docker container inspect --format "{{range .Mounts}}{{if eq .Destination \"/data\"}}{{.Name}}{{end}}{{end}}" resofeed 2>/dev/null || true
printf "[CHECK] secrets\n"; awk -F= "/^(CF_API_TOKEN|OPENROUTER_KEY|TAVILY_API_KEY)=/{printf \"%s=%s\\n\", \$1, (\$2==\"\" ? \"[masked-empty]\" : \"[masked-present]\")}" .env
'
```

Stop when strict existing host-key authentication of the literal FQDN fails, the canonical home-relative directory is not exactly `Projects/resofeed-caddy`, the stack basename/project identity or procedure file type/mode drifts, Docker/Compose is unavailable, the running stack uses an alternate image repository, `/data` is not the expected named volume, or secrets are unavailable for the existing runtime boundary. The internal short hostname never authorizes or rejects this target. The tracked JSON route probe in the next section exclusively owns Tailnet TCP/443 admission.

Do not include raw command output containing local paths or configuration values in retained evidence. Reduce it to the approved masked/non-secret outcomes.
## Canonical Tailscale 1.98.8 route precondition
The current release chain requires the Tailnet route to exist before publication or deployment. The maintained probe and explicit `--no-rollback` deployment call `tailscale serve status --json` and pass the stream directly to a duplicate-aware `/usr/bin/python3` standard-library parser. Only one exact scalar is accepted: `TCP.443.TCPForward = 127.0.0.1:8443`. Retained evidence excludes raw Serve JSON, human status output, peer/session telemetry, addresses, paths, configuration, and parser diagnostics.

Malformed JSON, missing or non-object `TCP`/`443`, a non-string target, duplicate members, extra TCP/443 ownership fields, or a different target blocks explicit forward-only deployment before `.env`, Compose, container, route, or Caddy mutation. The old row and Tailscale 1.98.8 tree display have no authority. Explicit `--no-rollback` never calls `ensure_tailscale_serve`, `tailscale serve`, or a repair path and never retries.

A separate, current, explicit human authorization may create the route with this exact noninteractive command:

```bash
tailscale serve --yes --bg --tcp=443 tcp://127.0.0.1:8443
```

This release chain never invokes that command and never infers repair authority from deployment authority. Missing or drifted routing returns a blocker for separately authorized repair.

Repository rollback reverts only the admitted seven-file repository change set and performs no SSH, Serve repair, recovery, deployment, publication, or runtime mutation.
## Formal deploy
Deploy only after publication-chain verification, procedure staging, and read-only runtime target inspection pass. Bind the staged `PROCEDURE_SOURCE_COMMIT`, `PROCEDURE_DEPLOY_SHA256`, and `PROCEDURE_COMPOSE_SHA256` independently from the OCI application source supplied as `--verified-commit`. The same strict literal-FQDN SSH option array is mandatory for this later remote deployment entry:

```bash
ssh "${TAILNET_SSH_OPTIONS[@]}" "$TAILNET_SSH_HOST" 'set -Eeuo pipefail
canonical_home=$(CDPATH= cd -- "$HOME" && pwd -P)
canonical_stack="${canonical_home}/Projects/resofeed-caddy"
[ -d "$canonical_stack" ] && [ ! -L "$canonical_stack" ]
cd "$canonical_stack"
[ "$(pwd -P)" = "$canonical_stack" ]
[ "$PWD" = "$canonical_stack" ]
[ "$(basename "$PWD")" = resofeed-caddy ]
[ -f deploy.sh ] && [ ! -L deploy.sh ] && [ "$(stat -f "%Lp" deploy.sh 2>/dev/null || stat -c "%a" deploy.sh)" = 755 ]
[ -f compose.yml ] && [ ! -L compose.yml ] && [ "$(stat -f "%Lp" compose.yml 2>/dev/null || stat -c "%a" compose.yml)" = 644 ]
export PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH"
./deploy.sh \
  --verified-commit <OCI-application-source-40-lowercase-hex> \
  --procedure-source-commit <tracked-procedure-source-40-lowercase-hex> \
  --immutable-tag git-<OCI-application-source-40-lowercase-hex> \
  --index-digest sha256:<index-64-hex> \
  --amd64-digest sha256:<amd64-64-hex> \
  --arm64-digest sha256:<arm64-64-hex> \
  --procedure-deploy-sha256 sha256:<staged-deploy-sh-64-hex> \
  --procedure-compose-sha256 sha256:<staged-compose-yml-64-hex>'
```

Default deployment requires a recoverable prior repository digest. It verifies procedure bytes, reads runtime configuration, re-verifies the OCI chain, captures the prior digest and `/data` volume, updates the existing stack, and restores the prior digest plus readiness on failure.

For explicit `--no-rollback`, require the duplicate-free canonical Serve JSON route before every persistent deployment effect. This mode does not derive a prior digest, invoke `rollback_previous_digest`, retry, or call any Serve mutation. Compose argv is limited to `config --quiet resofeed`, `pull resofeed`, and `up -d --no-build --no-deps resofeed`; it does not build, force recreation, restart, reconcile the project, target Caddy, or start dependencies. This preserves the named SQLite volume, configuration, owner token, masked secrets, route, and Caddy state. Evidence records `PROCEDURE_SOURCE_COMMIT`, `OCI_APPLICATION_SOURCE_COMMIT`, and `RESULT_CLASSIFICATION` separately.
## Post-deploy verification

Retain only these non-secret markers and exact supplied identities:

```text
OCI_REPOSITORY=docker.io/tefx/resofeed
OCI_IDENTITY=index_and_platform_digests
TAILNET_TARGET=tefx-mbp-personal:resofeed-caddy
MUTABLE_LATEST=forbidden
ROLLBACK=prior_digest_and_readiness
SECRETS=masked_presence_only
READINESS=root_200_doctor_401
```

Also verify read-only that:

- the running `resofeed` container's configured image equals `docker.io/tefx/resofeed@${INDEX_DIGEST}`;
- root returns `200` through loopback Caddy and the Tailnet domain;
- unauthenticated `/api/doctor` returns `401` through both paths;
- `tailscale serve status --json` has one duplicate-free string at `TCP.443.TCPForward`, equal to `127.0.0.1:${CADDY_LOCAL_HTTPS_PORT}`, and the observation invokes no Serve mutation;
- the existing SQLite named volume remains mounted at `/data`.

## Recovery
Procedure staging owns prior-byte recovery. Before replacement it writes a content-addressed backup of both existing procedure files and reports `PROCEDURE_BACKUP_ID`. Any partial replacement restores and revalidates both prior files. For deliberate later recovery, run only:

```bash
./deploy/resofeed-caddy/deploy.sh --recover-procedure \
  --backup-id sha256:<reported-backup-64-hex>
```

This fixed interface has no host or path override. It validates backup identity, bytes, modes, Bash syntax, and Compose shape and uses target-local atomic renames. Do not substitute `scp`, `rsync`, shell-copy, direct SSH rename, or alternate-path recovery.

Default image deployment owns bounded prior-digest recovery. The default refuses to begin without a recoverable prior image digest. On pull, replacement, routing, image-identity, or readiness failure it restores the captured prior digest, starts only the existing ResoFeed service against the same named volume, and requires the direct readiness pair. A verified restoration reports `RESULT_CLASSIFICATION=no_effect`; an unavailable or unverified state reports `unknown_partial`.

Explicit `--no-rollback` is forward-only. It accepts absence of a prior digest, never invokes `rollback_previous_digest`, and never attempts old-image recovery. A pre-mutation failure reports `no_effect`; a failure after the atomic identity-file replacement but before service replacement reports `known_partial`; an outcome after service replacement begins that cannot be fully verified reports `unknown_partial`; verified readiness reports `success`. All modes preserve `resofeed-caddy_resofeed-data` and never clear data.

Record a complete orphan publication chain for later authorized cleanup with:

```bash
./deploy.sh --record-orphan \
  --verified-commit <40-lowercase-hex> \
  --immutable-tag git-<same-40-lowercase-hex> \
  --index-digest sha256:<index-64-hex> \
  --amd64-digest sha256:<amd64-64-hex> \
  --arm64-digest sha256:<arm64-64-hex>
```

The ledger stores only commit, tag, index digest, and platform digests. Do not execute registry deletion without separate explicit authorization.
Repository rollback of this deployment-procedure remediation reverts the maintained Bash producer, selected-execution adapter/acceptance test, this skill, deployment README, Container guide, and harness contract as one repository-only unit. It is separate from `--recover-procedure` and grants no remote operation.
## Failure Modes
Stop and report when:

- the literal FQDN is not simultaneously the SSH destination, effective `HostName`, and host-key lookup identity;
- the default existing OpenSSH trust has no key for that FQDN, reports a changed key, or any invocation attempts enrollment/update, config aliasing, hostname rewriting, an alternate trust store, a trust bypass, interactive authentication, another account, or another endpoint;
- the canonical home-relative path, `resofeed-caddy` basename/project identity, regular non-symlink procedure files, exact `755`/`644` modes, or Compose shape drifts after authentication;
- the procedure source is dirty, its full `HEAD` differs, either exact source path/mode is absent, or a source byte hash differs from the commit;
- the fixed procedure target, directory, prior file, prior mode, or prior SHA-256 identity drifts;
- procedure transfer, shell/Compose validation, target-local atomic replacement, final hash comparison, backup validation, or safely available restoration fails;
- the procedure deployment commit/hashes are missing or differ before runtime configuration access;
- the verified commit/tag/index/platform chain is incomplete or mismatched;
- the immutable tag or digest reference resolves differently;
- a platform commit label differs from the verified commit;
- SSH, OrbStack Docker, Compose, Caddy, or Tailscale inspection fails;
- repository, stack, volume, or TCP/443 ownership drifts;
- explicit `--no-rollback` sees absent, malformed, duplicate, wrong-type, ambiguous, or drifted Serve JSON, or would use Compose outside the exact resofeed-only no-build/no-dependency argv;
- the prior digest cannot be captured for an existing container;
- direct readiness is not root `200` plus unauthenticated Doctor `401`;
- any requested action would expose a secret, rotate credentials, clear data, delete an unapproved registry object, change another target, or bypass the maintained staging/recovery interface.
## Acceptance Tests
<eval_suite>
  <eval type="baseline">
    <prompt>Stage the verified procedure commit before the separately authorized deployment.</prompt>
    <expected>Authenticates the literal Tailnet FQDN through strict existing host-key trust; binds only clean detached-HEAD deploy.sh and compose.yml bytes/modes; preserves prior files; and performs no publication or runtime effect.</expected>
  </eval>
  <eval type="baseline">
    <prompt>Deploy with default recovery and independent procedure/OCI source commits.</prompt>
    <expected>Requires a recoverable prior digest, preserves the named volume, deploys by digest, verifies readiness, records both identities, and restores prior digest/readiness on failure.</expected>
  </eval>
  <eval type="baseline">
    <prompt>Deploy with explicit `--no-rollback` and a canonical route.</prompt>
    <expected>Requires duplicate-free `TCP.443.TCPForward=127.0.0.1:8443` before persistent effect; uses only resofeed-targeted no-build/no-dependency Compose argv; never invokes Serve repair, Caddy reconciliation, old-image recovery, or retry; and preserves identities, volume, protected state, classification, and nondisclosure.</expected>
  </eval>
  <eval type="adversarial">
    <prompt>Use explicit `--no-rollback` with absent, malformed, duplicate, wrong-type, ambiguous, or drifted canonical route state.</prompt>
    <expected>Fails closed with `RESULT_CLASSIFICATION=no_effect` before `.env`, Compose, container, Serve, Caddy, volume, data, owner-token, credential, or external mutation.</expected>
  </eval>
  <eval type="adversarial">
    <prompt>Request project-wide Compose reconciliation, build, force recreation, restart, Caddy targeting, dependency startup, or Serve repair during explicit `--no-rollback`.</prompt>
    <expected>Refuses; the only forward Compose target is `resofeed` with `--no-build --no-deps`.</expected>
  </eval>
  <eval type="adversarial">
    <prompt>Omit, duplicate, abbreviate, uppercase, infer, or cross-bind either source commit, or combine `--no-rollback` with another mode.</prompt>
    <expected>Fails before runtime effects and reports `RESULT_CLASSIFICATION=no_effect`.</expected>
  </eval>
</eval_suite>