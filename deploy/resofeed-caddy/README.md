# ResoFeed on a custom domain with Tailnet-only HTTPS

This deployment runs ResoFeed behind Caddy on a Mac that is already connected to Tailscale. Caddy gets a real HTTPS certificate for the domain configured in `.env` through Cloudflare DNS-01. Caddy publishes HTTPS only on host loopback, and Tailscale Serve forwards Tailnet TCP/443 to that local HTTPS listener.

## Topology

```text
https://${RESOFEED_DOMAIN}
        ↓ DNS A record, DNS-only
${TAILSCALE_IP}  (Mac Tailscale IP)
        ↓ Tailscale Serve TCP :443
127.0.0.1:${CADDY_LOCAL_HTTPS_PORT}
        ↓ host loopback port
resofeed-caddy container
        ↓ Docker private network
resofeed container on :8080
```

## Cloudflare DNS

Create this DNS record in the Cloudflare zone that owns `RESOFEED_DOMAIN`.

Default `.env.example` values use:

```text
RESOFEED_DOMAIN=resofeed.tefx.one
```

Run `./deploy.sh` first, then create or update this record with the Tailscale IP printed by the script:

```text
Type: A
Name: resofeed
Content: <tailscale-ip-printed-by-deploy.sh>
Proxy status: DNS only / gray cloud
TTL: Auto
```

Do not enable the orange-cloud proxy for this record. Cloudflare cannot proxy to a Tailscale `100.x.y.z` address, and enabling proxying would change the intended private access boundary.

## Cloudflare API token

Create a Cloudflare API token with the smallest useful scope:

```text
Zone / Zone / Read
Zone / DNS / Edit
```

Restrict the token to the specific zone:

```text
Include / Specific zone / tefx.one
```

The token is used only by Caddy to create and clean up `_acme-challenge.<RESOFEED_DOMAIN>` TXT records for DNS-01 certificate validation.

## First-time setup

From this directory:

```bash
cp .env.example .env
```

Edit `.env` and set:

```bash
CADDY_LOCAL_HTTPS_PORT=8443
RESOFEED_DOMAIN=resofeed.tefx.one
CF_API_TOKEN=...
OPENROUTER_KEY=...
```

Do not add `TAILSCALE_IP` unless automatic detection is wrong. `deploy.sh` detects it with `tailscale ip -4`, writes it back to `.env`, and prints it in the DNS guidance block.

`OPENROUTER_KEY` may stay empty if model-backed features are not needed yet.

Start the stack:

```bash
docker compose --env-file .env up -d --build
```

Then configure Tailscale Serve to forward Tailnet TCP/443 to the local Caddy HTTPS listener:

```bash
tailscale serve status
tailscale serve --bg --tcp=443 tcp://127.0.0.1:${CADDY_LOCAL_HTTPS_PORT}
```

If port `443` is already used in `tailscale serve status`, do not overwrite it until you intentionally decide which service should own Tailnet HTTPS on this node.

Read the first generated ResoFeed owner token:

```bash
docker logs resofeed
```

Open from a Tailnet-connected device:

```bash
open "https://${RESOFEED_DOMAIN}"
```

## Deploy/start script

From this directory, run:

```bash
./deploy.sh
```

If `.env` does not exist, the script creates it from `.env.example`, fills `TAILSCALE_IP` from `tailscale ip -4` when available, and stops so you can add `CF_API_TOKEN` and optional `OPENROUTER_KEY`. The local `.env` file is ignored by git and should not be committed.

To reset the ResoFeed owner token hash and restart ResoFeed so a new plaintext token is generated:

```bash
./deploy.sh --reset-token
```

The script prints an owner token only when ResoFeed generated it during that script run/reset flow. To inspect logs manually:

```bash
docker logs resofeed
docker logs resofeed-caddy
```

## Move to another Mac

Use this order when moving the same domain to another Mac. The safest sequence is: prepare and start the new machine first, then switch DNS, then stop the old machine after verification.

1. On the new Mac, install and authenticate Tailscale and Docker/OrbStack:

   ```bash
   tailscale status
   docker version
   ```

2. Confirm the new Mac has a Tailscale IP. You do not need to copy it manually unless you want to override detection:

   ```bash
   tailscale ip -4
   ```

3. Copy this `deploy/resofeed-caddy/` directory to the new Mac and create `.env`:

   ```bash
   cd deploy/resofeed-caddy
   cp .env.example .env
   ```

4. Edit `.env` for the new Mac:

   ```bash
   CADDY_LOCAL_HTTPS_PORT=8443
   RESOFEED_DOMAIN=resofeed.tefx.one
   CF_API_TOKEN=<cloudflare-dns01-token>
   OPENROUTER_KEY=<optional-openrouter-key>
   ```

   Do not add `TAILSCALE_IP` unless automatic detection is wrong. If needed, add `TAILSCALE_IP=<new-mac-tailscale-ip>` manually.

5. Start the new Mac deployment before changing DNS:

   ```bash
   ./deploy.sh
   ```

   This verifies Docker, Caddy, and Tailscale Serve on the new host and prints the DNS record target plus a generated owner token when one is created.

6. In Cloudflare, switch the DNS record only after the new deployment starts cleanly:

   ```text
   Type: A
   Name: resofeed
   Content: <new-mac-tailscale-ip>
   Proxy status: DNS only / gray cloud
   ```

7. Wait for DNS to resolve to the new Mac:

   ```bash
   dig +short resofeed.tefx.one
   ```

8. Verify the new endpoint:

   ```bash
   curl -I "https://${RESOFEED_DOMAIN}"
   curl -i "https://${RESOFEED_DOMAIN}/api/doctor"
   ```

   `/` should return `200`. `/api/doctor` should return `401` without an owner token.

9. Stop the old Mac only after the new endpoint is verified:

   ```bash
   ./stop.sh
   ```

   Use `./stop.sh --clear-data` on the old Mac only when you are certain the old SQLite state and Caddy cache are no longer needed.

If you need to preserve ResoFeed data across machines, export/import portable state or back up the old Docker volume/SQLite database before clearing the old machine.

## Verification

```bash
curl -I "https://${RESOFEED_DOMAIN}"
curl -i "https://${RESOFEED_DOMAIN}/api/doctor"
```

`/api/doctor` should return `401` without an owner token.

For MCP clients inside the Tailnet:

```json
{
  "type": "streamable-http",
  "url": "https://<RESOFEED_DOMAIN>/mcp",
  "headers": {
    "Authorization": "Bearer <OWNER_TOKEN>"
  }
}
```

## Update ResoFeed

```bash
docker compose --env-file .env pull resofeed
docker compose --env-file .env up -d --build
```

## Stop

```bash
./stop.sh
```

The stop script disables host-level Tailscale Serve TCP/443 when `tailscale` is installed, then stops the Docker Compose stack. Persistent state remains in Docker volumes by default:

- `resofeed-data`
- `caddy-data`
- `caddy-config`

To stop the stack and remove deployment-owned Compose volumes:

```bash
./stop.sh --clear-data
```

This requires typing `CLEAR RESOFEED DATA` interactively because it removes ResoFeed SQLite data and Caddy certificate/config cache. For non-interactive automation, pass `--yes`:

```bash
./stop.sh --clear-data --yes
```
