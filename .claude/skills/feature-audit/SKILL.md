---
name: feature-audit
description: One-command end-of-day feature auditor for the team lead. Given a feature name, PR number, or branch, dispatches every relevant skill in parallel — feature-review, contract-drift-check, complexity-check, test-coverage-delta, migration-safety, api-mock-parity, perf-budget, dead-code-scan, null-safety-scan, security-audit, system-design, dependency-hygiene — and synthesizes ONE consolidated report with a single merge verdict. Use when the user types "feature-audit", "/feature-audit", "/feature-audit <PR#|branch|name>", "evening review", "audit tonight", "daily review", "run everything on this feature", or as a scheduled nightly ritual.
---

# feature-audit — Evening one-shot review

## What it is
The team lead's single command at the end of the day. Point it at a feature and get back **one report** with a **single merge verdict** covering code quality, architecture, security, tests, contracts, migrations, performance, and hygiene. Under the hood it fans out to every relevant skill in parallel — no need to remember which skill to run when.

Think of `feature-review` as "review one PR". `feature-audit` is `feature-review` **plus** every specialized gate that applies to what that PR touched — automatically selected.

## Inputs

- `<PR#>` — GitHub PR number. Pulls diff, CI state, labels.
- `<branch>` — local or remote branch name. Diffs vs `main` (or configured base).
- `<feature-name>` — free text. Skill greps `docs/features/<name>.md`, `docs/adr/*<name>*.md`, and recent branch names.
- No arg — audits the current branch vs `main`.

Optional flags:
- `--since <date|ref>` — audit everything merged into `main` since that ref (batch mode).
- `--strict` — treat any Warn as a blocker.
- `--skip <skill>[,<skill>...]` — opt out of specific sub-skills for this run.

## How to run

### 1. Resolve scope + fingerprint the change
- Resolve `<base>` and `<head>` refs, get changed files, LOC size, touched workspaces.
- Fingerprint what the change touches — this drives which sub-skills apply:

| Trigger                                                    | Sub-skills that will run                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| Any code diff                                              | `feature-review`, `null-safety-scan`, `complexity-check`, `test-coverage-delta`, `security-audit`, `dead-code-scan` |
| Diff crosses ≥ 2 workspaces                                | `system-design`, `contract-drift-check`                          |
| Backend DTO / OpenAPI / pydantic schema changed            | `contract-drift-check`, `api-mock-parity`                        |
| `migrations/`, `prisma/schema.prisma`, `alembic/` changed  | `migration-safety`                                               |
| `apps/frontend-ui/**` or hot backend path                  | `perf-budget`                                                    |
| `package.json`, `pyproject.toml`, or lockfile changed      | `dependency-hygiene`                                             |
| New top-level dep or new pattern introduced                | `adr-writer` reminder (does not auto-write; nudges the author)   |

Skip sub-skills that don't apply — do not run `migration-safety` when nothing under `migrations/` changed. This keeps the run fast.

### 2. Dispatch sub-skills in parallel
- Fire the selected sub-skills concurrently via the `Agent` tool (subagent per skill so each has its own context window).
- Every sub-skill writes its own paper trail under its usual `docs/<domain>/` folder. `feature-audit` only reads their result summaries — it does not re-run their scripts.
- Cap concurrency at 6 sub-agents. Queue the rest.

Do NOT block the whole run on any one sub-skill. If one times out or errors, mark it `error` in the report and carry on.

### 3. Collect verdicts + findings
Each sub-skill returns a compact structured summary — verdict, top findings, paper-trail path. Merge them into a single result table.

### 4. Compute the top-level verdict
Deterministic aggregation — no soft calls:

| Rule                                                                 | Top verdict    |
| -------------------------------------------------------------------- | -------------- |
| Any sub-skill returns `block` / `unsafe` / `broken` / `CRIT`         | `block`        |
| Any `H` finding without a fix in the diff                            | `block`        |
| Any sub-skill returns `ship-with-followup` or has `M`/`WARN` findings | `ship-with-followup` |
| All sub-skills clean                                                 | `ship`         |
| `--strict` set: promote every `WARN`/`M` to `block`                   | (per flag)     |

### 5. Synthesize the report
Save to `docs/reviews/feature-audit-<YYYY-MM-DD>-<slug>.md`. Print verdict + top-3 blockers to stdout.

```markdown
# feature-audit — <feature-name-or-PR#>

**Verdict:** `ship` | `ship-with-followup(<n>)` | `block(<n>)`
**Base → Head:** <base> → <head>   **Diff:** <LOC> LOC, <N> files
**Author(s):** <git-blame authors>   **PR:** #<n> (link)

## Executive summary
<3 sentences: what shipped, top risk, recommended action>

## Sub-skill rollup
| Sub-skill               | Verdict            | Top finding                                     | Paper trail |
|-------------------------|--------------------|--------------------------------------------------|-------------|
| feature-review          | ship-with-followup | Missing tests for createOrder refund branch      | docs/reviews/...md |
| security-audit          | pass               | —                                                | docs/security/...md |
| null-safety-scan        | pass               | —                                                | — |
| complexity-check        | fail               | OrderScreen.tsx render: 190 LOC (ceiling 150)    | docs/complexity/... |
| test-coverage-delta     | partial(72%)       | 8 new lines uncovered in orders.service.ts       | — |
| system-design           | pass               | —                                                | docs/design/... |
| contract-drift-check    | drift(1)           | Order.customer_id renamed on backend, not client | docs/contracts/... |
| api-mock-parity         | drift(1)           | mocks/orders/get-order-200.json field mismatch   | docs/mocks/... |
| migration-safety        | n/a                | (no migrations touched)                          | — |
| perf-budget             | regressed(1)       | frontend-ui main.js gzip +9.3%                   | docs/perf/... |
| dead-code-scan          | debt(2)            | 2 unused exports in orders barrel                | docs/dead-code/... |
| dependency-hygiene      | n/a                | (deps unchanged)                                 | — |

## Regression-risk map (from feature-review)
<table>

## Blockers (must fix before merge)
- [ ] `complexity-check` H · Split `OrderScreen.tsx` render (currently 190 LOC)
- [ ] `contract-drift-check` CRIT · `customer_id` renamed on backend but client still reads old name
- [ ] `perf-budget` H · Bundle up 29 KB — likely full `lodash` import in `OrderRow.tsx`

## Follow-ups (ship OK, ticket after)
- [ ] Add unit test for `createOrder` refund branch
- [ ] Remove 2 unused exports from `apps/frontend-ui/src/orders/index.ts`
- [ ] Consider `adr-writer` — `zod` added to backend for the first time; document the choice

## Author notes
Junior: @<handle>. Suggested one-liner feedback to send:
> "Great start. Two things to fix before merge — client-side `customer_id` rename and the bundle-size regression. Details in the audit report."
```

### 6. Digest for the lead
Also print a **one-screen digest** to stdout so the lead does not have to open the file every night:

```
feature-audit · <feature> · <YYYY-MM-DD>

VERDICT  block(3)

BLOCKERS
  complexity-check   OrderScreen.tsx render 190 LOC (ceiling 150)
  contract-drift     customer_id renamed on backend; client uses old name
  perf-budget        main.js gzip +9.3% (likely full lodash import)

FOLLOW-UPS (4)  →  docs/reviews/feature-audit-2026-07-05-orders-refund.md
```

## Batch mode — nightly ritual

When invoked as `feature-audit --since yesterday` or `feature-audit --since <last-nightly-tag>`:

1. Enumerate every PR merged into `main` since `<since>`, plus every open PR touched today.
2. Run the audit per feature in **sequence** (parallel across features would flood the machine).
3. Emit one **team digest** at `docs/reviews/feature-audit-digest-<YYYY-MM-DD>.md` with:
   - One row per feature: author, verdict, top blocker, paper-trail link.
   - Aggregate rollup — how many features blocked, how many follow-ups outstanding, which sub-skill fired most.

This is what the lead can paste into Notion or Slack at 7pm.

## Hard rules

- **One report, one verdict.** Never surface conflicting verdicts from sub-skills without reconciling.
- **Do not re-run cached sub-skill output.** If a sub-skill wrote its paper trail less than 15 min ago against the same HEAD SHA, reuse it. Log which were reused.
- **Sub-skills run in parallel via `Agent` sub-agents**, not sequentially. Each sub-agent runs one skill; results returned as JSON summaries the orchestrator merges. Fan-out ≤ 6.
- **Mask secrets before saving the report.** Reuse `.claude/skills/security-audit/scripts/mask-findings.sh` if available.
- **Author attribution is mandatory** — git-blame every changed file, list top authors, so the lead knows who to DM.
- **Never soft-verdict.** `block` is `block`. If a sub-skill is unclear, ask, don't guess.
- **Do not spawn `feature-audit` inside a sub-agent.** It orchestrates, it is not orchestrated. Guard against recursion.

## Scheduling — how the lead sets this up

Two options, in order of preference:

1. **Local cron / launchd** — `0 19 * * *` runs a one-liner that pipes `feature-audit --since 24h` into the Bash tool and mails / Slacks the digest. Simplest.
2. **The harness `schedule` skill** — if the lead wants Claude Code to run it as a scheduled agent, `/schedule` can register it as a nightly routine. Ask the lead which they prefer once the skill is proven on a manual run.

## Composition — sub-skills invoked

`feature-audit` is a thin orchestrator. All the real work lives in these skills — read their SKILL.md for their exact rules:

- [`feature-review`](../feature-review/SKILL.md) — merge verdict, regression-risk map, approach critique
- [`security-audit`](../security-audit/SKILL.md) — 42-rule OWASP gate
- [`null-safety-scan`](../null-safety-scan/SKILL.md) — null / undefined / None
- [`system-design`](../system-design/SKILL.md) — cross-service design
- [`contract-drift-check`](../contract-drift-check/SKILL.md) — inter-workspace schemas
- [`api-mock-parity`](../api-mock-parity/SKILL.md) — mock ↔ contract drift
- [`migration-safety`](../migration-safety/SKILL.md) — DB migrations
- [`complexity-check`](../complexity-check/SKILL.md) — complexity ceilings
- [`test-coverage-delta`](../test-coverage-delta/SKILL.md) — new-lines coverage
- [`perf-budget`](../perf-budget/SKILL.md) — perf budgets
- [`dead-code-scan`](../dead-code-scan/SKILL.md) — unused code
- [`dependency-hygiene`](../dependency-hygiene/SKILL.md) — third-party deps
- [`adr-writer`](../adr-writer/SKILL.md) — nudged when a new pattern lands
