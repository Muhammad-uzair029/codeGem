---
name: feature-qa
description: Autonomous end-to-end QA for one feature using Playwright — no human in the loop. Use when the user types "feature-qa", "/feature-qa", "/feature-qa <feature|PR|branch|spec>", "test this feature end to end", "QA this feature", "e2e test this", "write playwright tests for", "does this feature actually work", or when feature-loop's verifier needs real behavioural evidence for a web, Electron, or HTTP-API feature.
---

# feature-qa — autonomous end-to-end QA with Playwright

## What it is

A QA engineer in a box. Given a feature, it works out what the feature should do, writes that down, designs test cases from it, turns them into Playwright tests, runs them against the real app, triages every failure, and hands back a report with a verdict. **It never stops to ask a human.** Anything only a human can decide goes into the report as a *Decision needed* with the default it assumed.

## Deliverables (all required, in this order)

For feature slug `<slug>` (kebab-case, from the feature name):

| # | Artifact | Path |
|---|----------|------|
| 1 | Feature doc | `docs/qa/<slug>/01-feature.md` — from `templates/feature.md` |
| 2 | Test-case catalogue | `docs/qa/<slug>/02-test-cases.md` — from `templates/test-cases.md` |
| 3 | Playwright tests | `e2e/qa/<slug>.spec.ts` (or the project's existing e2e dir + `qa/`) |
| 4 | Run evidence | `docs/qa/<slug>/evidence/` — screenshots, `results.json`, HTML report |
| 5 | Report | `docs/qa/<slug>/report.md` — from `templates/report.md` |

Write each artifact before starting the next. Tests (3) are written only from the catalogue (2), and every test title starts with its case id (`TC-07 …`), so the report can trace requirement → case → test → result.

## Workflow

### 1. Understand the feature → `01-feature.md`
Sources, in priority order: a feature-loop spec (`.claude/specs/<mod>/<feat>/`), the PR/branch diff (`git diff <base>...HEAD`), the user's description, then the code itself (routes, components, handlers, state, storage). Record: purpose, entry points (URLs / screens / endpoints), user flows, business rules, inputs and their limits, states (empty / loading / error / success), persistence, and **numbered acceptance criteria** (`AC-1 …`). When the source is silent, infer the most reasonable behaviour from the code and mark it `(inferred)`.

### 2. Design test cases → `02-test-cases.md`
Every AC gets ≥ 1 case. Then add cases from each lens that applies:

- happy paths for each flow · boundaries (empty, max, zero, one, many) · invalid input · error and offline states
- state: reload mid-flow, back/forward, double-submit, persistence after reload, storage unavailable
- timing: timers, debounce, slow network (use `page.clock` / `page.route` — never real waits)
- layout: 1440px and 375px, no horizontal scroll; light and dark if themed
- accessibility basics: keyboard-only path, focus moves, labels/roles, visible focus
- integrity: no console errors or page errors during any test

Each case: id, title, AC link, priority (P0 must-work / P1 / P2), preconditions, steps, expected result.

### 3. Write Playwright tests → `e2e/qa/<slug>.spec.ts`
Follow `reference/playwright-patterns.md`. If the project has a Playwright config, add a dedicated `qa` project to it (`testMatch: 'qa/**/*.spec.ts'`) and start the app per-project or with a worker-scoped server fixture — never a global `webServer` that other projects would also start. No config → add the minimal one from the reference. Locators: role/label/text/`data-testid` — no brittle CSS chains. One `test()` per case, and each assertion must only match the intended element (check `toHaveCount(1)` when text could repeat).

### 4. Run → triage → rerun
Start the app the way the project does (see the reference: web via `webServer`, Electron via `_electron.launch`, API via `request`). Run the suite, then handle every failure:

```
failing test
 ├─ passes on 2 of 3 reruns ─────────────→ FLAKY: fix the wait/locator, re-run 3× clean
 ├─ test is wrong (selector, wrong expectation vs. 01-feature.md)
 │                                        → fix the test (max 3 attempts), note it
 └─ app is wrong (behaviour contradicts an AC or obvious correctness)
                                          → PRODUCT BUG: keep the test asserting the correct
                                            behaviour, mark it test.fail(true, 'BUG-n: …'),
                                            screenshot + steps into the report
```

Add `test.fail` only after you have watched that test fail for the product reason — never in advance. A behaviour the feature simply doesn't have (no resume, no undo) is a *Decision needed*, not a bug, unless an AC requires it.

Then run the full suite 3× with evidence output: `npx playwright test --project=qa --repeat-each=3 --reporter=list,json,html --output=docs/qa/<slug>/evidence/test-results` with `PLAYWRIGHT_JSON_OUTPUT_NAME=docs/qa/<slug>/evidence/results.json PLAYWRIGHT_HTML_REPORT=docs/qa/<slug>/evidence/html-report` (a custom `--output` keeps Playwright from wiping the project's shared `test-results/`). Final state: suite green (known bugs marked `test.fail`), 0 flaky.

Do **not** change product code unless the user passed `--fix`. With `--fix`: fix each P0/P1 bug, remove its `test.fail`, re-run everything.

### 5. Report → `report.md`
Verdict first: **PASS** (all P0/P1 cases pass), **PASS WITH ISSUES** (only P2 failures or Decisions needed), **FAIL** (any P0/P1 bug), **BLOCKED** (couldn't run — say exactly why and what was tried). Then the traceability table, bugs by severity with repro steps and evidence, *Decisions needed* (question + default assumed), what was not covered and why, and the exact command to re-run.

## Autonomy rules

- No questions to the user at any step. Ambiguity → decide, label it `(inferred)` or *Decision needed*, keep going.
- Can't start the app → try the project's documented commands, then common ones (`dev`, `start`, `preview`, build + static serve). Still nothing → write the report as **BLOCKED** with the commands and errors. Never stop without a report.
- No browser download possible → use an installed browser (`channel: 'chrome'` / `'msedge'`).
- Stop every server/process you started. Leave only the deliverables.
- Can't run git (or told not to) → fill the build/commit field from what you know, or `unknown`.
- Can't write `report.md` (e.g. running as a sub-agent whose harness blocks report files) → return the report's full content as your final message so the caller can save it.

## Composition

- Called by `feature-loop` stage 3 (verifier) when the feature has a UI or HTTP surface; the verifier reads `report.md` and treats FAIL as `block`.
- Pairs with `test-coverage-delta` (unit-level gaps) and `security-audit` (security) — this skill covers behaviour.
