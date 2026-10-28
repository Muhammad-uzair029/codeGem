---
name: feature-review
description: Team-lead-grade evaluator for a feature shipped by another engineer (usually a junior). Given a PR number, branch, or feature name, produces a merge verdict with regression-risk map, approach critique, better-approach proposals, and a specific test-plan gap list. Composes pre-merge-check, security-audit, system-design, and null-safety-scan under one call so the lead does not have to invoke three skills. Use when the user types "feature-review", "/feature-review", "/feature-review <PR#>", "/feature-review <branch>", "/feature-review <feature-name>", "review this feature", "evaluate the junior's work", "regression risk on this branch", "is this ready to merge from a design perspective", or during a scheduled PR triage.
---

# feature-review — Junior-work evaluator (team-lead mode)

## What this skill is for

The team lead's daily job: look at a feature a junior shipped, decide whether it merges, and hand back a short list of concrete blockers or follow-ups. Doing that by hand takes 15–30 minutes per PR — reading the diff, running the gates, sniffing for regressions, comparing to how you'd have solved it.

This skill compresses that into one invocation. It produces a **merge verdict** (`ship` / `ship-with-followup(<items>)` / `block(<blockers>)`) grounded in six deliverables:

1. **What shipped** — plain-English 2-line summary of the diff
2. **Approach critique** — pattern chosen vs alternatives; composition-over-duplication check; speculative-abstraction check
3. **Regression-risk map** — for every changed function/route/component, callers touched + downstream code paths that can silently break, ranked by blast radius
4. **Better-approach proposal** — if a simpler / reuse-based path exists in this repo, propose a diff-sized alternative with file paths
5. **Test-plan gap** — for each risk in step 3, name the missing unit / integration / e2e test
6. **Merge verdict** — `ship` / `ship-with-followup(<items>)` / `block(<blockers>)`

It is opinionated. It defers to `system-design` for cross-service seams, to `security-audit` for OWASP-mapped issues, to `pre-merge-check` for mechanical gates, and to `null-safety-scan` for null hygiene — but the merge verdict is this skill's own.

## Inputs it accepts

- `<PR#>` — pulls diff, base branch, and CI state via `gh pr view` / `gh pr diff`
- `<branch>` — diffs against `main` (or the configured base)
- `<feature-name>` — greps `docs/features/<name>.md` if present; otherwise treats it as a keyword and finds the branch or the last commits touching that surface
- no arg — reviews the current branch vs `main`

## How to run

Run steps in order. **Do not skip step 2** — the regression-risk map is the whole point of the skill; a critique without a blast-radius list is useless to a lead who has to decide what to unblock.

### 1. Establish scope

- Resolve input → base ref + head ref + list of changed files.
- `git diff --stat <base>...<head>` for size sanity check. If diff is > 1500 LOC, warn the user and offer to review file-group by file-group.
- Read `docs/features/<name>.md` if present. If absent, note it — juniors should have used `generate-docs`; missing docs is itself a follow-up.

### 2. Regression-risk map (the load-bearing step)

For each **exported function**, **HTTP route**, **UI component**, **DB model**, or **AI handler** modified in the diff:

- Grep the whole repo for callers (`rg -F -n "<symbol>("` and named-import scans).
- For each caller, note the call site + whether the changed signature / behavior can silently break it.
- Rank each risk `H` (production path, silent failure possible), `M` (test-path or edge case), `L` (dev-only or well-typed).
- Output as a table:

```
| Symbol / route       | Blast radius | Silent-break? | Callers touched                    | Rank |
|----------------------|--------------|---------------|------------------------------------|------|
| createOrder()        | 3 modules    | Yes           | apps/backend-api/src/checkout/*.ts | H    |
| <OrderRow />         | 1 screen     | No (typed)    | apps/frontend-ui/src/orders/*.tsx  | L    |
```

If the diff renames a public symbol, treat every unmigrated caller as an `H`.

### 3. Approach critique

Compare what the junior did vs how the repo already solves adjacent problems.

- Grep for the closest existing primitive (`apps/frontend-ui/src/components/**`, `apps/backend-api/src/**/services`, `apps/ai-engine/**/handlers`).
- Composition-over-duplication check (from `CLAUDE.md`): did they re-author a primitive that already exists?
- Speculative-abstraction check (from `CLAUDE.md`): did they add a helper / interface / feature flag that has exactly one caller? Flag as `WARN`.
- Cross-app leakage check: did `frontend-ui` reach into `backend-api` internals, or `backend-api` embed model / prompt code that belongs in `ai-engine`? Flag as `H`.

### 4. Delegate the mechanical gates

Run these in **parallel** (independent, no shared state):

- `pre-merge-check` on the head ref (lint + typecheck + tests)
- `security-audit` mode 1 (42-rule sweep) on the diff
- `null-safety-scan` on staged / changed TS/JS/Python files
- `system-design` for the touched surfaces if the diff crosses service boundaries

Fold results into the report as one line each — do not re-print the full outputs. Link to their paper trail in `docs/security/` etc.

### 5. Better-approach proposal (only if warranted)

Only include this section if a simpler alternative genuinely exists in-repo. Do not invent hypothetical patterns. If proposing an alternative:

- Name the existing primitive with file path + line number.
- Sketch the alternative diff at 5–15 line granularity — enough for the lead to judge cost of the rewrite.
- State explicitly whether the alternative is a `block` (the current approach is wrong) or a `follow-up` (current approach ships, refactor later).

### 6. Test-plan gap

For each `H` and `M` risk from step 2, name one missing test with the exact file it should live in and the exact assertion. Example:

```
- H · createOrder() silent-break on missing customer_id
  Missing: apps/backend-api/src/checkout/__tests__/createOrder.spec.ts
  Assert: `expect(createOrder({ customer_id: undefined })).rejects.toThrow(ValidationError)`
```

If the junior added no new tests and the diff introduces logic, that is a `block` on its own.

### 7. Merge verdict

Verdict rules — no ambiguity:

- Any `security-audit` FAIL Critical / High → `block`
- Any cross-app leakage flagged `H` in step 3 → `block`
- Any `H` risk with no test → `block`
- `pre-merge-check` FAIL → `block`
- Speculative abstraction, missing docs, `M` risk with no test → `ship-with-followup`
- Otherwise → `ship`

Print the verdict on its own line at the top of the report, then the six sections below.

## Output template

```markdown
# feature-review — <feature-name-or-PR#>

**Verdict:** `ship` | `ship-with-followup(<n items>)` | `block(<n blockers>)`
**Base:** <base-ref>  **Head:** <head-ref>  **Diff:** <LOC> LOC, <N> files

## 1. What shipped
<2 lines>

## 2. Regression-risk map
<table>

## 3. Approach critique
<bullets — composition, abstraction, cross-app leakage>

## 4. Gate results
- pre-merge-check: PASS / FAIL (<summary>)
- security-audit:  PASS / FAIL (<summary — link to docs/security/*.md>)
- null-safety-scan: PASS / FAIL (<summary>)
- system-design:   PASS / FAIL / N/A (<summary>)

## 5. Better-approach (optional)
<omit if not warranted>

## 6. Test-plan gap
<bulleted list, each with exact file + assertion>

## 7. Blockers / follow-ups
- [ ] <blocker 1>
- [ ] <blocker 2>
- [ ] <follow-up 1>
```

Save the report to `docs/reviews/feature-review-<YYYY-MM-DD>-<slug>.md` so the lead has a paper trail. Also print the verdict + blockers to stdout so the lead does not have to open the file to know the answer.

## Hard rules

- **Verdict is deterministic** — follow the rules in step 7. Do not soften a `block` to a `ship-with-followup` because "it's mostly fine".
- **Do not propose a rewrite that does not already exist as a primitive** in the repo. `feature-review` is for real alternatives, not creative rewrites.
- **Regression-risk table is mandatory** — even for tiny diffs. If the diff touches nothing exported, note that explicitly.
- **Do not re-print** long outputs from the delegated skills. One-line summaries only; full paper trail lives in `docs/security/`, `docs/team-pulse/`, etc.
- **Mask any secrets / PII** that leak through diff excerpts before writing to `docs/reviews/`. Reuse `.claude/skills/security-audit/scripts/mask-findings.sh` if present.
