# verifier — Stage 3

## Purpose
Grade the current iter's code against the spec. Verdict is deterministic — no soft calls.

## Inputs
- Spec set under `.claude/specs/<mod>/<feat>/`.
- Current iter's code diff (from `build/iter-N-diff.md`).
- `Related features` table (from `index.md`).

## Composed sub-skills (fan-out, cap 6 concurrent Agent tool calls)

The verifier runs in two ordered phases per iter. Phase A (compile-gate) is a fast, blocking pre-flight that feeds the self-healing loop; phase B (parallel audit) only runs once phase A is green.

### Phase A · Compile-gate (sequential, blocking, self-healing)
- `pre-merge-check` — lint + typecheck + tests. Hard fail-fast.
- `contract-drift-check` — cross-workspace type drift.
- `null-safety-scan` — null / undef / None on the diff.

### Phase B · Parallel audit (fan-out, cap 6)
- `feature-review` — regression-risk map, approach critique.
- `api-mock-parity` — mocks vs backend contracts.
- `complexity-check` — ceilings.
- `security-audit` — full 42-rule gate + `security.md` expected verdicts.
- `test-coverage-delta` — new-lines coverage.
- `dead-code-scan` — unused exports.
- `perf-budget` — bundle / p95 / startup (if applicable).
- `migration-safety` — if migrations touched.
- `dependency-hygiene` — if deps changed.
- `feature-qa` — if the feature has a UI or HTTP surface: autonomous Playwright E2E against the spec set (pass the `.claude/specs/<mod>/<feat>/` path as its source). Its `report.md` verdict FAIL → `block`, with each BUG-n as a gap.

Skip sub-skills that don't apply (e.g., no migrations → skip migration-safety).

## Self-healing loop (Phase A only)

Purpose: keep the loop unattended when a compile/test failure is deterministic and locally fixable, instead of writing an `ESCALATE` ticket a human has to unblock.

### Trigger
Any Phase-A sub-skill returns `FAIL` and the current heal-iter `M` is < `--max-heal-iters` (default 3).

### Packet contract — write `build/iter-N-heal-M.md`

```yaml
heal_iter: M              # starts at 1 for the first self-heal in this iter
source_iter: N            # top-level build/verify iter — does NOT increment during self-heal
skill: pre-merge-check | contract-drift-check | null-safety-scan
verdict: FAIL
stack_trace: |
  <raw stdout+stderr, verbatim, unedited, unquoted-shell-safe>
files:                    # parsed from the trace, best-effort
  - path: apps/backend-api/src/user/user.controller.ts
    line: 42
  - path: apps/frontend-ui/src/screens/Profile.tsx
    line: 17
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

### Retry policy
- Cap = `--max-heal-iters` (default 3).
- Heal-iter counter `M` increments per re-entry. The top-level iter `N` does NOT increment during self-heal.
- If phase A goes green at any heal-iter, proceed to Phase B in the same top-level iter.
- If heal-iter cap hits with Phase A still `FAIL`:
  - Escalate: top-level verdict = `block`, tag `SELF-HEAL-EXHAUSTED`.
  - Copy the last `iter-N-heal-M.md` into `verify/iter-N-verdict.md` under `## Self-heal trace` so the paper trail is complete.
  - Orchestrator jumps to Stage 4 with the escalate tag; Stage 5 (learnings) is skipped.

### What the verifier MUST NOT do while self-healing
- Do not run Phase B sub-skills. Their output would be misleading with a broken compile.
- Do not soften Phase-A failure into `error` — that would bypass the loop. `error` is reserved for the sub-skill process crashing, not for the code being wrong.
- Do not truncate the stack trace. Implementers rely on the exact line numbers.
- Do not mutate code. Only the implementer edits code; the verifier only diagnoses.

## Independent second opinion (high-risk features)
Before writing a `ship` verdict, check whether the feature touches auth, payments, PII, DB migrations, or ≥ 3 workspaces. If it does, dispatch one fresh sub-agent as an independent reviewer. Give it only the spec set and the diff, never your phase-B results or your leaning. Ask it for severity-H gaps with spec-line citations. Any confirmed severity-H gap turns the verdict into `block` and goes into `gaps[]`. Record the reviewer's result in `verify/iter-N-verdict.md` under `## Second opinion`. Skipped under `--no-fanout`.

## Regression enforcement
For every row in `Related features`, re-run that related feature's `tests.md` targets. Any failure → verdict = `block`.

## Verdict shape
Write `verify/iter-N-verdict.md` from `templates/verdict.md`:

```yaml
verdict: ship | block
iter: N
head_sha: <git rev-parse HEAD>
gaps:
  - section: <spec section that failed>
    expected: <line from spec>
    actual: <what code does>
    location: <file:line>
    severity: H | M | L
regression_risk:
  - existing_feature: <name>
    risk: <description>
    evidence: <file:line>
    result: pass | fail
skill_verdicts:
  feature-review: ship | block | error
  security-audit: pass | fail | error
  ...
files_touched_violation:
  - <file:line>
```

## Deterministic verdict rules (apply in order)
1. Any diff outside `Files touched` → `block`.
2. Any Phase-A skill still `FAIL` at heal-iter cap → `block` with tag `SELF-HEAL-EXHAUSTED`.
3. Any related-feature test fails → `block`.
4. Any `H`-severity gap → `block`.
5. Any Phase-B sub-skill returns `block` / `unsafe` / `broken` / `CRIT` → `block`.
6. Otherwise → `ship`.

## Sub-skill error handling
- Individual sub-skill error (process crash, timeout, missing dep) → mark `error` in `skill_verdicts`, do not block.
- ≥ 2 sub-skills error → escalate (top-level verdict = `block`, tag `error-escalation`).
- A `FAIL` from a Phase-A skill is NEVER an `error` — it feeds the self-healing loop instead.

## Exit conditions
- Verdict written.
- Verdict = `ship` → orchestrator → stage 4.
- Verdict = `block` AND iter < max → orchestrator → stage 2 with `gaps[]` as input.
- Verdict = `block` AND iter == max → orchestrator → stage 4 with `ESCALATE` tag; stage 5 skipped.
- Verdict = `block` tagged `SELF-HEAL-EXHAUSTED` → same as ESCALATE, but the result-writer copies `iter-N-heal-M.md` traces into the result so the next human touch has the exact failure in hand.
