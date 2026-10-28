---
name: pre-merge-check
description: Runs lint + typecheck + tests in parallel across the project and blocks if any fail. Works with TS/JS (eslint + tsc + jest/vitest) and Python (ruff + mypy + pytest). Use when the user types "pre-merge-check", "/pre-merge-check", "is this ready to merge", "run all checks", or before opening a PR.
---

## Objective
One command to answer "can this safely merge". Run every gate in parallel, surface failures in a clean digest, exit non-zero if anything failed.

## Hard Rules
- **Run all checks in parallel.** Lint, typecheck, and tests are independent — do not serialize them.
- **Detect tooling, don't assume.** Read `package.json` / `pyproject.toml` / `requirements*.txt` to learn what's available. Skip checks for tools that aren't configured.
- **Skip is not pass.** If a check is skipped (no tool found), report it as `SKIP` — never as `PASS`.
- **Exit non-zero on any failure.** Block the merge. Print remediation hints.

## Execution Steps

### 1. Detect stack
Look at the repo root for any of:
- `package.json` → JS/TS project
- `pyproject.toml` / `setup.py` / `requirements.txt` → Python project
- Both → polyglot, run both pipelines

For JS/TS, detect package manager: `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm.
For monorepo: `pnpm-workspace.yaml` / `lerna.json` / `nx.json` / workspaces in `package.json` — use `<pm> -r` or workspace-wide variants.

### 2. Run checks in parallel

**JS/TS lane:**
- Lint: `<pm> lint` if script exists, else `npx eslint .`
- Typecheck: `<pm> typecheck` if script exists, else `npx tsc --noEmit`
- Tests: `<pm> test` if script exists (CI mode — no watch)

**Python lane:**
- Lint: `ruff check .` if ruff available, else `flake8 .` if available
- Typecheck: `mypy .` if mypy configured
- Tests: `pytest -q` if `pytest` available

Capture each command's stdout, stderr, exit code separately. Time-cap each at 5 minutes.

### 3. Digest output

Format:
```
✓ JS lint        (pnpm lint) — passed in 12.3s
✓ JS typecheck   (tsc --noEmit) — passed in 8.1s
✗ JS test        (pnpm test) — FAILED in 24.6s
    3 failing tests in src/payment/__tests__/charge.test.ts
    - "rejects negative amounts" — expected 400, got 200
    - "handles idempotency key collision"
    - "rolls back on stripe timeout"
- Python lint    (ruff)     — SKIPPED (no Python files)
✓ Python types   (mypy)     — passed in 4.2s
✓ Python tests   (pytest)   — passed in 18.0s
```

Use:
- `✓` for pass
- `✗` for fail
- `-` for skip

### 4. Final verdict
If any `✗` — print:
```
❌ MERGE BLOCKED — N check(s) failed. Fix and re-run.
```
And list the failing commands the dev can re-run locally to debug.

If all pass:
```
✅ All checks passed. Safe to merge.
```

### 5. Exit code
Return the count of failed checks as exit code (0 if clean). Lets this skill be wired into CI or a git hook.

## Hints for failures
- Lint failures → suggest `<pm> lint -- --fix` or `ruff check . --fix`
- Type failures → point at the first failing file with `tsc --noEmit | head -20`
- Test failures → suggest running the single failing file in watch mode

## Output Style
Match active session tone. Digest itself stays normal — readability matters more than brevity.
