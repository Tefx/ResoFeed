package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	_ "modernc.org/sqlite"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: seed_fixture <db-path>")
		os.Exit(2)
	}
	db, err := sql.Open("sqlite", os.Args[1])
	if err != nil {
		panic(err)
	}
	defer db.Close()
	ctx := context.Background()
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = db.ExecContext(ctx, `
insert into sources (id, url, title, created_at, last_fetch_at, last_fetch_status, is_active, revision)
values ('audit_src_01', 'https://audit.example/feed.xml', 'Audit Source', ?, ?, 'ok', 1, 1)
on conflict(id) do update set url=excluded.url, title=excluded.title, last_fetch_at=excluded.last_fetch_at, last_fetch_status='ok', is_active=1;

insert into items (id, source_id, source_url, url, canonical_url, title, feed_excerpt, extracted_text, summary, core_insight, value_tier, published_at, first_seen_at, extraction_status, model_status, story_key, duplicate_of_item_id)
values ('audit_item_01', 'audit_src_01', 'https://audit.example/feed.xml', 'https://audit.example/sqlite-runtime-proof', 'https://audit.example/sqlite-runtime-proof', 'SQLite runtime proof item', 'audit feed excerpt mentions sqlite and mcp', 'full extracted audit text for sqlite mcp integration proof', 'Dense audit summary proving the real HTTP and MCP seams returned seeded SQLite content.', 'Real process reads one SQLite database through shared operations.', 'high', ?, ?, 'full', 'ok', null, null)
on conflict(id) do update set title=excluded.title, summary=excluded.summary, extracted_text=excluded.extracted_text;

insert into item_state (item_id, is_resonated, last_actor_kind, last_actor_id)
values ('audit_item_01', 1, 'human', 'audit-seed')
on conflict(item_id) do update set is_resonated=1, last_actor_kind='human', last_actor_id='audit-seed';

insert into steer_rules (id, rule_text, is_active, superseded_by, created_at, created_by_actor_kind, created_by_actor_id, revision)
values ('audit_rule_01', 'Push more integration verification evidence.', 1, null, ?, 'human', 'audit-seed', 1)
on conflict(id) do update set rule_text=excluded.rule_text, is_active=1, superseded_by=null;

delete from search_fts;
insert into search_fts (item_id, title, source_title, feed_excerpt, summary, extracted_text, provenance)
select i.id, i.title, coalesce(s.title, ''), coalesce(i.feed_excerpt, ''), coalesce(i.summary, ''), coalesce(i.extracted_text, ''),
       coalesce(i.source_url, s.url, '') || ' ' || coalesce(i.url, '') || ' ' || coalesce(i.canonical_url, '') || ' ' || coalesce(i.story_key, '') || ' ' || coalesce(i.duplicate_of_item_id, '')
from items i left join sources s on s.id = i.source_id;
`, now, now, now, now, now)
	if err != nil {
		panic(err)
	}
	fmt.Println("seeded audit_src_01 audit_item_01 audit_rule_01 and rebuilt search_fts")
}
