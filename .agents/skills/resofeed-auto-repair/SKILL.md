---
name: resofeed-auto-repair
description: Orchestrates the complete lifecycle of discovering, debugging, fixing, deploying, and verifying failed ResoFeed items on the remote Tailnet instance.
---

# Skill: resofeed-auto-repair

## Description
Orchestrates the complete lifecycle of discovering, debugging, fixing, deploying, and verifying failed ResoFeed items on the remote Tailnet instance. The loop continues until failures are resolved, followed by a formal version publish and a Telegram notification in Chinese.

## Trigger
Use this skill when the user asks to "check and fix failed ResoFeed items", "debug and deploy ResoFeed failures", or explicitly references `[REQUIRES_SKILL: resofeed-auto-repair]`.

## Pre-requisites & Rules
- **Environment**: Always operate from the local repository at `/Users/tefx/Projects/ResoFeed`.
- **Remote Host**: `tefx-mbp-personal.platy-atlas.ts.net`, remote dir `~/Projects/resofeed-caddy`.
- **Database Safety**: Never execute mutating SQL directly on the live remote DB. Use `docker cp` to create a `mktemp` copy, then use `sqlite3 -readonly` to query.
- **Redaction**: Never print `OPENROUTER_KEY`, `TAVILY_API_KEY`, `CF_API_TOKEN`, or `owner_token` to the visible transcript.
- **Cost/Rate Limit Defense**: If reprocessing encounters `rate_limited` or HTTP `429` / `502` errors for 3 or more items, STOP processing immediately and notify the user to avoid runaway provider costs.

---

## Process Protocol

### 1. Check Remote Failures (Discovery)
Execute a read-only query against the remote database to count and categorize failures.

<sql_diagnostic_query>
ssh tefx-mbp-personal.platy-atlas.ts.net "set -Eeuo pipefail; tmp=\$(mktemp -d /tmp/resofeed-db.XXXXXX); docker cp resofeed:/data/resofeed.sqlite3 \"\$tmp/resofeed.sqlite3\" >/dev/null; sqlite3 -readonly -header -csv \"\$tmp/resofeed.sqlite3\" \"select model_status, content_status, last_reprocess_error_message, count(*) n from items where content_status in ('decode_error','provider_error','rate_limited','invalid_model','timeout') or last_reprocess_status='failed' group by 1,2,3 order by n desc; select id from items where content_status in ('decode_error','provider_error','rate_limited','invalid_model','timeout') or last_reprocess_status='failed';\"; rm -rf \"\$tmp\""
</sql_diagnostic_query>

If no failures are found, jump to Step 6 (Report Success).

### 2. Investigate (Root Cause Analysis)
- Based on the `last_reprocess_error_message` (e.g., `prompt_injection_leakage`, `provenance_mutation`), identify the failing items.
- Extract the `source_evidence_text`, `extracted_text`, and `source_item_title` for the failing IDs from the remote DB copy to understand the exact source context.
- Cross-reference with validation logic in `internal/resofeed/openrouter.go` or logs (`docker logs --tail 200 resofeed`).

### 3. Fix and Test Delivery (Repair)
- Edit the Go source files to relax or fix the overly strict validators, or adjust semantic repair instructions.
- Add targeted `{name: "...", ...}` test cases in `openrouter_validation_retry_test.go` or `prompting_v21_runtime_contract_expected_red_test.go`.
- Ensure tests pass with `gofmt -w . && go test ./... -count=1`.
- *Do not bump the official version yet.* Build and push a `-dev` or same-tag image (e.g., `docker buildx build --platform linux/arm64 ...`).
- Deploy to remote by updating `RESOFEED_IMAGE` in `.env` and running `./deploy.sh` over SSH.

### 4. Reprocess & Check (The Verification Loop)
- Trigger reprocessing for the failed IDs.
- **Robust Fallback**: If MCP `reingest_item` times out, use a Python script reading from `~/.pi/agent/mcp.json` to extract the `RESOFEED_AUTHORIZATION` bearer token and hit `POST https://resofeed.tefx.one/api/items/<id>/reingest` sequentially.
- Query the remote DB again using the `<sql_diagnostic_query>`.
- **Loop Condition**: Maintain a mental `<loop_count>` tag. Check if failures remain. If `loop_count >= 3`, HALT and proceed to the report. Otherwise, go to Step 2.

### 5. Publish New Version (Bugfix)
Once `current_failed = 0` and `last_failed = 0`:
1. **Bump Version**: Update the version (e.g., from `0.2.8` to `0.2.9`) in:
   - `Dockerfile` (`ARG RESOFEED_VERSION="..."`)
   - `internal/resofeed/mcp.go` (`serverInfo := map[string]any{"name": "resofeed", "version": "..."}`)
   - `web/package.json`
   - `web/package-lock.json`
2. **Commit & Tag**: 
   ```bash
   git add . && git commit -m "fix: resolve LLM validation failures"
   git tag -a v<new_version> -m "ResoFeed v<new_version>"
   git push origin main && git push origin v<new_version>
   ```
3. **GitHub Release**: Use `gh release create v<version> --title 'ResoFeed v<version>' --notes '<changelog>'`
4. **Final Deploy**: Rebuild the Docker image with the new version tag, push, and deploy to Tailnet.

### 6. Telegram Report (Notification)
Use the `tela_send_markdown_message_as_telegram_bot` tool to send a comprehensive report in Chinese using `MarkdownV2` parsing mode.

<telegram_template>
*ResoFeed 自动诊断与修复报告* 🛠️

*诊断结果*
• 初始失败条目：\`<count>\` 条
• 失败原因分类：
  \- \`<Category 1>\`: \`<N>\` 条
  \- \`<Category 2>\`: \`<N>\` 条

*修复方案*
• \`<Action 1>\`
• \`<Action 2>\`

*处理结果*
• \`<✅ 成功清理所有失败条目 | ❌ 历经 3 次尝试仍有剩余失败条目>\`
• 新发布版本号：*\`<vX.Y.Z>\`*
• 远程部署状态：已更新至远程 Caddy 实例。
</telegram_template>

*Crucial MarkdownV2 Escaping Rule*: Ensure all MarkdownV2 special characters (`.`, `-`, `!`, `(`, `)`, `>`, `#`, `+`, `=`, `|`, `{`, `}`) are exclusively escaped with `\` in the final generated message string.

