#!/usr/bin/env python3
"""Black-box acceptance harness for plfinal-black-box-acceptance.

This script uses only documented public surfaces: the ResoFeed CLI binary,
HTTP endpoints, MCP Streamable HTTP endpoint, and served browser UI HTML.
It intentionally avoids direct SQLite access and implementation imports.
"""

from __future__ import annotations

import contextlib
import http.server
import json
import os
import socket
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "bin" / "resofeed"
TOKEN = "rfeed_blackbox_owner_token_0123456789abcdef"


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class FixtureHandler(http.server.BaseHTTPRequestHandler):
    token = "plfinal-sqlite-observable-token"

    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: D401
        return

    def do_GET(self) -> None:  # noqa: N802
        base = f"http://127.0.0.1:{self.server.server_port}"  # type: ignore[attr-defined]
        if self.path == "/feed.xml":
            body = f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<rss version=\"2.0\"><channel>
<title>BB Source KeepLiteral</title><link>{base}/</link><description>fixture</description>
<item><guid>bb-item-1</guid><title>Blackbox SQLite FTS Probe</title>
<link>{base}/article.html</link><pubDate>Sat, 16 May 2026 12:00:00 GMT</pubDate>
<description>Fixture excerpt includes {self.token} and source identifier KeepLiteral.</description></item>
</channel></rss>""".encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/rss+xml")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/article.html":
            body = f"""<!doctype html><html><body><article>
<h1>Blackbox SQLite FTS Probe</h1>
<p>This article body repeats {self.token} for lexical search proof.</p>
</article></body></html>""".encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)


@dataclass
class HTTPResult:
    status: int
    headers: dict[str, str]
    body: str

    def json(self) -> Any:
        return json.loads(self.body)


def request(method: str, url: str, *, token: str | None = TOKEN, data: Any = None,
            content_type: str = "application/json", headers: dict[str, str] | None = None) -> HTTPResult:
    body: bytes | None = None
    req_headers = dict(headers or {})
    if token is not None:
        req_headers["Authorization"] = f"Bearer {token}"
    if data is not None:
        if isinstance(data, (bytes, bytearray)):
            body = bytes(data)
        else:
            body = json.dumps(data).encode()
        req_headers["Content-Type"] = content_type
    req = Request(url, data=body, headers=req_headers, method=method)
    try:
        with urlopen(req, timeout=30) as resp:
            return HTTPResult(resp.status, dict(resp.headers), resp.read().decode(errors="replace"))
    except HTTPError as e:
        return HTTPResult(e.code, dict(e.headers), e.read().decode(errors="replace"))


def wait_http(url: str, timeout_s: float = 8.0) -> None:
    deadline = time.time() + timeout_s
    last: Exception | None = None
    while time.time() < deadline:
        try:
            request("GET", url, token=None)
            return
        except (URLError, ConnectionError, TimeoutError) as exc:
            last = exc
            time.sleep(0.1)
    raise RuntimeError(f"server not reachable: {last}")


def assert_status(name: str, result: HTTPResult, expected: int) -> None:
    if result.status != expected:
        raise AssertionError(f"{name}: expected HTTP {expected}, got {result.status}: {result.body[:500]}")


def main() -> int:
    if not BIN.exists():
        raise SystemExit(f"missing binary: {BIN}")

    fixture_port = free_port()
    app_port = free_port()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", fixture_port), FixtureHandler)
    fixture_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    fixture_thread.start()
    base = f"http://127.0.0.1:{app_port}"
    fixture_feed = f"http://127.0.0.1:{fixture_port}/feed.xml"

    temp = tempfile.TemporaryDirectory(prefix="resofeed-bb-")
    db = Path(temp.name) / "resofeed.sqlite3"
    env = os.environ.copy()
    env["OPENROUTER_KEY"] = "redacted_dummy_nonempty_blackbox_key"
    proc = subprocess.Popen(
        [str(BIN), "serve", "--addr", f"127.0.0.1:{app_port}", "--public-url", base, "--db", str(db), "--owner-token", TOKEN],
        cwd=str(ROOT), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    results: dict[str, Any] = {"base_url": base, "fixture_feed": fixture_feed, "token": "<redacted>"}
    try:
        wait_http(base + "/", timeout_s=10)
        root = request("GET", base + "/", token=None)
        results["ui_root_status"] = root.status
        results["ui_root_visible_terms"] = [term for term in ["RESOFEED", "Enter owner token"] if term in root.body]
        unauth_api = request("GET", base + "/api/feed/today", token=None)
        results["unauth_api"] = {"status": unauth_api.status, "body": unauth_api.body[:300]}
        assert_status("unauth /api/feed/today", unauth_api, 401)
        unauth_mcp = request("POST", base + "/mcp", token=None, data={"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}})
        results["unauth_mcp"] = {"status": unauth_mcp.status, "body": unauth_mcp.body[:300]}
        assert_status("unauth /mcp", unauth_mcp, 401)

        lang_get = request("GET", base + "/api/runtime/language")
        assert_status("GET language", lang_get, 200)
        lang_set = request("PUT", base + "/api/runtime/language", data={"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"bb-lang-zh"})
        assert_status("PUT language zh", lang_set, 200)
        lang_replay = request("PUT", base + "/api/runtime/language", data={"language":"zh","actor_kind":"human","actor_id":"owner","idempotency_key":"bb-lang-zh"})
        assert_status("PUT language replay", lang_replay, 200)
        lang_mismatch = request("PUT", base + "/api/runtime/language", data={"language":"en","actor_kind":"human","actor_id":"owner","idempotency_key":"bb-lang-zh"})
        assert_status("PUT language fingerprint mismatch", lang_mismatch, 400)
        results["http_language"] = {"get": lang_get.json(), "set": lang_set.json(), "replay": lang_replay.json(), "mismatch": lang_mismatch.json()}

        steer = request("POST", base + "/api/steer", data={"command": fixture_feed, "actor_kind":"human", "actor_id":"owner", "idempotency_key":"bb-add-source"})
        assert_status("POST steer add source", steer, 200)
        ingest = request("POST", base + "/api/ingest", data={})
        assert_status("POST ingest", ingest, 200)
        search = request("GET", base + "/api/search?" + urlencode({"q": FixtureHandler.token}))
        assert_status("GET search", search, 200)
        items = search.json().get("items", [])
        if not items:
            raise AssertionError(f"search did not return fixture token item: {search.body[:1000]}")
        item_id = items[0]["id"]
        doctor = request("GET", base + "/api/doctor")
        assert_status("GET doctor", doctor, 200)
        results["search_doctor"] = {"item_id": item_id, "search_query": search.json().get("query"), "doctor_excerpt": doctor.body[:500]}

        delivery_body = {"actor_kind":"agent","actor_id":"briefing-agent","delivered_at":"2026-05-16T12:00:00Z","idempotency_key":"bb-delivery-1"}
        delivery = request("POST", f"{base}/api/items/{item_id}/delivery", data=delivery_body)
        assert_status("POST delivery", delivery, 200)
        delivery_replay = request("POST", f"{base}/api/items/{item_id}/delivery", data=delivery_body)
        assert_status("POST delivery replay", delivery_replay, 200)
        delivery_mismatch = request("POST", f"{base}/api/items/{item_id}/delivery", data={**delivery_body, "delivered_at":"2026-05-16T12:01:00Z"})
        assert_status("POST delivery mismatch", delivery_mismatch, 400)
        detail = request("GET", f"{base}/api/items/{item_id}")
        assert_status("GET item detail", detail, 200)
        results["http_delivery"] = {"first": delivery.json(), "replay": delivery_replay.json(), "mismatch": delivery_mismatch.json(), "detail_external_surfaced_at": detail.json()["item"].get("external_surfaced_at")}

        reprocess = request("POST", base + "/api/runtime/reprocess-library", data={"actor_kind":"human","actor_id":"owner","idempotency_key":"bb-reprocess-1"})
        assert_status("POST reprocess", reprocess, 200)
        reprocess_json = reprocess.json()
        body_keys = json.dumps(reprocess_json)
        forbidden = [k for k in ["job_id", "progress_url", "dashboard_url", "queue_id", "activity_id"] if k in body_keys]
        if forbidden:
            raise AssertionError(f"reprocess exposed forbidden durable progress/job keys: {forbidden}")
        results["http_reprocess"] = reprocess_json

        mcp_headers = {"Accept": "application/json, text/event-stream"}
        init = request("POST", base + "/mcp", data={"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"blackbox","version":"1"}}}, headers=mcp_headers)
        results["mcp_initialize"] = {"status": init.status, "body": init.body[:1000], "headers": {k:v for k,v in init.headers.items() if k.lower().startswith("mcp")}}
        if init.status != 200:
            raise AssertionError(f"MCP initialize failed: {init.status} {init.body[:500]}")
        session = init.headers.get("Mcp-Session-Id") or init.headers.get("mcp-session-id")
        if session:
            mcp_headers["Mcp-Session-Id"] = session
        request("POST", base + "/mcp", data={"jsonrpc":"2.0","method":"notifications/initialized","params":{}}, headers=mcp_headers)
        def mcp_call(call_id: int, name: str, args: dict[str, Any]) -> HTTPResult:
            return request("POST", base + "/mcp", data={"jsonrpc":"2.0","id":call_id,"method":"tools/call","params":{"name":name,"arguments":args}}, headers=mcp_headers)
        mcp_calls = {
            "get_processing_language": mcp_call(2, "get_processing_language", {}),
            "set_processing_language": mcp_call(3, "set_processing_language", {"language":"en","actor_id":"bb-agent","idempotency_key":"bb-mcp-lang-en"}),
            "search_items": mcp_call(4, "search_items", {"query": FixtureHandler.token, "limit": 5}),
            "reprocess_library": mcp_call(5, "reprocess_library", {"actor_id":"bb-agent","idempotency_key":"bb-mcp-reprocess-1"}),
            "report_delivery": mcp_call(6, "report_delivery", {"item_id": item_id, "actor_id":"bb-agent", "delivered_at":"2026-05-16T12:02:00Z", "idempotency_key":"bb-mcp-delivery-1"}),
        }
        results["mcp_tools"] = {k: {"status": v.status, "body": v.body[:1000]} for k, v in mcp_calls.items()}
        for key, val in results["mcp_tools"].items():
            if val["status"] != 200:
                raise AssertionError(f"MCP {key} did not return HTTP 200: {val}")

        print(json.dumps({"status":"PASS", "results": results}, indent=2, sort_keys=True))
        return 0
    except Exception as exc:
        results["failure"] = repr(exc)
        print(json.dumps({"status":"FAIL", "results": results}, indent=2, sort_keys=True))
        return 1
    finally:
        with contextlib.suppress(Exception):
            proc.terminate()
            proc.wait(timeout=5)
        if proc.poll() is None:
            with contextlib.suppress(Exception):
                proc.kill()
        with contextlib.suppress(Exception):
            httpd.shutdown()
        temp.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
