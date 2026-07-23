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

## Deploy the verified digest

Perform read-only target inspection first. Confirm the host and directory, OrbStack Docker CLI, Compose config, current `resofeed`/`resofeed-caddy` containers, named `/data` volume, Tailnet TCP/443 route, and masked secret presence. Then run:

```bash
ssh tefx-mbp-personal.platy-atlas.ts.net 'cd ~/Projects/resofeed-caddy && export PATH="/Applications/OrbStack.app/Contents/MacOS/xbin:$PATH" && ./deploy.sh \
  --verified-commit <40-lowercase-hex> \
  --immutable-tag git-<same-40-lowercase-hex> \
  --index-digest sha256:<index-64-hex> \
  --amd64-digest sha256:<amd64-64-hex> \
  --arm64-digest sha256:<arm64-64-hex>'
```

`deploy.sh` verifies both the immutable tag and digest reference against the supplied index/platform chain before changing Compose. It derives `RESOFEED_IMAGE=docker.io/tefx/resofeed@sha256:<index-digest>`, captures the currently deployed repository digest, verifies the existing SQLite volume, writes only non-secret identity fields, pulls the digest, updates the existing stack, and retains all named volumes.

Owner-token rotation, data clearing, registry credentials, account changes, alternate targets, and moving-tag substitution are outside this procedure and are refused.

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

If replacement or readiness fails, `deploy.sh` restores the captured prior digest in `.env`, recreates only the `resofeed` service against the same named volume, and requires root `200` plus unauthenticated Doctor `401`. It never removes the SQLite volume. A first deployment without a prior digest stops for manual recovery and still leaves data intact.

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