# ResoFeed Container Design and Usage

Status: implemented container packaging contract.

This document defines the project-owned containerization shape for ResoFeed. It is intentionally limited to packaging the existing single-binary runtime. HTTPS, Tailscale, Caddy, Cloudflare Tunnel, Kubernetes, and hosting-provider specifics are deployment examples outside the core project contract.

## Design Goal

Package ResoFeed as a small multi-architecture OCI image that runs the existing `resofeed serve` command with persistent SQLite state and one exposed HTTP port for UI, JSON HTTP, and MCP.

## Core Decisions

### One container process

Use one long-running container process: `resofeed serve`.

Rationale: the architecture already defines one Go binary that serves static UI assets, JSON HTTP, MCP Streamable HTTP at `/mcp`, SQLite migrations, and the background ingest loop. Adding sidecars, workers, or additional long-running runtime/admin services would violate the current runtime boundary.

This does not forbid documented offline CLI maintenance commands, such as `owner-token reset`, when an operator intentionally runs them outside the normal long-running container process.

Trade-off: this keeps deployment simple, but it does not provide a separate background worker scaling path. That is acceptable because ResoFeed is single-tenant and SQLite-backed.

### One exposed port

Expose one HTTP port, normally container port `8080`.

The same listener serves:

- `/` for the web UI;
- `/api/*` for JSON HTTP;
- `/mcp` for MCP Streamable HTTP.

Rationale: these are already wired into one router. A second HTTP listener would add configuration without adding a current capability.

### Persistent SQLite volume

Persist only the SQLite state directory.

Recommended image/runtime path:

```text
/data/resofeed.sqlite3
```

Recommended Docker volume:

```text
resofeed-data:/data
```

Rationale: the image should contain program files only. User-owned state belongs in a volume so container replacement does not erase sources, items, search index, owner-token hash, steering rules, and resonance state.

### Runtime base image

Use `gcr.io/distroless/static-debian12:nonroot` as the default runtime base image.

Rationale: it is small, has no shell or package manager, runs as a non-root user, and includes the CA certificate support needed for HTTPS RSS sources and OpenRouter. `scratch` is smaller but requires explicitly copying CA certificates and user metadata; use it only if runtime HTTPS probes prove it works.

Trade-off: distroless is slightly larger than `scratch`, but it avoids fragile certificate and non-root setup.

Machine-checkable runtime requirement: the final image must run as a non-root user and that user must be able to create and update `/data/resofeed.sqlite3` when `/data` is mounted as the persistent volume.

### Multi-architecture support

Required image platforms:

```text
linux/amd64
linux/arm64
```

Rationale: these cover common Intel/AMD hosts, ARM edge devices, and Apple Silicon Docker runtimes. Do not add 32-bit ARM by default; add it only when there is a named target device and verification path.

## Image Build Contract

The image must be built with three stages:

1. Build the static web UI in a Node builder stage:

   ```text
   npm --prefix web ci
   npm --prefix web run build
   ```

2. Build the Go binary in a Go builder stage after making the validated `web/build` output available to the Go build context used by `cmd/resofeed`. The production UI must be embedded into the resulting binary during this stage:

   ```text
   go build -o /out/resofeed ./cmd/resofeed
   ```

   Recommended build settings for release images:

   ```text
   CGO_ENABLED=0
   GOOS=linux
   GOARCH=$TARGETARCH
   -trimpath
   -ldflags=-s -w
   ```

3. Copy only the built binary into the final runtime image:

   ```text
   /out/resofeed -> /app/resofeed
   ```

   Create `/data` separately as an empty runtime directory or mount point owned and writable by the final non-root runtime user. `/data` must never be copied from repository local state or from any build stage.

   The final image must declare this invocation contract:

   ```text
   ENTRYPOINT ["/app/resofeed"]
   ```

   Container command arguments are ResoFeed CLI arguments. For example, `docker run <image-ref> serve ...` runs `/app/resofeed serve ...`. Startup and UI serving must work from any working directory. The final runtime must not contain or mount `web/build`, and the server must not resolve UI assets from the process working directory or any external asset directory.

   `/data` must be writable by the final non-root runtime user so SQLite can create and update `/data/resofeed.sqlite3`.

### Allowed build dependencies

- The Go build stage may use the Go toolchain compatible with `go.mod` (`go 1.22`) or an approved newer Go toolchain.
- Node/npm are allowed only in the web build stage, and dependency installation must use `npm ci` from `web/package-lock.json`.
- The final runtime image may contain the binary, runtime-base certificate/user metadata required by the selected base image, and the empty writable `/data` mount point only.
- The final runtime image must not include Node/npm, a shell, a package manager, build-only OS packages, or an external UI asset tree.
- Do not add extra runtime packages unless architecture approval explicitly allows them.

Do not copy `.env`, `.git`, local `data/`, `node_modules/`, test artifacts, audit evidence, or `web/build` into the runtime image.
## Runtime Configuration

### Recommended container command

```text
serve \
  --addr 0.0.0.0:8080 \
  --public-url http://<host>:8080 \
  --db /data/resofeed.sqlite3
```

With the image `ENTRYPOINT`, these are container command arguments. The effective process invocation is `/app/resofeed serve ...`.

`--owner-token`, `--openrouter-model`, and `--first-fetch-limit` are optional.

### Configuration table

| Surface | Name | Required for container? | Recommended container value | Notes |
|---|---:|---:|---|---|
| flag | `--addr` | Yes in image docs | `0.0.0.0:8080` | Bind address inside the container. Use `0.0.0.0` so Docker port publishing can reach the process. |
| flag | `--public-url` | Strongly recommended | `http://<host>:8080` or future HTTPS URL | External URL used by MCP clients and startup metadata. If omitted with `0.0.0.0`, ResoFeed derives a localhost URL that is usually wrong for container deployment. |
| flag | `--db` | Optional in the binary; recommended in container docs | `/data/resofeed.sqlite3` | The binary default is `./data/resofeed.sqlite3`; container deployments should prefer an explicit `/data` volume path. |
| flag | `--openrouter-model` | No | Omit unless needed | Non-secret. Empty or omitted means OpenRouter account default. |
| flag | `--owner-token` | No | Omit for auto-generation, or pass an explicit strong token | Explicit token must be at least 32 visible non-whitespace characters. Only the hash is stored. |
| flag | `--first-fetch-limit` | No | Omit for default `50` | `0` means unlimited; maximum is `500`. |
| env | `OPENROUTER_KEY` | No | Set through Docker/host secret handling when using model-backed features | Only documented OpenRouter API key name. Missing key allows startup but provider-backed operations are unavailable. |
| env | `RESOFEED_FIRST_FETCH_LIMIT` | No | Usually omit | Fallback only when `--first-fetch-limit` is omitted. |

There is no provider selector. OpenRouter is the only LLM backend in the current architecture.

There is no `RESOFEED_FEEDS` startup variable. RSS sources are product state and should be added through Steer, OPML import, HTTP/MCP operations, state import, or an existing SQLite volume.

## `--addr` vs `--public-url`

`--addr` is where the Go process listens.

Example:

```text
--addr 0.0.0.0:8080
```

`--public-url` is the externally reachable base URL that humans and MCP clients should use.

Examples:

```text
--public-url http://192.168.1.20:8080
--public-url https://resofeed.example.com
--public-url https://device.tailnet-name.ts.net
```

These values are often different in containers. The process listens on `0.0.0.0:8080`, but external clients use a LAN IP, domain, or Tailscale HTTPS name.

## Owner Token Behavior in Containers

If `--owner-token` is omitted, first startup generates a token and prints it once to stdout:

```text
owner token generated: rfeed_<token>
```

For Docker, read it with:

```text
docker logs resofeed
```

After the token hash exists in SQLite, later starts print reuse status rather than the plaintext token.

If an explicit token is preferred, pass it as a `serve` flag:

```text
--owner-token rfeed_<at-least-32-visible-non-whitespace-characters>
```

Warning: explicit owner tokens passed as CLI arguments may be visible in shell history, Docker command history or metadata, `docker inspect`, logs, or process listings. Prefer auto-generation unless the operator accepts that exposure for the deployment environment.

Do not add an owner-token environment variable unless the architecture contract is changed. The current runtime contract uses the CLI flag and stores only the SHA-256 hash in SQLite.

## Minimal Docker Run Examples
These examples require a runnable ResoFeed container image. Use `<image-ref>` as either a local single-platform image such as `resofeed:local` or a released immutable reference such as `docker.io/tefx/resofeed@sha256:<index-digest>`. Released deployment, verification, and rollback examples must use the digest form.

Do not paste a real `OPENROUTER_KEY` into copied shell commands. Inline secrets can be saved in shell history, terminal scrollback, and process inspection output. Set `OPENROUTER_KEY` through a secret-safe host mechanism, then pass it through with `-e OPENROUTER_KEY` and no inline value.

One safe interactive shell pattern is:

```text
read -rsp "OpenRouter key: " OPENROUTER_KEY
export OPENROUTER_KEY
```

A service manager or hosting secret store may supply the host variable. If it is absent, ResoFeed starts with model-backed operations unavailable.

### Auto-generated owner token

```text
docker run -d \
  --name resofeed \
  --restart unless-stopped \
  -p 8080:8080 \
  -v resofeed-data:/data \
  -e OPENROUTER_KEY \
  <image-ref> \
  serve \
  --addr 0.0.0.0:8080 \
  --public-url http://<host>:8080 \
  --db /data/resofeed.sqlite3
```

Then obtain the generated owner token through the deployment's secret-safe operator channel; do not retain it in release evidence.

### Explicit owner token

Use this form only when you intentionally accept CLI-argument exposure. Auto-generation is safer for most deployments.

```text
docker run -d \
  --name resofeed \
  --restart unless-stopped \
  -p 8080:8080 \
  -v resofeed-data:/data \
  -e OPENROUTER_KEY \
  <image-ref> \
  serve \
  --addr 0.0.0.0:8080 \
  --public-url http://<host>:8080 \
  --db /data/resofeed.sqlite3 \
  --owner-token rfeed_<at-least-32-visible-non-whitespace-characters>
```
### Auto-generated owner token

```text
docker run -d \
  --name resofeed \
  --restart unless-stopped \
  -p 8080:8080 \
  -v resofeed-data:/data \
  -e OPENROUTER_KEY \
  <image-ref> \
  serve \
  --addr 0.0.0.0:8080 \
  --public-url http://<host>:8080 \
  --db /data/resofeed.sqlite3
```

Then read the generated owner token:

```text
docker logs resofeed
```

### Explicit owner token

Use this form only when you intentionally accept the CLI-argument exposure described above. Auto-generation is safer for most deployments.

```text
docker run -d \
  --name resofeed \
  --restart unless-stopped \
  -p 8080:8080 \
  -v resofeed-data:/data \
  -e OPENROUTER_KEY \
  <image-ref> \
  serve \
  --addr 0.0.0.0:8080 \
  --public-url http://<host>:8080 \
  --db /data/resofeed.sqlite3 \
  --owner-token rfeed_<at-least-32-visible-non-whitespace-characters>
```

## Multi-architecture Build Command
Tailnet staging, recovery, inspection, and deployment authenticate `tefx-mbp-personal.platy-atlas.ts.net` through the literal FQDN as both effective HostName and host-key lookup identity. The maintained Bash transport uses `-F none`, `StrictHostKeyChecking=yes`, `UpdateHostKeys=no`, disabled DNS host-key trust/canonicalization, public-key-only batch authentication, no forwarding or multiplexing, and the default existing OpenSSH known-host files. It never enrolls or updates trust, loads aliases, rewrites the hostname, chooses another trust store/account/endpoint, or accepts an unknown/changed key. After connection it validates the canonical physical home-relative `Projects/resofeed-caddy` path, stack basename/project identity, regular non-symlink two-file procedure, exact `755`/`644` modes, and Compose shape. The internal short hostname is unknown and irrelevant.
Release publication targets exactly `docker.io/tefx/resofeed`. It starts from a caller-supplied verified commit, binds the tag `git-${VERIFIED_COMMIT}`, labels both platform images with that commit, and publishes exactly `linux/amd64` plus `linux/arm64`:

```text
OCI_REPOSITORY=docker.io/tefx/resofeed
VERIFIED_COMMIT=<caller-supplied-40-lowercase-hex>
IMMUTABLE_TAG=git-${VERIFIED_COMMIT}

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

`--push` is required because Docker cannot load a multi-platform OCI index into the local image store. `--provenance=false` and `--sbom=false` keep this release index to the two declared runtime platform manifests; provenance policy can be introduced only with a matching identity-contract change.

The release record binds all of these unabridged values:

```text
VERIFIED_COMMIT=<40 lowercase hex>
IMMUTABLE_TAG=git-<same commit>
INDEX_DIGEST=sha256:<OCI index 64 hex>
AMD64_DIGEST=sha256:<linux/amd64 manifest 64 hex>
ARM64_DIGEST=sha256:<linux/arm64 manifest 64 hex>
```

Publication fails closed unless the immutable tag and `docker.io/tefx/resofeed@${INDEX_DIGEST}` resolve to the same index, the index contains exactly the supplied two platform descriptors, and each platform image reports `org.opencontainers.image.revision=${VERIFIED_COMMIT}`. Do not publish a moving alias.

The only production Tailnet consumer is `tefx-mbp-personal.platy-atlas.ts.net:~/Projects/resofeed-caddy`. Before any deployment authorization, a separately authorized operator runs the maintained clean-checkout producer:

```text
./deploy/resofeed-caddy/deploy.sh --stage-procedure \
  --verified-commit <caller-supplied-40-lowercase-hex>
```

It stages exactly the verified commit's `deploy.sh` and `compose.yml`, reports `PROCEDURE_DEPLOY_SHA256`, `PROCEDURE_COMPOSE_SHA256`, and a content-addressed backup identity, and performs no publication, deployment, runtime, data, credential, or secret mutation. It does not read remote `.env`. Partial replacement restores both prior procedure files. The only manual recovery interface is `./deploy/resofeed-caddy/deploy.sh --recover-procedure --backup-id sha256:<reported-backup-64-hex>`; ad hoc copy or rename commands are outside the contract.

Formal deployment must bind the same full commit and both procedure SHA-256 values before runtime configuration is read. Its Compose input is `RESOFEED_IMAGE=docker.io/tefx/resofeed@${INDEX_DIGEST}`. The deployment procedure captures the prior repository digest, preserves `resofeed-caddy_resofeed-data`, verifies direct readiness, and restores the prior digest/readiness pair on failure. Credential rotation, data deletion, alternate targets, and registry deletion are outside deployment authority. A complete orphan index/platform chain is recorded for separately authorized cleanup.

For local current-host testing, build and load one explicitly local tag:

```text
docker buildx build \
  --platform linux/$(go env GOARCH) \
  --tag resofeed:local \
  --load \
  .
```

Local tags are not release, deployment, verification, or rollback identities.
## Expected Image Size

Image size target: aim for tens of MB, not hundreds.

Main contributors:

- distroless static runtime base: small;
- Svelte static build: usually small;
- Go static binary with SQLite support: the largest part.

This is a non-gating target, not a promised fixed range. The release process should publish measured compressed image sizes for each target platform.

## HTTPS and Reverse Proxy Boundary

The core container image does not terminate TLS.

For HTTPS, keep ResoFeed listening on plain HTTP inside the container and set `--public-url` to the external HTTPS URL provided by the deployment layer.

Go owns the application security-header contract, including Content Security Policy, `X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options`, for static UI, JSON HTTP, and MCP responses as applicable. Caddy and other reverse proxies must pass those headers through unchanged: they must not remove, replace, duplicate, or weaken them.

Examples of deployment-layer choices:

- [Tailscale Serve/Funnel](examples/TAILSCALE_CONTAINER.md);
- Caddy;
- Cloudflare Tunnel;
- a host or platform reverse proxy.

These are examples, not core runtime dependencies.
## Application-Owned Browser Security
The Go binary emits one effective value for each browser security header on static, API, MCP, authorization-error, not-found, and internal-error responses:

- `Content-Security-Policy`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- `X-Frame-Options: DENY`.

Before opening the production listener, Go validates the embedded UI and derives the CSP from every executable inline script body in the embedded `index.html`. The policy uses ordered unique SHA-256 script sources and does not permit `unsafe-inline`. One outer middleware owns all four headers. For response writers that support `http.Flusher`, it forwards each nontrivial downstream write as two direct segments with a flush between them; it retains no response bytes or staged completion state. The wrapper forwards explicit flushes, exposes the underlying writer through `Unwrap`, and passes the original request context, so MCP/static responses remain observable across multiple writes and cancellation reaches handlers directly. Writers without flush support pass through unchanged.

Caddy and other reverse proxies must pass these application-owned values unchanged. The policy must boot the embedded UI and preserve ordinary authenticated product operations, including OPML import and JSON State export, import, and download. Container and browser evidence must redact owner tokens, provider keys, authorization values, cookies, provider bodies, and `.env` contents.
## Verification Checklist
Before accepting the containerization or immutable release procedure:

- Build succeeds for `linux/amd64` and `linux/arm64`.
- Runtime image does not contain `.env`, `.git`, local `data/`, `node_modules`, `web/build`, or any other external UI asset tree.
- Final image runs as non-root, can create/write `/data/resofeed.sqlite3` through the mounted `/data` volume, and contains no required application runtime artifact beyond `/app/resofeed`.
- The same final image starts successfully from at least two working directories, including one unrelated to `/app`; UI behavior and generated asset URLs are identical.
- Container starts with `resofeed serve` and logs `ui: mounted`, `api: enabled`, and `mcp: /mcp`.
- `GET /` proves the generated SvelteKit UI is served from the binary: HTML references `_app/immutable/`, and an extracted referenced asset returns HTTP `200`.
- Binary-only runtime proof removes or makes unavailable every external UI build directory before startup, then verifies root, generated assets, and a valid deep link.
- Static GET/HEAD behavior, content types, deep-link fallback, and ordinary not-found responses remain correct without an external UI asset directory.
- `/api/doctor` returns `401` without owner token and succeeds with the token; safe output reports embedded-asset readiness without exposing tokens, provider keys, `.env` contents, or secret-source paths.
- `/mcp` returns `401` without owner token before tool handling.
- Direct and Caddy-fronted responses contain one effective Go-owned Content Security Policy and the required application security headers.
- SQLite state is writable and survives stop/remove/recreate through the same `/data` volume.
- Provider HTTPS trust is verified at the app level without shell access inside the final image. Evidence keeps owner tokens and provider keys redacted.
- Publication starts from the exact caller-verified commit in a clean checkout and targets only `docker.io/tefx/resofeed`.
- The immutable `git-<verified-commit>` tag and digest reference resolve to one supplied OCI index digest with exactly the supplied `linux/amd64` and `linux/arm64` manifest digests; both platform labels equal the verified commit.
- No moving tag appears as publication, deployment, verification, or rollback identity.
- `--stage-procedure` runs only from the exact clean full commit on an attached branch, rejects a detached `HEAD` before any SSH attempt, and binds only `deploy.sh` (`100755`) and `compose.yml` (`100644`) to source SHA-256 identities.
- Procedure staging fixes the host and stack path, verifies both prior files before mutation, transfers exactly two files through target-local temporaries, and never reads remote `.env` or mutates publication, runtime, data, credential, secret, container, image, volume, Caddy, or Tailscale state.
- Procedure replacement preserves a content-addressed prior-byte backup, uses target-local atomic renames, verifies final hashes/mode, restores both prior files after a partial failure, and exposes only `--recover-procedure --backup-id <sha256>` for deliberate recovery.
- Formal deployment binds `PROCEDURE_DEPLOY_SHA256` and `PROCEDURE_COMPOSE_SHA256` to the same full verified commit and rejects mismatches before runtime configuration or Docker/OCI operations.
- Tailnet deployment targets only `tefx-mbp-personal:resofeed-caddy`, uses `docker.io/tefx/resofeed@sha256:<index-digest>`, and retains `resofeed-caddy_resofeed-data`.
- Before replacement, the procedure captures the prior repository digest and validates Compose, Caddy, Tailscale TCP/443, SQLite volume, and masked runtime-secret presence.
- Passing readiness is root `200` plus unauthenticated `/api/doctor` `401`. Failure restores the prior digest against the same named volume and proves the same readiness pair.
- Evidence contains the verified commit, immutable tag, index/platform digests, target identity, readiness outcomes, and masked secret presence only. It contains no token, credential, provider key, `.env` value, or secret-source path.
- Publication recovery records a complete orphan digest chain. Registry deletion occurs only under separate explicit authorization and is never inferred from deploy authority.
- Every maintained SSH path uses one noninteractive strict-existing-key option set with the literal FQDN as destination, effective `HostName`, and host-key lookup identity; unknown/changed keys fail before remote preparation or transfer, no trust/credential/endpoint override is accepted, and the internal short hostname has no authority.
- Authenticated staging, recovery, inspection, and deployment validate the canonical physical home-relative stack path, `resofeed-caddy` basename/project identity, regular non-symlink `deploy.sh`/`compose.yml`, exact `755`/`644` modes, and Compose shape before their respective operations.
- Repository rollback of SSH endpoint identity is one repository-only unit covering `deploy.sh`, the selected-execution adapter/developer test, Tailnet skill, deployment README, this Container guide, and the harness contract; it does not authorize or perform remote recovery or runtime mutation.