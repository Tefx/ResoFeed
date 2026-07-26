# ResoFeed on a custom domain with Tailnet-only HTTPS
This deployment runs ResoFeed behind the existing Caddy/Tailscale stack on `tefx-mbp-personal.platy-atlas.ts.net:~/Projects/resofeed-caddy`. Caddy publishes HTTPS on host loopback; Tailscale Serve forwards Tailnet TCP/443 to that listener. The ResoFeed service accepts only `docker.io/tefx/resofeed@sha256:<index-digest>`.

## Topology

```text
https://${RESOFEED_DOMAIN}
        ↓ DNS A record, DNS-only
${TAILSCALE_IP} (tefx-mbp-personal Tailscale IP)
        ↓ Tailscale Serve TCP/443
127.0.0.1:${CADDY_LOCAL_HTTPS_PORT}
        ↓ resofeed-caddy on the existing private Compose network
resofeed container on :8080
        ↓ named volume retained across replacement and rollback
resofeed-caddy_resofeed-data:/data/resofeed.sqlite3
```

No alternate host, repository, stack, or volume is part of this procedure.

## Cloudflare boundary

Create a DNS-only A record for `RESOFEED_DOMAIN` pointing to the Mac's Tailscale IP. Give `CF_API_TOKEN` only `Zone / Zone / Read` and `Zone / DNS / Edit` for the owning zone. The token is used by Caddy for DNS-01 only.

The deployment reads `CF_API_TOKEN`, `OPENROUTER_KEY`, and `TAVILY_API_KEY` from the local `.env`. It reports only `[masked-present]` or `[masked-empty]`; commands and evidence must never print values, `.env` contents, or secret-source paths.

## First-time setup

On the authorized host:

```bash
cd ~/Projects/resofeed-caddy
cp .env.example .env
chmod 600 .env
```

Set `CADDY_LOCAL_HTTPS_PORT`, `RESOFEED_DOMAIN`, and `CF_API_TOKEN`. `TAILSCALE_IP` may remain empty when `tailscale ip -4` returns the correct address. The provider keys may remain empty. Leave every `RESOFEED_*` identity field blank: `deploy.sh` writes the verified non-secret chain atomically.

The local `.env` is ignored by Git. Never commit it or include it in deployment evidence.

## Publish the immutable OCI index

Run publication from a clean repository checkout only after another authority has supplied and verified the release commit:

```bash
OCI_REPOSITORY=docker.io/tefx/resofeed
VERIFIED_COMMIT=<caller-supplied-40-lowercase-hex>
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
```

Do not add a moving publication tag. Inspect the pushed immutable tag and bind all three digests from one OCI index:

```bash
docker buildx imagetools inspect "${OCI_REPOSITORY}:${IMMUTABLE_TAG}"
```

Record these caller-supplied values without abbreviation:

```text
INDEX_DIGEST=sha256:<64 lowercase hex>
AMD64_DIGEST=sha256:<linux/amd64 manifest 64 lowercase hex>
ARM64_DIGEST=sha256:<linux/arm64 manifest 64 lowercase hex>
```

The index must contain exactly `linux/amd64` and `linux/arm64`. Each platform image must expose `org.opencontainers.image.revision=${VERIFIED_COMMIT}`. An absent, duplicate, additional, incomplete, or mismatched descriptor stops publication/deployment evidence.

## Authenticate the SSH endpoint

Initialize the fixed Bash transport before any maintained manual SSH entry:

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

This binds the literal FQDN as the effective SSH HostName and host-key lookup identity. It uses only the default existing OpenSSH known-host trust and public-key credentials in noninteractive mode. Unknown or changed keys fail closed. Do not enroll/update a key, load SSH configuration aliases, rewrite the hostname, use an alternate known-host store, bypass checking, select another account, or substitute another endpoint. The remote internal short hostname is unknown and never authorizes staging, recovery, inspection, or deployment.
## Stage the verified procedure bytes
A separately authorized staging operation must run this maintained interface from the root of one clean integrated checkout whose `HEAD` is detached at the full verified commit:

```bash
./deploy/resofeed-caddy/deploy.sh --stage-procedure \
  --verified-commit <40-lowercase-hex>
```

The mode rejects an attached `HEAD` before any SSH invocation. It also rejects a dirty checkout, an abbreviated or different `HEAD`, non-blob inputs, or Git modes other than `100755` for `deploy.sh` and `100644` for `compose.yml`. It binds SHA-256 identities to exactly those two paths at that commit. Its fixed SSH target is `tefx-mbp-personal.platy-atlas.ts.net:~/Projects/resofeed-caddy`; there is no host, directory, or file override.

Before mutation, staging verifies the host, stack directory, both prior regular files, executable mode, shell syntax, and Compose shape with `/dev/null` plus non-secret validation placeholders. It does not read remote `.env`, Caddy configuration, containers, images, volumes, Tailscale state, credentials, or runtime-secret inputs. It transfers only `deploy.sh` and `compose.yml` through a target-local transaction directory, rechecks source and remote SHA-256 identities, writes a content-addressed prior-byte backup, and installs both files with target-local atomic renames. Partial replacement restores both prior files. Missing files, target drift, transfer failure, validation failure, hash mismatch, or unavailable restoration fails closed.

Retain the complete non-secret output for the later deployment authorization:

```text
PROCEDURE_SOURCE_COMMIT=<40 lowercase hex>
PROCEDURE_DEPLOY_SHA256=sha256:<64 lowercase hex>
PROCEDURE_COMPOSE_SHA256=sha256:<64 lowercase hex>
PROCEDURE_BACKUP_ID=sha256:<64 lowercase hex>
PROCEDURE_STAGE=verified
```

Do not substitute `scp`, `rsync`, ad hoc SSH copy commands, alternate paths, or manual renames.
The producer uses that exact embedded transport for inspect, prepare, both file transfers, finalize, cleanup, and recovery. After FQDN host-key authentication it verifies the canonical physical home-relative path, `resofeed-caddy` basename/project identity, regular non-symlink `deploy.sh` and `compose.yml`, exact `755`/`644` modes, and Compose shape. An unknown/changed key fails before target-local preparation or transfer; an internal hostname mismatch has no effect.
## Canonical Tailscale 1.98.8 route precondition
This release requires an existing canonical route before publication or deployment. The tracked read-only helper and explicit `--no-rollback` deployment both obtain `tailscale serve status --json`, reject duplicate JSON members, and accept only the string at `TCP.443.TCPForward` when it equals `127.0.0.1:8443`. Retained evidence contains only `TCP/HTTPS 443 -> 127.0.0.1:8443`; raw Serve JSON, human output, peer/session telemetry, addresses, paths, configuration, and parser diagnostics are excluded.

Malformed, missing, wrong-type, duplicate, ambiguous, or wrong-target TCP/443 state blocks explicit forward-only deployment before every persistent deployment effect, including identity-file writes and Compose commands. The obsolete exact row and Tailscale 1.98.8 tree output have no route authority. Explicit `--no-rollback` never calls `ensure_tailscale_serve`, `tailscale serve`, or any repair path. Its accepted route remains read-only and no retry occurs.

A separate, current, explicit human authorization may use this exact noninteractive repair:

```bash
tailscale serve --yes --bg --tcp=443 tcp://127.0.0.1:8443
```

Deployment authority does not authorize that repair. Route absence or drift returns a blocker before build, publication, deployment, restart, or other service mutation.

Repository rollback of this repair reverts only `.agents/skills/resofeed-tailnet-deploy/SKILL.md`, `deploy/resofeed-caddy/README.md`, `deploy/resofeed-caddy/deploy.sh`, `docs/CONTAINER.md`, `docs/PLAYWRIGHT_E2E_HARNESS_CONTRACT.md`, `scripts/vectl-check.mjs`, and `scripts/vectl-check.test.mjs`. It performs no SSH, Serve repair, procedure recovery, deployment, publication, or runtime mutation.
## Deploy the verified digest
Perform the broader read-only runtime target inspection only after the separately authorized staging operation reports `PROCEDURE_STAGE=verified`. Through the fixed `TAILNET_SSH_OPTIONS`, confirm the canonical physical home-relative directory, `resofeed-caddy` basename/project identity, regular non-symlink `deploy.sh` and `compose.yml`, exact `755`/`644` modes, OrbStack Docker CLI, Compose config, current containers, named `/data` volume, Tailnet TCP/443 route, and masked secret presence. Never compare the internal short hostname.

The deployment authorization binds `PROCEDURE_SOURCE_COMMIT` for the integrated tracked procedure independently from the OCI application source passed through `--verified-commit`. Each must be exactly 40 lowercase hexadecimal characters. The procedure never derives either value from the other and accepts equal or unequal values without changing their distinct meanings. Run the default prior-digest rollback mode only as:

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

Default mode requires and captures a recoverable prior digest, verifies `resofeed-caddy_resofeed-data`, deploys the immutable index, and restores the captured prior digest plus direct readiness on failure.

For an explicitly authorized forward-only deployment, add `--no-rollback`. It still requires the two independent commit identities, immutable index/platform/revision chain, and procedure hashes. It accepts a target with no prior digest, never derives one, never invokes old-image recovery, and does not retry. Before `.env` identity replacement or any Compose call, it requires the duplicate-free canonical Serve JSON route. It then runs only service-scoped Compose argv: `config --quiet resofeed`, `pull resofeed`, and `up -d --no-build --no-deps resofeed`. It does not build, force recreation, restart, reconcile the project, target Caddy, start dependencies, call `ensure_tailscale_serve`, or invoke `tailscale serve`. The named SQLite volume, configuration, owner token, masked secrets, route ownership, and Caddy identity remain protected. Output records `PROCEDURE_SOURCE_COMMIT`, `OCI_APPLICATION_SOURCE_COMMIT`, and `RESULT_CLASSIFICATION` as `success`, `no_effect`, `known_partial`, or `unknown_partial`.

Owner-token rotation, data clearing, registry credentials, account changes, alternate targets, moving-tag substitution, host-key trust mutation, ad hoc procedure copying, route repair, and Caddy reconciliation are outside this procedure and are refused.
## Tracked read-only probe harness
Invoke the wrapper from the repository root with the complete nonsecret staging receipt except for a caller-supplied manifest hash:

```bash
./deploy/resofeed-caddy/verify.sh \
  --source-commit <staged-procedure-40-lowercase-hex> \
  --deploy-sha256 sha256:<current-deploy-64-hex> --deploy-mode 755 \
  --compose-sha256 sha256:<current-compose-64-hex> --compose-mode 644 \
  --backup-id sha256:<backup-64-hex> \
  --backup-manifest-mode 600 \
  --prior-deploy-sha256 sha256:<prior-deploy-64-hex> --prior-deploy-mode 755 \
  --prior-compose-sha256 sha256:<prior-compose-64-hex> --prior-compose-mode 644
```

`verify.sh` is the repository-owned wrapper for one immutable, read-only target probe. Run it only from a clean detached integrated checkout. The supplied staged procedure source commit must be an ancestor of the current integrated helper `HEAD`; equality is neither required nor expected. The staged source commit binds only exact `100755` `deploy.sh` and `100644` `compose.yml` blobs. Their current regular non-symlink bytes, modes, and caller SHA-256 identities must still equal those staged blobs. Both executable helper files, `verify.sh` and `verify-remote.sh`, are instead bound to exact `100755` tracked blobs and byte-identical files at the current integrated `HEAD`; the staged source commit need not contain either helper.

Before SSH, the wrapper validates the exact scalar type at every interface position: one lowercase 40-hex commit, five `sha256:` plus 64-lowercase-hex identities, and exact `755`, `644`, or `600` modes according to the field. Whitespace, shell metacharacters, malformed values, missing or duplicate options, and alternate argument order fail locally as `PROBE_CONSTRUCTION_FAIL` before transport.

The wrapper fixes the destination to `tefx-mbp-personal.platy-atlas.ts.net`, the stack to `~/Projects/resofeed-caddy`, and the default existing strict-known-key SSH policy. It starts exactly one SSH process and never retries. The SSH argv uses literal one-argument `-Fnone`, `-T`, the fixed FQDN options and destination, then `bash`, `-s`, `--`, followed by exactly eleven positional values in this order: staged source commit; current deploy SHA-256; current deploy mode; current Compose SHA-256; current Compose mode; backup ID; backup manifest mode; prior deploy SHA-256; prior deploy mode; prior Compose SHA-256; prior Compose mode. It sends no environment-assignment argv. The byte-identical tracked `verify-remote.sh` is the only stdin program. There is no target, account, host alias, trust-store, stack, interpreter, option, argument-order, or remote-program override, and there is no second probe.

The remote helper consumes those eleven values positionally before installing its cooperating `ERR`/`EXIT` traps, then requires no remaining arguments and revalidates every scalar before observing the target. It never consumes probe inputs from the environment. After those validations and before the first Docker-backed observation, it exports exactly once `PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH"`. The macOS target requires OrbStack and its Docker CLI at that exact xbin location. This preserves the caller PATH as the unchanged suffix so the remaining permitted tools retain their caller-selected resolution, and the helper never prints or discloses PATH. It does not search alternate Docker locations or sockets, configure a Docker host, install Docker, or modify Docker or host configuration.

The backup manifest has no caller-supplied SHA-256. The helper derives the canonical manifest internally as exactly these four newline-terminated rows, in order, with one final newline and no extra byte:

```text
schema_version=resofeed.procedure-backup.v1
backup_id=<supplied backup ID>
deploy.sh=<supplied prior deploy SHA-256> mode=<supplied prior deploy mode>
compose.yml=<supplied prior Compose SHA-256> mode=<supplied prior Compose mode>
```

It derives that byte sequence's SHA-256 internally, requires the actual regular non-symlink manifest to have mode `600`, exactly four rows, exact bytes, and the same hash, and never discloses the manifest hash.

The remote program creates no file and reads no runtime secret or Caddy configuration. Its executable surface is limited to shell control, canonical path/file/hash/mode checks, read-only Docker container/image/volume inspection through the exact OrbStack-prefixed PATH contract, `tailscale serve status --json`, one duplicate-aware `/usr/bin/python3` standard-library parse, and exactly two GET-only `curl` calls. It derives exactly one HTTPS public host from the running ResoFeed `--public-url` argument, keeps that host undisclosed, and uses it for SNI and Host while connecting to loopback Caddy port `8443`. Passing readiness is root `200` plus unauthenticated Doctor `401`; the Tailnet SSH FQDN is never used as the public Host or SNI identity.

The bounded stdout ledger is:

```text
PROBE_PHASE=canonical_stack
CANONICAL_STACK=verified
PROBE_PHASE=procedure_current
PROCEDURE_CURRENT=verified
PROBE_PHASE=backup
BACKUP=verified
PROBE_PHASE=docker_identity
DOCKER_IDENTITY=verified
PROBE_PHASE=volume
VOLUME=verified
PROBE_PHASE=tailnet_route
TAILNET_ROUTE=verified
PROBE_PHASE=public_url
PUBLIC_URL_HOST=validated
PROBE_PHASE=readiness
READINESS=verified
PROBE_PHASE=protected_after
PROTECTED_STATE=unchanged
PROBE_OK
```

A remote assertion failure emits one `PROBE_FAIL phase=<last_phase> status=<status>`. Markerless SSH failure remains `PROBE_TRANSPORT_FAIL`; local input or source construction failure remains `PROBE_CONSTRUCTION_FAIL`. The wrapper suppresses unbounded remote diagnostics and never synthesizes phase success.

Before and after readiness, the same helper hashes a canonically sorted stable projection of current procedure hashes/modes; the internally derived backup-manifest identity and mode; prior procedure hashes/modes; running ResoFeed and Caddy container/image IDs; `/data` mount type, destination, actual engine-volume identity, and logical `com.docker.compose.volume=resofeed-data` label; the normalized canonical Tailnet value `TCP/HTTPS 443 -> 127.0.0.1:8443`; and a SHA-256 of the validated public host. The projection excludes SQLite main/WAL/SHM bytes, rows, sizes, and times; app/Caddy logs and counters; health/status timestamps, PIDs, exec and transient network fields; Tailnet peer/address/session telemetry; access times, command order, timestamps, and every secret or configuration value.

This probe performs no publication, procedure staging, deployment, rollback, service change, registry operation, credential change, or data operation. Later publication and deployment remain separate accepted steps. Rollback of the OrbStack PATH remediation reverts only `verify-remote.sh`, `scripts/vectl-check.mjs`, `scripts/vectl-check.test.mjs`, and this README to the integrated transport-remediation state; it performs no remote recovery or deployment.
## Verification
Passing deployment evidence contains only non-secret identities and these outcomes:

```text
OCI_REPOSITORY=docker.io/tefx/resofeed
OCI_IDENTITY=index_and_platform_digests
TAILNET_TARGET=tefx-mbp-personal:resofeed-caddy
MUTABLE_LATEST=forbidden
ROLLBACK=prior_digest_and_readiness
SECRETS=masked_presence_only
READINESS=root_200_doctor_401
```

Read-only verification uses the same authenticated endpoint policy:

```bash
ssh "${TAILNET_SSH_OPTIONS[@]}" "$TAILNET_SSH_HOST" 'set -Eeuo pipefail
canonical_home=$(CDPATH= cd -- "$HOME" && pwd -P)
canonical_stack="${canonical_home}/Projects/resofeed-caddy"
[ -d "$canonical_stack" ] && [ ! -L "$canonical_stack" ]
cd "$canonical_stack"
[ "$(pwd -P)" = "$canonical_stack" ]
[ "$PWD" = "$canonical_stack" ]
[ "$(basename "$PWD")" = resofeed-caddy ]
export PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH"
docker compose --project-name resofeed-caddy --env-file .env -f compose.yml ps'
curl -I "https://${RESOFEED_DOMAIN}"
curl -i "https://${RESOFEED_DOMAIN}/api/doctor"
```

The root must return `200`; unauthenticated `/api/doctor` must return `401`. Verify the running container's configured image equals the supplied digest reference and the tracked JSON probe still finds only `TCP.443.TCPForward = 127.0.0.1:${CADDY_LOCAL_HTTPS_PORT}` without Serve mutation. Never include raw Serve JSON, response bodies, tokens, provider keys, or `.env` values in evidence.
## Recovery and orphan recording
A staging failure before replacement removes only the target-local transaction directory. A partial two-file replacement automatically restores and revalidates both prior procedure files from the content-addressed backup. If a later operator must deliberately recover the reported prior procedure, use only the maintained source-side interface:

```bash
./deploy/resofeed-caddy/deploy.sh --recover-procedure \
  --backup-id sha256:<reported-backup-64-hex>
```

Recovery has no host or path override. It validates the fixed target, backup manifest, both backup hashes/modes, shell syntax, and Compose shape before target-local atomic renames. Do not invent direct SSH copy, `scp`, `rsync`, or manual rename steps.

Default image deployment refuses to begin without a recoverable prior digest. If replacement or readiness fails, `deploy.sh` restores that digest in `.env`, recreates only the `resofeed` service against the same named volume, and requires root `200` plus unauthenticated Doctor `401`. A verified restoration reports `RESULT_CLASSIFICATION=no_effect`; an unverified final state reports `unknown_partial`.

Explicit `--no-rollback` provides the no-prior-digest path. Invalid Serve JSON route state exits with `no_effect` before `.env` or Compose mutation. After canonical route admission, identity-file or pull failures report `known_partial`; failures after the one service-scoped replacement begins report `unknown_partial`; `success` requires exact image identity and readiness. This mode never retries, invokes old-image recovery, removes the SQLite volume, prints secrets, rotates the owner token, repairs Serve, or reconciles Caddy.

When a publication leaves a complete unreferenced index/platform chain, record it on the authorized stack for later review:

```bash
./deploy.sh --record-orphan \
  --verified-commit <40-lowercase-hex> \
  --immutable-tag git-<same-40-lowercase-hex> \
  --index-digest sha256:<index-64-hex> \
  --amd64-digest sha256:<amd64-64-hex> \
  --arm64-digest sha256:<arm64-64-hex>
```

The fixed local orphan ledger contains only commit, tag, and digests. The script has no registry-deletion operation. Deleting an authorized temporary tag requires separate registry-specific approval and must never be inferred from deployment authority.
The source-side recovery interface applies the same fixed strict-known-key SSH transport before any remote recovery command. Unknown or changed FQDN keys fail before lock or rescue creation; no internal hostname, alternate target, or trust override is accepted.
Repository rollback of this deployment-procedure repair reverts only the exact seven synchronized files in the admitted change set. It performs no remote procedure recovery or runtime operation.
## Stop

`./stop.sh` stops the stack while preserving named volumes. Data-destruction modes are outside the immutable deployment and rollback procedure.