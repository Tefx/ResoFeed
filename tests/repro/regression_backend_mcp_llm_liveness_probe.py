"""Black-box liveness probe for backend/API/MCP/LLM regression closure.

This probe intentionally uses only the documented `bin/resofeed serve` process,
real HTTP requests, and real `/mcp` JSON-RPC calls. It seeds a temporary SQLite
database with a minimal full-extraction fixture so MCP `read_item` can be tested
without relying on live RSS or OpenRouter availability.
"""

from __future__ import annotations

import contextlib
import json
import os
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "bin" / "resofeed"
ARTIFACTS = ROOT / ".audit-artifacts" / "regression_backend_mcp_llm_liveness_probe"
TOKEN = "rfeed_liveness_probe_owner_token_0123456789ABCDEF"
DUMMY_OPENROUTER_KEY = "dummy_openrouter_key_for_stub_runtime_not_secret"
ITEM_ID = "item_full_detail_regression_probe"
FULL_TEXT_MARKER = "FULL EXTRACTION DETAIL TEXT -- REG-04 black-box proof"


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def http_req(
    method: str,
    url: str,
    *,
    token: str | None = None,
    body: bytes | None = None,
    content_type: str | None = None,
    headers: dict[str, str] | None = None,
) -> dict:
    req_headers = dict(headers or {})
    if token is not None:
        req_headers["Authorization"] = f"Bearer {token}"
    if content_type is not None:
        req_headers["Content-Type"] = content_type
    request = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return {
                "status": response.status,
                "content_type": response.headers.get("Content-Type", ""),
                "body": response.read().decode("utf-8", "replace"),
            }
    except urllib.error.HTTPError as exc:
        return {
            "status": exc.code,
            "content_type": exc.headers.get("Content-Type", ""),
            "body": exc.read().decode("utf-8", "replace"),
        }


def mcp_call(base: str, method: str, params: dict | None, request_id: int) -> dict:
    payload = {"jsonrpc": "2.0", "id": request_id, "method": method}
    if params is not None:
        payload["params"] = params
    return http_req(
        "POST",
        base + "/mcp",
        token=TOKEN,
        content_type="application/json",
        headers={"Accept": "application/json, text/event-stream"},
        body=json.dumps(payload).encode("utf-8"),
    )


def wait_for_port(host: str, port: int, proc: subprocess.Popen[str]) -> bool:
    deadline = time.time() + 8
    while time.time() < deadline:
        if proc.poll() is not None:
            return False
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            sock.settimeout(0.25)
            if sock.connect_ex((host, port)) == 0:
                return True
        time.sleep(0.1)
    return False


def migrate_db(db_path: Path, port: int, base: str, env: dict[str, str]) -> dict:
    cmd = [
        str(BIN),
        "serve",
        "--addr",
        f"127.0.0.1:{port}",
        "--public-url",
        base,
        "--db",
        str(db_path),
        "--owner-token",
        TOKEN,
    ]
    stdout = ARTIFACTS / "migration.stdout.log"
    stderr = ARTIFACTS / "migration.stderr.log"
    with stdout.open("w", encoding="utf-8") as out, stderr.open("w", encoding="utf-8") as err:
        proc = subprocess.Popen(cmd, cwd=ROOT, stdout=out, stderr=err, text=True, env=env)
        ready = wait_for_port("127.0.0.1", port, proc)
        with contextlib.suppress(Exception):
            proc.terminate()
            proc.wait(timeout=5)
        with contextlib.suppress(Exception):
            proc.kill()
    return {"command": redact_command(cmd), "ready": ready, "stdout": str(stdout.relative_to(ROOT)), "stderr": str(stderr.relative_to(ROOT))}


def seed_fixture(db_path: Path) -> None:
    now = "2026-05-12T12:00:00Z"
    full_text = FULL_TEXT_MARKER + "\n" + ("Detailed extracted paragraph for agent handoff. " * 24)
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            """
            insert into sources(id, url, title, created_at, last_fetch_at, last_fetch_status, is_active, revision)
            values (?, ?, ?, ?, ?, ?, 1, 1)
            """,
            ("src_full_regression_probe", "https://example.test/full-feed.xml", "Full Extraction Fixture", now, now, "ok"),
        )
        con.execute(
            """
            insert into items(
              id, source_id, source_url, url, canonical_url, title, feed_excerpt, extracted_text,
              summary, core_insight, value_tier, published_at, first_seen_at, extraction_status,
              model_status, story_key, duplicate_of_item_id
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ITEM_ID,
                "src_full_regression_probe",
                "https://example.test/full-feed.xml",
                "https://example.test/full-article",
                "https://example.test/full-article",
                "Full extraction regression fixture",
                "Short feed excerpt for fallback visibility.",
                full_text,
                "Deterministic fallback summary; not a live model success.",
                "Full extraction text should survive through MCP read_item.",
                "high",
                now,
                now,
                "full",
                "summary_unavailable",
                None,
                None,
            ),
        )
        con.commit()
    finally:
        con.close()


def redact_command(cmd: list[str]) -> str:
    rendered: list[str] = []
    skip_next = False
    for idx, part in enumerate(cmd):
        if skip_next:
            skip_next = False
            continue
        if part == "--owner-token" and idx + 1 < len(cmd):
            rendered.extend([part, "<redacted-owner-token>"])
            skip_next = True
        else:
            rendered.append(part)
    return " ".join(rendered)


def parse_json_response(name: str, response: dict, failures: list[str]) -> dict:
    try:
        return json.loads(response["body"])
    except Exception as exc:  # pragma: no cover - diagnostic path
        failures.append(f"{name}: response was not JSON: {exc}; body={response['body'][:300]!r}")
        return {}


def main() -> int:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    observations: dict = {
        "artifacts": str(ARTIFACTS.relative_to(ROOT)),
        "external_openrouter_env_present": bool(os.environ.get("OPENROUTER_KEY")),
    }
    if not BIN.exists():
        failures.append(f"missing binary: {BIN.relative_to(ROOT)}; run `go build -o ./bin/resofeed ./cmd/resofeed`")
        return finish(failures, observations)

    runtime_env = os.environ.copy()
    if not runtime_env.get("OPENROUTER_KEY"):
        runtime_env["OPENROUTER_KEY"] = DUMMY_OPENROUTER_KEY
        observations["external_live_probe_status"] = "external_live_probe_unavailable"
        observations["external_live_probe_missing_prerequisite"] = "OPENROUTER_KEY was absent in the auditor environment"
        observations["stub_runtime_openrouter_key"] = "<non-secret dummy value injected only to satisfy startup validation>"
    else:
        observations["external_live_probe_status"] = "credential_present_but_not_consumed_by_this_deterministic_probe"

    port = free_port()
    base = f"http://127.0.0.1:{port}"
    db_dir = Path(tempfile.mkdtemp(prefix="db-", dir=str(ARTIFACTS)))
    db_path = db_dir / "resofeed.sqlite3"
    observations["db_path"] = str(db_path.relative_to(ROOT))

    migration = migrate_db(db_path, port, base, runtime_env)
    observations["migration"] = migration
    if not migration["ready"] or not db_path.exists():
        failures.append("documented binary did not start/bind long enough to migrate the temporary SQLite DB")
        return finish(failures, observations)

    seed_fixture(db_path)

    cmd = [
        str(BIN),
        "serve",
        "--addr",
        f"127.0.0.1:{port}",
        "--public-url",
        base,
        "--db",
        str(db_path),
        "--owner-token",
        TOKEN,
    ]
    observations["serve_command"] = redact_command(cmd)
    stdout = ARTIFACTS / "server.stdout.log"
    stderr = ARTIFACTS / "server.stderr.log"
    with stdout.open("w", encoding="utf-8") as out, stderr.open("w", encoding="utf-8") as err:
        proc = subprocess.Popen(cmd, cwd=ROOT, stdout=out, stderr=err, text=True, env=runtime_env)
        try:
            port_ready = wait_for_port("127.0.0.1", port, proc)
            observations["port_bound"] = port_ready
            if not port_ready:
                failures.append("resofeed serve did not bind its documented HTTP/MCP port")
                observations["server_exit_code"] = proc.poll()
                return finish(failures, observations)

            doctor = http_req("GET", base + "/api/doctor", token=TOKEN)
            (ARTIFACTS / "doctor.txt").write_text(doctor["body"], encoding="utf-8")
            observations["doctor"] = {
                "status": doctor["status"],
                "content_type": doctor["content_type"],
                "artifact": str((ARTIFACTS / "doctor.txt").relative_to(ROOT)),
                "contains_raw_secret": DUMMY_OPENROUTER_KEY in doctor["body"] or TOKEN in doctor["body"],
            }
            if doctor["status"] != 200 or "text/plain" not in doctor["content_type"]:
                failures.append(f"/api/doctor failed: HTTP {doctor['status']} content-type={doctor['content_type']!r}")
            if observations["doctor"]["contains_raw_secret"]:
                failures.append("/api/doctor leaked the dummy OpenRouter key or owner token")

            feed = http_req("GET", base + "/api/feed/today?limit=10", token=TOKEN)
            (ARTIFACTS / "feed_today.json").write_text(feed["body"], encoding="utf-8")
            feed_json = parse_json_response("feed", feed, failures)
            observations["feed"] = {"status": feed["status"], "artifact": str((ARTIFACTS / "feed_today.json").relative_to(ROOT))}
            feed_items = feed_json.get("items") if isinstance(feed_json, dict) else None
            if feed["status"] != 200 or not isinstance(feed_items, list):
                failures.append(f"/api/feed/today did not return an items array: HTTP {feed['status']}")
            else:
                fixture_summary = next((item for item in feed_items if item.get("id") == ITEM_ID), None)
                observations["fixture_in_feed"] = bool(fixture_summary)
                if not fixture_summary:
                    failures.append("seeded full-extraction item was not visible in /api/feed/today")
                else:
                    observations["fixture_model_status"] = fixture_summary.get("model_status")
                    observations["fixture_extraction_status"] = fixture_summary.get("extraction_status")
                    if fixture_summary.get("model_status") == "ok":
                        failures.append("fallback seeded summary was counted as live model success (model_status=ok)")

            init = mcp_call(
                base,
                "initialize",
                {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "blind-tester-liveness-probe", "version": "1.0"},
                },
                1,
            )
            observations["mcp_initialize"] = {"status": init["status"], "body_head": init["body"][:240]}
            if init["status"] != 200:
                failures.append(f"MCP initialize returned HTTP {init['status']}")

            read_item = mcp_call(base, "tools/call", {"name": "read_item", "arguments": {"item_id": ITEM_ID}}, 2)
            (ARTIFACTS / "mcp_read_item.json").write_text(read_item["body"], encoding="utf-8")
            observations["mcp_read_item"] = {
                "status": read_item["status"],
                "artifact": str((ARTIFACTS / "mcp_read_item.json").relative_to(ROOT)),
            }
            read_json = parse_json_response("mcp read_item", read_item, failures)
            text_payload = ""
            with contextlib.suppress(Exception):
                text_payload = read_json["result"]["content"][0]["text"]
            if read_item["status"] != 200 or FULL_TEXT_MARKER not in text_payload:
                failures.append("MCP read_item did not return non-empty full extracted_text fixture detail")
            observations["mcp_read_item_contains_full_text_marker"] = FULL_TEXT_MARKER in text_payload

            resources = mcp_call(base, "resources/read", {"uri": "resofeed://sources"}, 3)
            (ARTIFACTS / "mcp_sources_resource.json").write_text(resources["body"], encoding="utf-8")
            observations["mcp_sources_resource"] = {
                "status": resources["status"],
                "artifact": str((ARTIFACTS / "mcp_sources_resource.json").relative_to(ROOT)),
            }
            if resources["status"] != 200:
                failures.append(f"MCP sources resource returned HTTP {resources['status']}")
        finally:
            with contextlib.suppress(Exception):
                proc.terminate()
                proc.wait(timeout=5)
            with contextlib.suppress(Exception):
                proc.kill()

    observations["server_stdout"] = str(stdout.relative_to(ROOT))
    observations["server_stderr"] = str(stderr.relative_to(ROOT))
    return finish(failures, observations)


def finish(failures: list[str], observations: dict) -> int:
    report = {"status": "FAIL" if failures else "PASS", "failures": failures, "observations": observations}
    report_path = ARTIFACTS / "report.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
