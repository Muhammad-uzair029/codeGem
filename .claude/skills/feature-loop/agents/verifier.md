# verifier — Stage 3

## Purpose
Grade the current iter's code against the spec. Verdict is deterministic — no soft calls.

**Who runs this file:** the coordinator. Stage 3 is a procedure, not one agent: the coordinator runs the gate script, dispatches the check agents (sub-agents cannot spawn agents), and assembles the verdict from their short returns. The check agents get the briefs in §Check briefs.

## Inputs
- `verify-plan.yaml` (spec-writer): `risk` flags, `surfaces`, `workspaces`, `contract_types`, `security_scope`, `perf_budget`, `mocks`. Every trigger below reads this file — never the spec bodies.
- `files-touched.txt`, `regression-tests.txt`, `baseline.tsv` (feature folder).
- `state.yaml`: `base_sha`, `iter`, `heal_iter`, flags, `checks:` (last verdict + iter + gate dir per check).
- `_project.yaml` `available_skills:` / agent types.

## Phase A · Compile gate (coordinator, sequential, blocking, self-healing)

1. Check the `lists:` hashes in `state.yaml` against `git hash-object` of `files-touched.txt`, `regression-tests.txt`, `verify-plan.yaml` and `.claude/specs/_gate.cmds` — a mismatch means someone other than the spec-writer edited them → verdict `block` (gap: "spec lists edited outside the spec-writer"), no gate run. Exception: a new or changed `_gate.cmds` the user approved (SKILL.md) — the coordinator re-records its hash right after the approval. Then run the gate — deterministic, no LLM, short stdout. Use a Bash timeout of 600000 ms (each check is capped by `GATE_CHECK_TIMEOUT`, default 300 s); for suites known to take longer, raise `GATE_CHECK_TIMEOUT` and run it with `run_in_background`.
   ```bash
   F=.claude/specs/<mod>/<feat>
   bash <skill-dir>/scripts/gate.sh \
     --out $F/verify/iter-N-gate \            # heal re-runs: $F/verify/iter-N-heal-M-gate
     --base <base_sha> --baseline $F/baseline.tsv \
     --allowlist $F/files-touched.txt --also-tests $F/regression-tests.txt \
     [--since <previous iter's last gate dir>/hashes.tsv]   # iter > 1, for incremental re-verify
   ```
   It covers what `pre-merge-check` did (lint + typecheck + tests, workspace dependents included, mypy, go vet), the Files-touched allowlist (verdict rule 1) and related-feature regression tests (verdict rule 3). Paths in `baseline.tsv` — work that is not this feature's — are ignored until the feature edits them. Its header has `touched: migrations=… deps=… ui=… api=…`. Stacks it cannot auto-detect use `.claude/specs/_gate.cmds`.
2. Read the result:

   | Gate result | Meaning | Action |
   |-------------|---------|--------|
   | exit 0 `PASS` | every applicable check ran and passed (SKIP lines are listed, never hidden) | step 3 |
   | exit 1, only BLOCK-class FAILs (`files-touched`, `regression-missing`) | compile and tests are fine; the feature broke a rule | no heal. Run Phase B normally (its gaps make the next iter productive), verdict = `block` by rule 1 / 3 |
   | exit 1, any HEAL-class FAIL (lint, typecheck, syntax, build, vet, types, tests, `regression …`) | code is broken | self-healing loop below; no Phase B. A line marked `(timeout)`: first re-run the gate once with `GATE_CHECK_TIMEOUT` doubled **and** `GATE_TOTAL_BUDGET=3600`, with `run_in_background` — slow infrastructure is not a code fault; still timing out → heal (it may be a hang) |
   | exit 3 `INCOMPLETE` | changed code no static check examined (skip is not pass) | default mode: stop (exit 12), ask for `.claude/specs/_gate.cmds` or the missing tool. `-y`: Phase A = `error`, continue, list the uncovered lines in the verdict |
   | exit 2 | coordinator error (missing list / baseline, bad base, malformed `_gate.cmds`) | fix the invocation; never treat as pass |
   | `unchecked:` line | schema/infra files (sql, prisma, graphql, proto, tf) the gate cannot check | not a failure; copy into the verdict's `uncovered:` — Phase B (migration-safety, review) must look at them |
   | `gate-artifacts:` line | files the checks themselves created (e.g. `tsc -b` output); the gate baselined them | not the feature's; suggest a `.gitignore` entry in the result's follow-ups |
   A gate line `SKIP … gate budget` (INCOMPLETE from the total budget, not from missing tools) → re-run the same command with `GATE_TOTAL_BUDGET=3600` and `run_in_background`, then read its result.
3. Gate green → if installed and applicable, dispatch `contract-drift-check` (`verify-plan.yaml` `workspaces ≥ 2`, or the diff touches a type in `contract_types`) and `null-safety-scan` together in ONE `model: sonnet` agent (§Check briefs). A `FAIL` from either is a HEAL-class Phase-A FAIL.

## Self-healing loop (Phase A, HEAL-class only)

Purpose: keep the loop unattended when a compile/test failure is deterministic and locally fixable, instead of writing an `ESCALATE` ticket a human has to unblock.

### Trigger
A HEAL-class Phase-A `FAIL` and the current heal-iter `M` is < `--max-heal-iters` (default 3).

### Packet contract — coordinator writes `build/iter-N-heal-M.md`

Built from the gate stdout (already in the coordinator's context — do not open the logs):

```yaml
heal_iter: M              # starts at 1 for the first self-heal in this iter
source_iter: N            # top-level build/verify iter — does NOT increment during self-heal
skill: gate:<check name> | contract-drift-check | null-safety-scan
verdict: FAIL
stack_trace: |
  <the failing excerpt from gate stdout, verbatim — file:line numbers intact>
paths_relative_to: <package dir the gate printed for this check>
full_log: <path printed by gate.sh>
gate_cmd: <the exact Phase-A gate command, for the implementer's local re-check>
files:                    # parsed from the excerpt — ONLY paths listed in files-touched.txt
  - path: apps/backend-api/src/user/user.controller.ts
    line: 42
hint: >
  One-line diagnosis. Example: "UserDto.email is now string | null but
  Profile.tsx line 17 dereferences it without a guard."
prompt: >
  Runtime engineering prompt handed to the implementer.
  Template — DO NOT modify wording, just fill the placeholders:
  "The previous code broke the {{skill}} step with this stack trace.
   Refactor the code, fix the type mismatch/syntax error, and re-run
   Stage 3 Verification. Do not swallow the trace with try/catch, do
   not loosen a type to hide the error, do not delete a test to make
   it pass. Fix the underlying cause and update only the files listed
   under `files:` unless a fix strictly requires more."
```

The excerpt is the failing lines only; `full_log` keeps the untruncated output for the implementer. Never paraphrase or trim inside the excerpt. A failing path outside the allowlist goes into `hint:` as context, never into `files:` — the implementer must not "fix" the user's or QA's files.

### Retry policy
- Cap = `--max-heal-iters` (default 3). Dispatch the implementer in heal mode with the packet path; then re-run Phase A into `verify/iter-N-heal-M-gate` (fresh logs each run).
- Heal-iter counter `M` increments per re-entry. The top-level iter `N` does NOT increment during self-heal.
- Phase A green at any heal-iter → Phase B in the same top-level iter.
- Heal-iter cap hit with Phase A still `FAIL`:
  - Escalate: top-level verdict = `block`, tag `SELF-HEAL-EXHAUSTED`.
  - Copy the last `iter-N-heal-M.md` into `verify/iter-N-verdict.md` under `## Self-heal trace`.
  - Jump to Stage 4 with the escalate tag; Stage 5 is skipped.

### What MUST NOT happen while self-healing
- No Phase-B checks. Their output would be misleading with a broken compile.
- Phase-A failure is never softened into `error` — that would bypass the loop. `error` is reserved for a check process crashing, not for the code being wrong.
- No truncation of the failing excerpt; the full log path always goes in the packet.
- The coordinator and check agents never edit code. Only the implementer does.

## Phase B · Parallel checks (coordinator dispatches, cap 6)

### Check catalogue

Run a check only when its trigger holds — `verify-plan.yaml` OR the gate's `touched:` line (either one is enough). Use the installed skill when `available_skills` lists it; otherwise the fallback. Never improvise a skill that is not installed.

| Check | Trigger | Model | Fallback if not installed |
|-------|---------|-------|---------------------------|
| `feature-review` | always | inherit | `reviewer` agent if defined, else general-purpose with the §Review brief |
| `security-audit` | always; full 42 rules when `security_scope: full` (auth, input handling, API or PII), else the rules `security.md` lists | inherit | `security-reviewer` agent if defined, else general-purpose with the §Security brief |
| `migration-safety` | `risk.migrations` or `touched: migrations=yes` | inherit | §Migration checklist added to the security agent's brief |
| mechanical batch: `complexity-check`, `dead-code-scan`, `test-coverage-delta`, `api-mock-parity` (`mocks: true` and api surface), `dependency-hygiene` (`touched: deps=yes`), `perf-budget` (`perf_budget: true`) | per item | sonnet | items whose skill is missing go to the review agent's brief as one checklist line each; record `skipped (not installed)` only if the review brief cannot cover them |
| `feature-qa` | `surfaces.ui` / `surfaces.api` or `touched: ui=yes / api=yes`, **and** every other check this iter is green (final candidate) | inherit | `flow-qa` if installed; else `skipped (not installed)` with a WARN in the verdict |
| second opinion | verdict would be `ship` AND (`risk.auth` / `risk.payments` / `risk.pii` / `risk.migrations` or `workspaces ≥ 3`) | inherit | — (always available: general-purpose agent). Skipped under `--no-fanout`. |

**Batch the mechanical checks into ONE agent** (one `model: sonnet` dispatch that reads each applicable SKILL.md and writes one file per check). Every agent costs a fresh context baseline; five tiny agents cost five baselines for the same coverage.

### After every check round — record check output, catch edits
Check agents must write only their own `verify/iter-N-<check>.md` (§Check briefs), but composed skills have their own habits (`docs/reviews/`, `docs/security/`, `docs/migrations/` …). So after the Phase-A skill step and after each Phase-B round, run:
```bash
bash <skill-dir>/scripts/gate.sh --write-baseline $F/baseline.tsv --base <base_sha> \
  --since <this iter's last gate dir>/hashes.tsv --allowlist $F/files-touched.txt
```
Reports, docs and config they wrote outside the allowlist become not-this-feature. Two outputs need action:
- `allowlisted-changed:` — a check agent edited feature files → verdict `block`, gap "check agent edited feature files: <paths>" (the implementer re-verifies them against the spec next iter).
- `allowlisted-changed: … (reverted to base)` — a check agent undid feature edits (e.g. `git checkout`, an unpopped stash) → same handling.
- `unexpected-code:` — a check agent changed code, schema, a dependency manifest or a lint/type/test tool config outside the allowlist. It is not baselined (the next gate flags it) and the implementer must not revert it (not its file) → default mode: stop (exit 13), show the paths, let the user decide — keep it (`/feature-loop revise` so the spec-writer adds it to `Files touched`) or discard it themselves; `-y`: escalate with the list.

### Incremental re-verify (iter > 1)

Nothing is committed between iters, so "what changed" comes from content hashes: each gate run writes `hashes.tsv`, and `--since <previous iter's last gate dir>/hashes.tsv` writes `changed-since.txt`. The paths changed since check X last ran = the union of `changed-since.txt` of every iter after that run (`cat … | sort -u` — a short list, fine to read). Re-run a check only if (a) its last verdict was `block` / `fail` / `error`, or (b) that union intersects its scope. Scope: review and security = any code file; migration-safety = migrations; dependency-hygiene = manifests/lockfiles; api-mock-parity = contracts, DTOs, mocks; the rest = changed source. A reused check keeps its earlier verdict, marked `(iter K)` in `skill_verdicts`. Review and security re-runs get the changed paths plus the full spec, and review those changes in context. `ship` requires every applicable check to hold a passing verdict for the final content.

### Final candidate: full suites, then `feature-qa`
When Phase A and every other Phase-B check are green: run the gate once more with **the same arguments as step 1 plus `--full`**, into `$F/verify/iter-N-full-gate` (full test suites, workspace-wide where configured — what `pre-merge-check` ran). A HEAL-class FAIL → self-heal loop as usual. Green → `feature-qa`, once — Playwright is the costliest check. A QA `FAIL` → `block`, each BUG-n becomes a gap, next iter; after the fix, QA re-runs (with the other checks per the incremental rule). Pass the `.claude/specs/<mod>/<feat>/` path as its source. The QA brief adds: (a) return only the ≤ 15-line summary — never the report body, even if it cannot write files (then return `status: error`); (b) screenshots stay inside the QA agent; (c) if the project's unit-test runner would collect its new specs (e.g. a vitest/jest `include` that matches `e2e/qa/**`), add the exclusion to that runner's config as part of its own changes, so later `--full` runs do not execute Playwright specs under the unit runner.

Right after `feature-qa` returns (pass or fail), record its artifacts (reports, specs, config edits) as not-this-feature, so later gates neither flag them nor run them as feature tests:
```bash
bash <skill-dir>/scripts/gate.sh --write-baseline $F/baseline.tsv --base <base_sha> \
  --since $F/verify/iter-N-full-gate/hashes.tsv --allowlist $F/files-touched.txt --include-code
```
`--include-code` because QA's Playwright specs and config edits are code. Allowlisted paths are never baselined — if QA edited a feature file it is listed as `allowlisted-changed:` and the next gate still sees it (treat it like a check agent edit).

## Check briefs

Every check agent is **read-only except for its one output file**: it writes only `verify/iter-N-<check>.md` — when a composed skill says to write a report under `docs/…`, put that content in the output file instead — and never edits code, specs or config. Every check agent gets: the spec paths it needs, the gate's `feature.diff` (this feature's changes only — baseline-filtered, untracked files included; never a raw `git diff <base_sha>`, which would also show the user's work and earlier queued features), for an incremental re-run the changed-path list, its output file `verify/iter-N-<check>.md`, the SKILL.md path of the skill it applies (or the brief below), Token budget rules 6–7, and the return contract. Each output file **starts with a fenced YAML block whose last key is `gaps:`** — the coordinator extracts it with `sed -n '/^gaps:/,/^```/p'`:

````markdown
```yaml
check: <name>
verdict: ship | block | pass | fail | error | skipped
head_sha: <git rev-parse HEAD>
gaps:
  - section: <spec section>
    expected: <spec line>
    actual: <what the code does>
    location: <file:line>
    severity: H | M | L
```
<free-form evidence below the fence>
````

**When `feature-review` is installed**, its brief adds: skip its step 4 ("Delegate the mechanical gates") — `pre-merge-check` is the Phase-A gate (give it the gate's PASS line and summary path, and use that for its step-7 `pre-merge-check` rule), and `security-audit` / `null-safety-scan` are separate checks in this stage. Running them again inside the review would duplicate tokens and could contradict Phase A. `system-design` may be applied inline when the diff crosses service boundaries.

**Review brief** (fallback for `feature-review`): read `index.md` (acceptance criteria, Files touched, Related features) and the concern files the diff touches; check each acceptance criterion against the code; flag any `try/catch`, retry, timeout, fallback or guard without a spec citation (severity M); map regression risk for every `Related features` row with `file:line` evidence; plus one checklist line per folded-in mechanical check.

**Security brief** (fallback for `security-audit`): read `security.md` (or its N/A line) and the diff. Check, with `file:line` evidence: authorization on every new or changed route, handler and query (including tenant/ownership scoping); input validation at the boundary; injection (SQL, shell, template, prompt, CSV); secrets or PII in code, logs, errors and responses; auth/session handling and uniform auth errors; any expected verdict `security.md` states. Severity H for auth bypass, cross-tenant access, injection, leaked secrets.

**Migration checklist** (folded into the security brief when `migration-safety` is missing): data loss (drops, narrowing types), locks on large tables (non-concurrent indexes, `NOT NULL` without default), unsafe backfills in the migration transaction, missing rollback/down path, RLS/policies on new tables.

**Second opinion:** a fresh agent with only the spec paths and the gate's `feature.diff` — never the other checks' results or the coordinator's leaning. Ask for severity-H gaps with spec-line citations. Record under `## Second opinion` in the verdict; a confirmed H gap → `block`.

## Verdict assembly (coordinator)

Write `verify/iter-N-verdict.md` from `templates/verdict.md` using: gate stdout (already in context), each check's return line, and the `gaps:` blocks of the check files (`sed -n '/^gaps:/,/^```/p' verify/iter-N-<check>.md`). Do not open full check reports; if two checks conflict, read only their two `gaps:` blocks. Update `state.yaml` `checks:` with each verdict + iter + gate dir.

```yaml
verdict: ship | block
iter: N
head_sha: <git rev-parse HEAD>
gate: PASS | FAIL | INCOMPLETE (<summary path>)
uncovered: [<gate SKIP lines that made it INCOMPLETE>]
gaps:
  - section: <spec section that failed>
    expected: <line from spec>
    actual: <what code does>
    location: <file:line>
    severity: H | M | L
    source: <check name>
regression_risk:
  - existing_feature: <name>
    risk: <description>
    evidence: <file:line>
    result: pass | fail
skill_verdicts:
  feature-review: ship | block | error | skipped (reason)
  security-audit: pass | fail | error | skipped (reason)
  ...                     # one line per catalogue check; reused ones marked (iter K)
files_touched_violation:
  - <file>                # from the gate's files-touched list
```

## Deterministic verdict rules (apply in order)
1. Any diff outside `Files touched` (gate `files-touched` FAIL) → `block`.
2. Any Phase-A check still `FAIL` at heal-iter cap → `block` with tag `SELF-HEAL-EXHAUSTED`.
3. Any related-feature regression test still failing (gate `regression …`, after the heal loop) or missing (`regression-missing`) → `block`.
4. Any `H`-severity gap → `block`.
5. Any Phase-B check returns `block` / `unsafe` / `broken` / `CRIT` / `fail` → `block`.
6. Otherwise → `ship`.

## Check error handling
- Individual check error (process crash, timeout of the agent, missing dep) → retry once, then `error` in `skill_verdicts`; do not block.
- Gate `INCOMPLETE` under `-y` counts as one `error`.
- ≥ 2 errors → escalate (top-level verdict = `block`, tag `error-escalation`).
- A Phase-A `FAIL` is NEVER an `error` — HEAL-class feeds the self-healing loop, BLOCK-class blocks.
- `skipped (not installed)` is not an error, but it is listed in the verdict and the result so a human sees the uncovered area.

## Exit conditions
- Verdict written, `state.yaml` updated.
- Verdict = `ship` → stage 4.
- Verdict = `block` AND iter < max → stage 2 with the verdict path as input.
- Verdict = `block` AND iter == max → stage 4 with `ESCALATE` tag; stage 5 skipped.
- Verdict = `block` tagged `SELF-HEAL-EXHAUSTED` → same as ESCALATE, but the result-writer copies `iter-N-heal-M.md` traces into the result so the next human touch has the exact failure in hand.
