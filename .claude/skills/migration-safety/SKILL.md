---
name: migration-safety
description: Audits every DB migration in the diff for production-time hazards — irreversible drops, NOT NULL on populated tables, long-locking index builds, backfills under concurrent writes, unsafe defaults, schema breaks with in-flight app code. Supports Prisma, TypeORM, Knex, Alembic, and raw SQL. Use when the user types "migration-safety", "/migration-safety", "is this migration safe", "check the migration", "backfill safety", "will this lock the table", or before merging any diff that touches `migrations/`, `prisma/schema.prisma`, or `alembic/`.
---

# migration-safety — DB migration reviewer

## What it catches

A migration that runs green in dev on an empty table and destroys prod on a 50M-row table. Classes of hazard:

1. **Irreversible drops** — `DROP COLUMN`, `DROP TABLE`, `DROP INDEX`, type narrowing (`VARCHAR(255) → VARCHAR(64)`), enum member removal
2. **Locking** — Adding NOT NULL on populated tables, `CREATE INDEX` without `CONCURRENTLY` (Postgres), `ALTER TABLE ADD COLUMN` with default (MySQL < 8.0.12)
3. **Backfill hazards** — Batch UPDATE without chunking, backfill inside the same migration as the constraint that requires it
4. **App-schema races** — Migration removes a column while the running app still reads it; migration renames a column while the running app still writes the old name
5. **Data loss shape** — `ON DELETE CASCADE` added retroactively, foreign key added without validation grace period

## How to run

### 1. Detect the migration surface
Discovery order (first match wins):
- `apps/backend-api/prisma/migrations/**` → Prisma
- `apps/backend-api/src/**/migrations/**` → TypeORM
- `migrations/**/*.js` + `knexfile.*` → Knex
- `alembic/versions/**` (Python) → Alembic
- `apps/ai-engine/db/migrations/**` — vendor-specific

Read the migration files added / modified in `git diff <base>...HEAD`. If none, `verdict: no-migrations, exit 0`.

### 2. Static SQL scan
For each migration, extract SQL (raw or ORM-emitted). Flag by pattern:

| Pattern | Rank | Fix |
|---------|------|-----|
| `DROP COLUMN` on a column referenced anywhere in `apps/backend-api/src/**` | **CRIT** | Two-phase drop: deploy code that stops reading → next release drops column |
| `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` without a preceding backfill in the same or earlier migration | **CRIT** | Backfill → set default → set NOT NULL, split across migrations |
| `CREATE INDEX` (Postgres) without `CONCURRENTLY` on a table > 100K rows (heuristic) | **H** | Use `CONCURRENTLY`; run outside a transaction |
| `ADD COLUMN ... NOT NULL DEFAULT <fn()>` where fn is volatile | **H** | Split into ADD nullable → backfill → SET NOT NULL |
| `UPDATE ... WHERE` inside migration, no `LIMIT` chunking | **H** | Chunk to 5K rows, sleep, repeat |
| Rename column (Prisma `@map` change without a `-- previous-name` shim) | **CRIT** | Multi-phase: add new column → dual-write → backfill → cut reads → drop old |
| Foreign key `ON DELETE CASCADE` on a large table | **M** | Confirm ownership; document blast radius |
| Enum member removal | **CRIT** | Two-phase: stop writing → migrate rows → drop |

### 3. Backfill review
For every backfill:
- Is it chunked?
- Is it idempotent (safe to re-run after crash)?
- Is it inside the same transaction as a DDL change? If yes → **H** (bloats transaction, locks longer)
- Does it run under a lock that blocks writes? → **CRIT** on hot tables

### 4. App-schema race check
- Grep `apps/backend-api/src/**` for column names dropped / renamed in the migration.
- If a live route or ORM entity still references the removed name → **CRIT** (rollout will 500).
- Suggest: land ORM change first in one PR, migration in the next.

### 5. Reversibility
- Does the migration have a `down` / `downgrade` / `-- rollback` block?
- Is the down block correct (not just `-- TODO`)?
- Data-losing migrations should have an explicit `IRREVERSIBLE` marker plus a snapshot procedure documented in `docs/migrations/`.

### 6. Environment check
- Confirm the migration runs the same on all environments the app deploys to (Postgres major matches, MySQL mode matches). Cross-check `apps/backend-api/docker-compose.*` + prod config docs.

## Output

Save to `docs/migrations/safety-<YYYY-MM-DD>-<slug>.md`. Print rollup to stdout.

```markdown
# migration-safety — 2026-07-05 — add-order-status

**Verdict:** safe | risky(<n>) | unsafe(<n>)
**Migration:** apps/backend-api/prisma/migrations/20260705120000_add_order_status/

## Findings
- CRIT · line 4 · `ALTER COLUMN status SET NOT NULL` without backfill on populated table
- H    · line 8 · `CREATE INDEX idx_order_status` missing `CONCURRENTLY`

## Suggested split
1. Migration `20260705120000_add_order_status_nullable` — add column nullable
2. Backfill migration `20260705120100_backfill_order_status` — chunked UPDATE with LIMIT 5000
3. Migration `20260705120200_order_status_not_null` — SET NOT NULL
4. Deploy app code that writes `order_status` in between (2) and (3)
```

## Hard rules
- **Never approve a `DROP COLUMN` in the same PR as the code that stops reading it.** Two-phase minimum.
- **Every CRIT blocks the PR.** No exceptions without a written rollout plan attached to the PR.
- **Down-migrations must be correct or explicitly marked irreversible** — silent broken rollbacks are worse than none.
- Verdict is `unsafe` if any **CRIT** exists; `risky` if any **H**; `safe` only if all findings ≤ **M**.
