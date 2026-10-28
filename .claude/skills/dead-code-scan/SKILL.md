---
name: dead-code-scan
description: Finds unused exports, unreachable branches, and orphan files across TS/JS + Python workspaces. Complementary to `dependency-hygiene` (external deps) — this skill targets code the team owns. Use when the user types "dead-code-scan", "/dead-code-scan", "find dead code", "unused exports", "unreachable code", "orphan files", or before a large refactor / cleanup PR.
---

# dead-code-scan — Unused-code auditor

## Objective
Delete code that has no callers. Every dead symbol is documentation debt (still shows up in autocomplete), attack surface (still lint-clean but never audited), and cognitive weight (readers wonder if it matters).

## What counts as dead

1. **Unused exports** — module exports `foo` but no file imports `foo` (or its equivalent barrel path).
2. **Unreachable branches** — code after unconditional `return` / `throw` / `raise` / `sys.exit`.
3. **Orphan files** — files that are not imported anywhere and are not an entry point.
4. **Zombie types / interfaces** — TS `interface` / `type` / Python `TypedDict` declared but never referenced.
5. **Dead handlers** — controllers / event handlers / queue consumers registered but never mounted.

## How to run

### 1. Detect stack + entry points
Entry points are code with no upstream imports (that's intentional):

- `apps/*/package.json` `main` / `bin` / `exports`
- `apps/frontend-ui/index.js`, `App.tsx`, Expo entry
- `apps/backend-api/src/main.ts` (NestJS bootstrap)
- `apps/ai-engine/main.py`, `worker.py`
- Test files, config files, `scripts/*`

Anything transitively reachable from an entry point is **live**. The rest is a candidate for deletion.

### 2. Run per-stack analyzers in parallel

- TS/JS: `npx knip --reporter json` (best-in-class for exports + files + deps). Fall back to `ts-prune` if knip unavailable.
- Python: `vulture .` for dead code + `ruff --select F401,F841` for unused imports/vars + custom scan for orphan files (files with 0 in-repo imports).

### 3. Filter false positives
Common sources:
- Dynamic imports (`require(name)` where `name` is a variable) — scan for these and mark referenced modules as **live-if-string-matches**.
- Reflection frameworks — NestJS DI uses `@Injectable()`; every class decorated with a `@nestjs/*` decorator is entry-point-ish. Detect and whitelist.
- Test fixtures — files under `__tests__/`, `test/`, `tests/`, `*.spec.ts`, `*.test.py` are live if referenced by any test file.
- Public library exports — `apps/*/index.ts` re-exports for downstream consumers count as external usage.

Maintain `.claude/skills/dead-code-scan/allowlist.json` for confirmed false positives with a comment on why.

### 4. Rank findings

| Situation | Rank |
|-----------|------|
| Orphan file, no imports anywhere | **H** |
| Unused export in a barrel `index.ts` | **M** |
| Unused non-exported private symbol | **L** |
| Unreachable branch inside a live function | **M** |
| Zombie type in shared contracts package | **H** (contract drift risk) |

### 5. Suggest action per finding

- Orphan file → `rm <path>`. Print git-blame author for coordination.
- Unused export → convert to non-exported, or delete if truly dead.
- Unreachable branch → delete + explain why the guard exists at all.

### 6. Batch delete plan
Print a single script the lead can review + apply:

```bash
# dead-code-scan proposed removals (review before running)
git rm apps/backend-api/src/legacy/old-adapter.ts
git rm apps/frontend-ui/src/screens/DeprecatedScreen.tsx
# edit apps/backend-api/src/utils/index.ts: remove `export { unusedHelper };`
```

## Output

`docs/dead-code/scan-<YYYY-MM-DD>.md`.

```markdown
# dead-code-scan — 2026-07-05

**Verdict:** clean | debt(<n>)

## Rollup
- Orphan files: 3 (H)
- Unused exports: 12 (M:5 L:7)
- Unreachable branches: 2 (M)
- Zombie types: 1 (H)

## Details
...

## Proposed removal script
...
```

## Hard rules
- **Do not auto-delete.** Only propose. Deletion is a human decision — reflection frameworks fool static tools.
- **Every orphan-file finding must include git-blame author** so the lead knows who to ask before rm.
- **Allowlist entries expire.** Any entry older than 90 days should be re-verified in the next scan.
- **Suggested-removal script must be atomic** — commit-able as one PR.
