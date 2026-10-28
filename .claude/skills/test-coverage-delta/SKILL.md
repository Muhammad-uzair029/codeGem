---
name: test-coverage-delta
description: Runs coverage against the base branch and reports ONLY the newly-added uncovered lines — not the full project percentage. Turns "coverage is 78%" into "these 12 new lines are untested". Works with jest / vitest (TS/JS) + pytest-cov (Python). Use when the user types "test-coverage-delta", "/test-coverage-delta", "coverage on the diff", "did they add tests", "coverage delta", "is my PR tested", or as a merge gate.
---

# test-coverage-delta — New-lines-only coverage report

## Why not full coverage %
Full-project % is a lagging indicator — you can add 100 untested lines and % stays flat because base is huge. What matters for a PR review: **for the lines this diff added, how many are covered?** That's what this skill reports.

## How to run

### 1. Establish base
- Resolve base ref: PR base, or `main` for a plain branch.
- Compute new-line set: `git diff --unified=0 <base>...HEAD` → parse hunks → `{file: [line_ranges_added]}`.
- Skip: generated files (`*.gen.*`, `dist/**`, migrations), lockfiles, docs (`**/*.md`), config (`*.json`, `*.yaml`), tests themselves.

### 2. Collect coverage
Run per stack in parallel:

- TS/JS: `<pm> test -- --coverage --coverage-reporters=json-summary --coverage-reporters=lcov` (jest) or `vitest run --coverage --reporter=json` (vitest). Read `coverage/coverage-final.json` or `coverage/lcov.info`.
- Python: `pytest --cov=. --cov-report=json`. Read `coverage.json`.

Detect the tool from `package.json` scripts / `pyproject.toml` — don't assume.

### 3. Intersect
For each file in the diff:
- Load per-line hit map from coverage.
- Intersect with the new-line set from step 1.
- Compute: `new_lines`, `new_lines_covered`, `new_lines_uncovered`.

### 4. Report

```markdown
# test-coverage-delta

**Verdict:** covered | partial(<pct>%) | untested(<n>)

## Per-file
| File                                         | New lines | Covered | Uncovered |
|----------------------------------------------|-----------|---------|-----------|
| apps/backend-api/src/orders/orders.service.ts| 34        | 30      | 4         |
| apps/frontend-ui/src/orders/OrderRow.tsx     | 12        | 12      | 0         |
| apps/ai-engine/handlers/summarize.py         | 21        | 0       | 21        |

## Uncovered new lines
- apps/backend-api/src/orders/orders.service.ts:88-91  (`if (order.status === 'refund_pending')` branch)
- apps/ai-engine/handlers/summarize.py:12-32           (entire new handler function)

## Suggested tests
- Assert `orders.service.ts` refund_pending branch: `apps/backend-api/src/orders/__tests__/orders.service.spec.ts`
- Add handler unit test: `apps/ai-engine/tests/handlers/test_summarize.py::test_summarize_happy_path`
```

Verdict rules:
- 100% of new lines covered → `covered`, exit 0
- ≥ 80% → `partial`, exit 0 with warn
- < 80% → `untested`, exit non-zero (block)

Thresholds configurable via `.claude/skills/test-coverage-delta/config.json` (`{ "min_delta_pct": 80 }`).

## Hard rules
- **Ignore full-project %.** This skill never reports it — that's what dashboards are for.
- **A skipped test is not a passing test.** Report `it.skip` / `xit` / `pytest.mark.skip` inside diff scope as `uncovered`.
- **Do not count lines executed by e2e-only tests** unless the user opts in — unit + integration only by default (avoid coverage inflation).
- **Suggested-tests section is mandatory.** Every uncovered range needs a proposed test-file path.
