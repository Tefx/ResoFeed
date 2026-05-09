"""Black-box acceptance probe for ResoFeed public owner/agent surfaces.

Uses only the documented `resofeed serve` command and public HTTP/MCP URLs.
Writes DOM/output artifacts under `.audit-artifacts/end_to_end_blackbox`.
"""

from __future__ import annotations

import contextlib
import html.parser
import json
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / ".audit-artifacts" / "end_to_end_blackbox"
BIN = ROOT / "bin" / "resofeed"
TOKEN = "rfeed_blackbox_owner_token_0123456789ABCDEFG"


class TextExtractor(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.interactive = 0
        self._skip = 0

    def handle_starttag(self, tag: str, attrs):
        if tag in {"script", "style"}:
            self._skip += 1
        if tag in {"button", "input", "a", "select", "textarea"}:
            self.interactive += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self._skip:
            self._skip -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip and data.strip():
            self.parts.append(" ".join(data.split()))

    @property
    def text(self) -> str:
        return "\n".join(self.parts)


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def req(method: str, url: str, *, token: str | None = None, body: bytes | None = None,
        content_type: str | None = None, headers: dict[str, str] | None = None) -> dict:
    h = dict(headers or {})
    if token is not None:
        h["Authorization"] = f"Bearer {token}"
    if content_type is not None:
        h["Content-Type"] = content_type
    request = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return {"status": response.status, "content_type": response.headers.get("Content-Type", ""), "body": response.read().decode("utf-8", "replace")}
    except urllib.error.HTTPError as exc:
        return {"status": exc.code, "content_type": exc.headers.get("Content-Type", ""), "body": exc.read().decode("utf-8", "replace")}


def as_json(name: str, response: dict, failures: list[str]) -> dict:
    try:
        return json.loads(response["body"])
    except Exception as exc:
        failures.append(f"{name}: non-JSON response: {exc}; body={response['body'][:240]!r}")
        return {}


def check(ok: bool, failures: list[str], message: str) -> None:
    if not ok:
        failures.append(message)


def wait_ready(base: str, proc: subprocess.Popen[str]) -> bool:
    deadline = time.time() + 8
    while time.time() < deadline:
        if proc.poll() is not None:
            return False
        try:
            if req("GET", base + "/")["status"] == 200:
                return True
        except Exception:
            time.sleep(0.1)
    return False


def finish(failures: list[str], observations: dict) -> int:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    report = {"status": "FAIL" if failures else "PASS", "failures": failures, "observations": observations}
    (ARTIFACTS / "report.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if failures else 0


def main() -> int:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    obs: dict = {"artifacts": str(ARTIFACTS.relative_to(ROOT))}
    if not BIN.exists():
        return finish([f"missing documented binary {BIN}"], obs)

    port = free_port()
    base = f"http://127.0.0.1:{port}"
    dbdir = Path(tempfile.mkdtemp(prefix="db-", dir=str(ARTIFACTS)))
    cmd = [str(BIN), "serve", "--addr", f"127.0.0.1:{port}", "--public-url", base, "--db", str(dbdir / "resofeed.sqlite3"), "--gemini-api-key", "blackbox-fake-gemini-key", "--gemini-model", "gemini-2.5-flash", "--owner-token", TOKEN]
    obs["serve_command"] = " ".join(cmd)
    with (ARTIFACTS / "server.stdout.log").open("w") as out, (ARTIFACTS / "server.stderr.log").open("w") as err:
        proc = subprocess.Popen(cmd, cwd=ROOT, stdout=out, stderr=err, text=True)
        try:
            ready = wait_ready(base, proc)
            obs["server_ready"] = ready
            check(ready, failures, "resofeed serve did not bind and serve / within 8 seconds")
            if not ready:
                obs["server_exit_code"] = proc.poll()
                return finish(failures, obs)

            ui = req("GET", base + "/")
            (ARTIFACTS / "ui-root.html").write_text(ui["body"], encoding="utf-8")
            parser = TextExtractor(); parser.feed(ui["body"])
            (ARTIFACTS / "ui-root-visible-text.txt").write_text(parser.text, encoding="utf-8")
            obs["ui"] = {"status": ui["status"], "content_type": ui["content_type"], "interactive": parser.interactive, "text_head": parser.text[:500]}
            check(ui["status"] == 200, failures, f"UI / returned {ui['status']}")
            check("text/html" in ui["content_type"], failures, f"UI / content-type was {ui['content_type']!r}")
            check(len(parser.text.strip()) > 20, failures, "UI / had no meaningful visible text")
            check(parser.interactive > 0, failures, "UI / had zero interactive elements")
            check("Enter owner token" in parser.text, failures, "owner-token prompt text missing from first-open UI")
            check("RESOFEED" in parser.text, failures, "RESOFEED product label missing from first-open UI")

            unauth = req("GET", base + "/api/feed/today")
            obs["unauth_feed"] = unauth
            check(unauth["status"] == 401, failures, f"unauthenticated /api/feed/today returned {unauth['status']}, expected 401")
            check(as_json("unauth feed", unauth, failures).get("error", {}).get("code") == "unauthorized", failures, "unauth API did not return unauthorized code")

            feed = req("GET", base + "/api/feed/today?limit=20", token=TOKEN)
            feed_json = as_json("feed", feed, failures); obs["feed"] = feed
            check(feed["status"] == 200 and isinstance(feed_json.get("items"), list), failures, f"authorized feed contract failed: {feed['status']} {feed['body'][:200]!r}")

            search = req("GET", base + "/api/search?q=sqlite&source=example&from=2026-01-01&to=2026-12-31&resonated=true", token=TOKEN)
            search_json = as_json("search", search, failures); obs["search"] = search
            check(search["status"] == 200, failures, f"authorized search returned {search['status']}")
            check(search_json.get("query", {}).get("q") == "sqlite" and search_json.get("query", {}).get("resonated") is True, failures, "search query echo did not match documented filters")

            doctor = req("GET", base + "/api/doctor", token=TOKEN)
            (ARTIFACTS / "doctor.txt").write_text(doctor["body"], encoding="utf-8"); obs["doctor"] = doctor
            check(doctor["status"] == 200 and "text/plain" in doctor["content_type"] and doctor["body"].strip(), failures, f"doctor contract failed: {doctor}")

            sources = req("GET", base + "/api/sources", token=TOKEN)
            sources_json = as_json("sources", sources, failures); obs["sources_initial"] = sources
            check(sources["status"] == 200 and isinstance(sources_json.get("sources"), list), failures, f"sources contract failed: {sources['status']} {sources['body'][:200]!r}")

            bad_feed = req("GET", base + "/api/feed/today?surprise=1", token=TOKEN)
            dup_search = req("GET", base + "/api/search?q=a&q=b", token=TOKEN)
            obs["query_validation"] = {"unknown_feed": bad_feed, "duplicate_search": dup_search}
            check(bad_feed["status"] == 400, failures, f"unknown feed query returned {bad_feed['status']}, expected 400")
            check(dup_search["status"] == 400, failures, f"duplicate search query returned {dup_search['status']}, expected 400")

            opml = b'<?xml version="1.0"?><opml version="2.0"><body><outline text="Folder"><outline type="rss" text="Example" title="Example" xmlUrl="https://example.com/feed.xml" /></outline></body></opml>'
            opml_resp = req("POST", base + "/api/sources/import-opml", token=TOKEN, content_type="application/xml", body=opml)
            opml_json = as_json("opml", opml_resp, failures); obs["opml_import"] = opml_resp
            check(opml_resp["status"] == 200 and opml_json.get("folders_flattened") is True, failures, f"OPML flatten import failed: {opml_resp['status']} {opml_resp['body'][:240]!r}")

            export = req("GET", base + "/api/state/export", token=TOKEN)
            (ARTIFACTS / "state-export.json").write_text(export["body"], encoding="utf-8")
            bundle = as_json("state export", export, failures); obs["state_export"] = export
            check(export["status"] == 200 and bundle.get("schema_version") == "resofeed.state.v1", failures, "state export did not return resofeed.state.v1 bundle")
            for key in ["sources", "steer_rules", "resonated_items"]:
                check(isinstance(bundle.get(key), list), failures, f"state export missing {key} array")
            check("owner_token" not in json.dumps(bundle) and "sha256" not in json.dumps(bundle), failures, "state export leaked runtime credential metadata")
            import_resp = req("POST", base + "/api/state/import", token=TOKEN, content_type="application/json", body=json.dumps(bundle).encode())
            obs["state_import_roundtrip"] = import_resp
            check(import_resp["status"] == 200 and isinstance(as_json("state import", import_resp, failures).get("restored"), dict), failures, f"state import roundtrip failed: {import_resp['status']} {import_resp['body'][:240]!r}")
            invalid = dict(bundle); invalid["unexpected"] = True
            invalid_resp = req("POST", base + "/api/state/import", token=TOKEN, content_type="application/json", body=json.dumps(invalid).encode())
            obs["invalid_state_import"] = invalid_resp
            check(invalid_resp["status"] == 400, failures, f"invalid state bundle returned {invalid_resp['status']}, expected 400")

            if feed_json.get("items"):
                item_id = feed_json["items"][0].get("id")
                detail = req("GET", base + f"/api/items/{item_id}", token=TOKEN); obs["item_detail"] = detail
                check(detail["status"] == 200, failures, f"visible item detail returned {detail['status']}")
                inspect_body = json.dumps({"actor_kind":"human","actor_id":"owner","idempotency_key":"blackbox-inspect-001"}).encode()
                resonate_body = json.dumps({"resonated":True,"actor_kind":"human","actor_id":"owner","idempotency_key":"blackbox-resonate-001"}).encode()
                inspect = req("POST", base + f"/api/items/{item_id}/inspect", token=TOKEN, content_type="application/json", body=inspect_body); obs["inspect"] = inspect
                resonate = req("POST", base + f"/api/items/{item_id}/resonance", token=TOKEN, content_type="application/json", body=resonate_body); obs["resonate"] = resonate
                check(inspect["status"] == 200, failures, f"inspect visible item returned {inspect['status']}")
                check(resonate["status"] == 200, failures, f"resonate visible item returned {resonate['status']}")
            else:
                obs["item_mutations"] = "NOT TESTED: no feed items exposed during bounded black-box run"

            mcp_unauth = req("POST", base + "/mcp", content_type="application/json", body=b"{}")
            obs["mcp_unauth"] = mcp_unauth
            check(mcp_unauth["status"] == 401, failures, f"unauthenticated /mcp returned {mcp_unauth['status']}, expected 401")
            init_body = json.dumps({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"blackbox-auditor","version":"1.0"}}}).encode()
            mcp_init = req("POST", base + "/mcp", token=TOKEN, content_type="application/json", headers={"Accept":"application/json, text/event-stream"}, body=init_body)
            obs["mcp_authorized_initialize"] = mcp_init
            check(mcp_init["status"] in {200, 202}, failures, f"authorized MCP initialize returned HTTP {mcp_init['status']}, expected 200/202")
        finally:
            with contextlib.suppress(Exception):
                proc.terminate(); proc.wait(timeout=5)
            with contextlib.suppress(Exception):
                proc.kill()
    return finish(failures, obs)


if __name__ == "__main__":
    sys.exit(main())
