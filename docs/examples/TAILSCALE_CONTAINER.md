# Example: Tailscale Deployment for the ResoFeed Container

Status: deployment example only.

This document is not part of the core ResoFeed runtime contract. ResoFeed does not depend on Tailscale. This example shows one small way to place HTTPS and private-network access in front of the container without adding a reverse proxy container.

Use this when ResoFeed should be reachable only from devices in your Tailnet, or when you want a simple HTTPS name before deciding on a public domain and reverse proxy.

## What Tailscale Owns

Tailscale owns:

- private network reachability;
- the `.ts.net` MagicDNS name;
- HTTPS certificate provisioning for the Tailscale name;
- the host-level `tailscale serve` forwarding rule.

ResoFeed still owns:

- UI, JSON HTTP, and MCP on one local HTTP listener;
- owner-token authorization;
- SQLite state under the container volume;
- OpenRouter/RSS behavior.

## Minimal Topology

```text
Browser or MCP client on Tailnet
        |
        | https://<device>.<tailnet>.ts.net
        v
Tailscale Serve on host
        |
        | http://127.0.0.1:8080
        v
ResoFeed container
        |
        v
/data/resofeed.sqlite3 volume
```

## Prerequisites

- Tailscale is installed and authenticated on the host.
- MagicDNS is enabled for the Tailnet.
- HTTPS certificates are enabled in the Tailscale admin console.
- Docker can run the ResoFeed image on the host.

These commands require a runnable ResoFeed container image. Use `resofeed:latest` only for a local image you built and tagged yourself with the repository `Dockerfile`. For released deployments, use the fully qualified registry image published by the release process.

Use the actual MagicDNS HTTPS name assigned by Tailscale for `https://<device>.<tailnet>.ts.net`; it is not an arbitrary hostname.

## Start ResoFeed Locally Only

Publish the container only to host loopback. This keeps ResoFeed off the LAN and leaves access to Tailscale Serve.

The command example uses `<image-ref>` as a placeholder. Use `resofeed:latest` only when it is a local image you built and tagged yourself. For released deployments, use the fully qualified registry image published by the release process.

Do not paste a real `OPENROUTER_KEY` into copied shell commands. Set `OPENROUTER_KEY` through a secret-safe host mechanism first, then pass it through with `-e OPENROUTER_KEY` and no inline value. The [core container guide](../CONTAINER.md) has the full safe pattern. If the host variable is missing, ResoFeed can still start, but OpenRouter-backed operations are unavailable until the key is configured.

```text
docker run -d \
  --name resofeed \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v resofeed-data:/data \
  -e OPENROUTER_KEY \
  <image-ref> \
  serve \
  --addr 0.0.0.0:8080 \
  --public-url https://<device>.<tailnet>.ts.net \
  --db /data/resofeed.sqlite3
```

If you want an explicit owner token, add it only after accepting that CLI arguments may be exposed through shell history, Docker metadata, `docker inspect`, logs, or process listings. The [core container guide](../CONTAINER.md#owner-token-behavior-in-containers) has the full warning.

```text
--owner-token rfeed_<at-least-32-visible-non-whitespace-characters>
```

If you omit `--owner-token`, read the generated token from container stdout:

```text
docker logs resofeed
```

## Enable Tailscale HTTPS Forwarding

Run this on the host before changing Serve configuration:

```text
tailscale serve status
```

Review the current Serve rules before applying the next command. `tailscale serve` is host-level configuration, not ResoFeed configuration, and applying a new rule may change, replace, or conflict with existing Serve routes on the same host.

The following command serves ResoFeed persistently in the background on Tailnet HTTPS port `443` and forwards traffic to the loopback-only container port:

```text
tailscale serve --bg --https=443 http://127.0.0.1:8080
```

Inspect persistent rules with `tailscale serve status`. To disable this rule, use the matching `off` form:

```text
tailscale serve --https=443 http://127.0.0.1:8080 off
```

Use `tailscale serve reset` only when intentionally clearing all Serve configuration. See the [Tailscale Serve documentation](https://tailscale.com/kb/1242/tailscale-serve) for current command details.

Then open:

```text
https://<device>.<tailnet>.ts.net
```

MCP clients inside the Tailnet should use:

```json
{
  "type": "streamable-http",
  "url": "https://<device>.<tailnet>.ts.net/mcp",
  "headers": {
    "Authorization": "Bearer <OWNER_TOKEN>"
  }
}
```

## Access Boundary

Tailscale Serve is private to the Tailnet. Public cloud agents that are not on your Tailnet cannot reach this URL.

If public access becomes necessary, evaluate Tailscale Funnel or a conventional HTTPS reverse proxy. That is a deployment-layer change; ResoFeed still only needs the correct `--public-url`.

## If Using Tailscale Funnel Later

Tailscale Funnel exposes the service publicly through Tailscale's HTTPS edge. Use it only when you intentionally want public reachability.

When switching from private Serve to public Funnel, keep ResoFeed's local container shape the same and update `--public-url` if the public URL differs.

## Verification

- `https://<device>.<tailnet>.ts.net` loads the owner-token prompt.
- `https://<device>.<tailnet>.ts.net/api/doctor` returns `401` without `Authorization`.
- `https://<device>.<tailnet>.ts.net/mcp` returns `401` without `Authorization` before any MCP tool handling.
- The same `/mcp` URL works from an MCP client that is also connected to the Tailnet.
- Restarting the container preserves data through `resofeed-data:/data`.
