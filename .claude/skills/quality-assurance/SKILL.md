---
name: quality-assurance
description: Self-healing compilation verification engine. Runs the Stage-3 compile-gate (pre-merge-check + contract-drift-check + null-safety-scan) as a single composed step; on FAIL, pipes the raw stack trace back into the implementer for up to 3 self-healing retries before escalating. Use when the user types "quality-assurance", "/quality-assurance", "run the compile gate", "self-heal check", or as the Stage-3 phase-A block in `feature-loop`.
---

# quality-assurance — self-healing compilation verification engine

## What it is

The canonical entry point required by the client-side `.claude/`
blueprint. Composes the three compile-gate sub-skills that fire before
the parallel audit lane in `feature-loop` Stage 3. Wraps them in the
same self-healing loop the verifier uses so the same behavior is
available to the user as a stand-alone command.

## Composition (Phase A · compile-gate)

Runs sequentially, blocking on the first FAIL:

1. `pre-merge-check` — lint + typecheck + tests (TS/JS: eslint + tsc +
   vitest / jest; Python: ruff + mypy + pytest). Hard fail-fast.
2. `contract-drift-check` — cross-workspace type drift across
   `apps/frontend-ui`, `apps/backend-api`, `apps/ai-engine`.
3. `null-safety-scan` — unguarded property access, missing optional
   chaining, unchecked returns on the staged diff.

## Self-healing packet contract

On FAIL, this skill writes a `heal packet` (mirrored from
`feature-loop/agents/verifier.md § Self-healing loop`) and hands control
back to the implementer:

```yaml
heal_iter: <M>                # 1..max_heal_iters (default 3)
skill: pre-merge-check | contract-drift-check | null-safety-scan
verdict: FAIL
stack_trace: |
  <raw stdout+stderr, unedited>
files:
  - path: <file>
    line: <line>
hint: <one-line diagnosis>
prompt: |
  The previous code broke the {{skill}} step with this stack trace.
  Refactor the code, fix the type mismatch/syntax error, and re-run
  Stage 3 Verification. Do not swallow the trace with try/catch, do
  not loosen a type to hide the error, do not delete a test to make
  it pass. Fix the underlying cause and update only the files listed
  under `files:` unless a fix strictly requires more.
```

## Retry policy

- Cap = `--max-heal-iters` (default 3).
- Heal-iter counter `M` increments per re-entry. The top-level iter
  counter does NOT increment during self-heal.
- Cap hit with compile-gate still `FAIL` → verdict = `block` tagged
  `SELF-HEAL-EXHAUSTED`; feature-loop escalates.

## When to invoke

- Called by `feature-loop`'s verifier before Phase B fan-out.
- Standalone: run before opening a PR to catch compile / type / null
  failures without going through the full loop.

## Hard rules

- **Do not soften a Phase-A FAIL into `error`.** `error` is reserved for
  the sub-skill process crashing, not for the code being wrong.
- **Do not truncate the stack trace.** Implementers rely on exact line
  numbers.
- **Do not run Phase B while a Phase A skill still fails.** Their
  output would be misleading with a broken compile.

## Client-side contract

The client-side blueprint enforced by SkillFacet guarantees
this directory exists at every managed project:

```
[Client-Project-Root]/.claude/skills/quality-assurance/
```

Never rename or delete this dir in an injected project — the manager
re-creates it on the next injection pass.
