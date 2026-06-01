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

The image should be built with three stages:

1. Build the static web UI:

   ```text
   npm --prefix web ci
   npm --prefix web run build
   ```

2. Build the Go binary:

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

3. Copy only these runtime artifacts into the final image:

   ```text
   /out/resofeed -> /app/resofeed
   web/build -> /app/web/build
   ```

   Create `/data` separately as an empty runtime directory or mount point owned and writable by the final non-root runtime user. `/data` must never be copied from repository local state or from any build stage.

   The final image must declare this invocation contract:

   ```text
   WORKDIR /app
   ENTRYPOINT ["/app/resofeed"]
   ```

   Container command arguments are therefore ResoFeed CLI arguments. For example, `docker run <image-ref> serve ...` runs `/app/resofeed serve ...` from `/app`. The working directory matters because the server resolves the built UI at the relative path `web/build`, which must refer to `/app/web/build` in the final image.

   `/data` must be writable by the final non-root runtime user so SQLite can create and update `/data/resofeed.sqlite3`.

### Allowed build dependencies

- The Go build stage may use the Go toolchain compatible with `go.mod` (`go 1.22`) or an approved newer Go toolchain.
- Node/npm are allowed only in the web build stage, and dependency installation must use `npm ci` from `web/package-lock.json`.
- The final runtime image must not include Node/npm, a shell, a package manager, or build-only OS packages.
- Do not add extra runtime packages unless architecture approval explicitly allows them.

Do not copy `.env`, `.git`, local `data/`, `node_modules/`, test artifacts, or audit evidence into the runtime image.

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

These examples require a runnable ResoFeed container image. The command examples use `<image-ref>` as a placeholder for either:

- a local image you built and tagged yourself, such as `resofeed:latest`; or
- a fully qualified registry image for a released deployment.

Use `resofeed:latest` only when it is a local placeholder tag you created. For released deployments, use the exact registry image reference published by the release process.

Do not paste a real `OPENROUTER_KEY` into copied shell commands. Inline secrets can be saved in shell history, terminal scrollback, and process inspection output. Set `OPENROUTER_KEY` through a secret-safe host mechanism before running Docker, then pass it through with `-e OPENROUTER_KEY` and no inline value. Docker copies the value from the host environment without putting it in the command text.

One safe interactive shell pattern is:

```text
read -rsp "OpenRouter key: " OPENROUTER_KEY
export OPENROUTER_KEY
```

You can also set `OPENROUTER_KEY` through a service manager or hosting platform secret store. If the host variable is missing, ResoFeed can still start, but OpenRouter-backed summaries, steering translation, and other provider-backed operations are unavailable until the key is configured.

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

These commands use the repository `Dockerfile`.

Use Docker Buildx for release images that will be published to a registry:

```text
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t <registry>/<namespace>/resofeed:<version> \
  --push \
  .
```

`--push` is required for this multi-platform form because Docker cannot load a multi-architecture manifest directly into the local Docker image store. Use an exact, fully qualified registry image reference for release publishing; `resofeed:latest` is only a local placeholder tag.

For local `docker run` testing on the current host, build one platform and load it locally:

```text
docker buildx build \
  --platform linux/$(go env GOARCH) \
  -t resofeed:latest \
  --load \
  .
```

After the `--load` build, `resofeed:latest` is available to `docker run` on that host. Use `--push` instead when the image must be pulled from a registry by another machine.

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

Examples of deployment-layer choices:

- [Tailscale Serve/Funnel](examples/TAILSCALE_CONTAINER.md);
- Caddy;
- Cloudflare Tunnel;
- a host or platform reverse proxy.

These are examples, not core runtime dependencies.

## Verification Checklist

Before accepting the containerization work:

- Build succeeds for `linux/amd64` and `linux/arm64`.
- Runtime image does not contain `.env`, `.git`, local `data/`, or `node_modules/`.
- Final image declares `WORKDIR /app` before `ENTRYPOINT ["/app/resofeed"]` or an equivalent invocation contract that makes relative `web/build` resolve to `/app/web/build`; it also runs as non-root and can create/write `/data/resofeed.sqlite3` through the mounted `/data` volume.
- Container starts with `resofeed serve` and logs `ui: mounted`, `api: enabled`, and `mcp: /mcp`.
- `GET /` proves the generated SvelteKit UI is served: the HTML must include at least one generated asset reference containing `_app/immutable/`, and at least one extracted referenced asset under `_app/immutable/` must return HTTP `200`. The fallback owner-token HTML alone is insufficient evidence because fallback HTML can pass even when built assets are missing.
- `/api/doctor` returns `401` without owner token and succeeds with the token.
- `/mcp` returns `401` without owner token before tool handling.
- SQLite state is writable and survives stop/remove/recreate through the same `/data` volume. Gate evidence must show first startup with an empty named volume creates `/data/resofeed.sqlite3`, then a replacement container using that same volume can start and pass `/api/doctor` with the persisted owner-token verifier.
- Provider HTTPS trust is verified at the app level without shell access inside the final image: run the container with a valid `OPENROUTER_KEY` supplied through the safe `-e OPENROUTER_KEY` host environment pass-through, then from the host call `GET /api/runtime/openrouter-models` with `Authorization: Bearer <OWNER_TOKEN>`. Passing proof is HTTP `200` with the documented JSON model-list shape. `x509: certificate signed by unknown authority` or any TLS trust failure is a failure. Keep the owner token and provider key redacted in evidence.
