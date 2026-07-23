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

## Stage the verified procedure bytes

A separately authorized staging operation must run this maintained interface from the root of one clean integrated checkout whose `HEAD` is the full verified commit:

```bash
./deploy/resofeed-caddy/deploy.sh --stage-procedure \
  --verified-commit <40-lowercase-hex>
```

The mode rejects a dirty checkout, an abbreviated or different `HEAD`, non-blob inputs, or Git modes other than `100755` for `deploy.sh` and `100644` for `compose.yml`. It binds SHA-256 identities to exactly those two paths at that commit. Its fixed SSH target is `tefx-mbp-personal.platy-atlas.ts.net:~/Projects/resofeed-caddy`; there is no host, directory, or file override.

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
## Deploy the verified digest
Perform the broader read-only runtime target inspection only after the separately authorized staging operation reports `PROCEDURE_STAGE=verified`. Confirm the host and directory, OrbStack Docker CLI, Compose config, current `resofeed`/`resofeed-caddy` containers, named `/data` volume, Tailnet TCP/443 route, and masked secret presence.

The deployment authorization must bind the same full commit and both exact SHA-256 values emitted by staging. Then run only:

```bash
ssh tefx-mbp-personal.platy-atlas.ts.net 'cd ~/Projects/resofeed-caddy && export PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH" && ./deploy.sh \
  --verified-commit <40-lowercase-hex> \
  --immutable-tag git-<same-40-lowercase-hex> \
  --index-digest sha256:<index-64-hex> \
  --amd64-digest sha256:<amd64-64-hex> \
  --arm64-digest sha256:<arm64-64-hex> \
  --procedure-deploy-sha256 sha256:<staged-deploy-sh-64-hex> \
  --procedure-compose-sha256 sha256:<staged-compose-yml-64-hex>'
```

`deploy.sh` validates its own bytes and `compose.yml` against the caller-bound procedure identities before reading runtime configuration or invoking Docker, OCI, Compose, Caddy, Tailscale, or readiness work. A mismatch fails before deployment mutation. It then verifies both the immutable tag and digest reference against the supplied index/platform chain, derives `RESOFEED_IMAGE=docker.io/tefx/resofeed@sha256:<index-digest>`, captures the currently deployed repository digest, verifies the existing SQLite volume, writes only non-secret identity fields, pulls the digest, updates the existing stack, and retains all named volumes.

Owner-token rotation, data clearing, registry credentials, account changes, alternate targets, moving-tag substitution, and ad hoc procedure copying are outside this procedure and are refused.
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

Read-only verification commands:

```bash
ssh tefx-mbp-personal.platy-atlas.ts.net 'cd ~/Projects/resofeed-caddy && export PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH" && docker compose --env-file .env -f compose.yml ps'
curl -I "https://${RESOFEED_DOMAIN}"
curl -i "https://${RESOFEED_DOMAIN}/api/doctor"
```

The root must return `200`; unauthenticated `/api/doctor` must return `401`. Verify the running container's configured image equals the supplied digest reference and Tailscale Serve still maps TCP/443 to `tcp://127.0.0.1:${CADDY_LOCAL_HTTPS_PORT}`. Never include response bodies, tokens, provider keys, or `.env` values in evidence.

## Recovery and orphan recording
A staging failure before replacement removes only the target-local transaction directory. A partial two-file replacement automatically restores and revalidates both prior procedure files from the content-addressed backup. If a later operator must deliberately recover the reported prior procedure, use only the maintained source-side interface:

```bash
./deploy/resofeed-caddy/deploy.sh --recover-procedure \
  --backup-id sha256:<reported-backup-64-hex>
```

Recovery has no host or path override. It validates the fixed target, backup manifest, both backup hashes/modes, shell syntax, and Compose shape before target-local atomic renames. A recovery failure restores the procedure bytes present when recovery began when that rescue remains safely available. Do not invent direct SSH copy, `scp`, `rsync`, or manual rename steps.

If image replacement or readiness fails, `deploy.sh` restores the captured prior digest in `.env`, recreates only the `resofeed` service against the same named volume, and requires root `200` plus unauthenticated Doctor `401`. It never removes the SQLite volume. A first deployment without a prior digest stops for manual recovery and still leaves data intact.

When a publication leaves a complete unreferenced index/platform chain, record it on the authorized stack for later review:

```bash
./deploy.sh --record-orphan \
  --verified-commit <40-lowercase-hex> \
  --immutable-tag git-<same-40-lowercase-hex> \
  --index-digest sha256:<index-64-hex> \
  --amd64-digest sha256:<amd64-64-hex> \
  --arm64-digest sha256:<arm64-64-hex>
```

The fixed local orphan ledger contains only commit, tag, and digests. The script has no registry-deletion operation. Deleting an authorized temporary tag requires a separate registry-specific approval and must never be inferred from deployment authority.
## Stop

`./stop.sh` stops the stack while preserving named volumes. Data-destruction modes are outside the immutable deployment and rollback procedure.