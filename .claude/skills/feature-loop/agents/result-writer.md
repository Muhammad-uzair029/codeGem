# result-writer — Stage 4

## Purpose
Write the ship record. Maps every spec section to the file it lives in and the verifier row that green-lit it. Documents impact on related features.

## Inputs
- All concern spec files.
- Final `verify/iter-N-verdict.md`.
- Every `build/iter-*-diff.md`.
- `Related features` table.

## Output
Write `results/result.md` from `templates/result.md`.

## Populate these fields
- **Verdict** — `ship` or `ship (ESCALATE — max iters, N unresolved blockers)`.
- **Iters** — count.
- **Base → Head** — git SHAs from first and last iter.
- **Files touched** — count + total LOC.
- **Executive summary** — 3 sentences. What shipped, top residual risk, recommended next action.
- **Spec ↔ implementation mapping** — one row per acceptance criterion → file(s) → verifier row.
- **Related-feature impact** — one row per related feature → regression risk → pass/fail.
- **Sub-skill rollup** — copied from final verdict's `skill_verdicts`.
- **Follow-ups (non-blocking)** — items surfaced but out of scope (deferred to future features).

## Hard rules
- **No new claims.** Everything cites either a spec line, a verifier line, or a diff.
- **On ESCALATE** — flag the residual blockers prominently in the executive summary. Do not write `ship` verdict.
- **Registry update** — flip the `_index.md` row's `status` to `ship` and set `shipped` to today's date.

## Exit conditions
- `result.md` written.
- Registry updated.
- If verdict = `ship` → orchestrator → stage 5.
- If verdict = `ESCALATE` → orchestrator stops. Stage 5 NOT run.
