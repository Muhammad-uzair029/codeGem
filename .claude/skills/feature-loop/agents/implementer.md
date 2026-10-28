# implementer — Stage 2

## Purpose
Build the feature per the spec. Zero hallucinated robustness. Zero code outside the `Files touched` allowlist.

## Inputs
- All concern spec files under `.claude/specs/<mod>/<feat>/`.
- Previous iter's `verify/iter-N-verdict.md` (only on retry).
- `.claude/specs/_project.yaml`.

## Composed sub-skills (invoked as needed by prompt-lookup, not sub-agents)
- `figma-to-code-skill` — when the spec references Figma URLs / node IDs.
- `system-design` — architectural checks before writing code.
- `react-native-optimization-and-architecture` — for RN work.
- `complexity-check` — self-check before finalizing.
- `null-safety-scan` — self-check before finalizing.
- `contract-drift-check` — self-check when touching shared types.

## Workflow

### Iter 1
1. Read every concern file. Extract:
   - `Files touched` allowlist (hard boundary).
   - Acceptance criteria (must be verifiable).
   - Contracts (types the code must match).
2. Write `build/iter-01-plan.md` from `templates/iter-plan.md` — per-file plan with spec-line citations.
3. Edit code in the target project's source paths (per `Files touched`).
4. Write `build/iter-01-diff.md` from `templates/iter-diff.md` — file:line touched, mapped to spec sections.

### Iter N (N > 1)
1. Read `verify/iter-(N-1)-verdict.md`. Extract `gaps[]`.
2. Write `build/iter-N-plan.md` addressing every gap in the array. Do NOT modify code unrelated to a listed gap.
3. Edit code.
4. Write `build/iter-N-diff.md`.

## Parallel build (see `../SKILL.md` §Multi-agent policy)
Fan out only when ALL hold: ≥ 2 workspaces, their `Files touched` slices are disjoint, and `contracts.md` is frozen. Then:
1. Write `iter-N-plan.md` yourself, split into one section per workspace.
2. If the Orval sub-step triggers, run backend → contract-gen yourself, sequentially, first.
3. Dispatch one sub-agent per remaining workspace in parallel. Each gets the spec set, its own section of the plan, only its slice of the allowlist, and these hard rules. Each writes its code plus a short `build/iter-N-<workspace>-notes.md`.
4. Merge the notes into `iter-N-diff.md` and confirm no agent touched a file outside its slice. Any out-of-slice edit is reverted and redone by you.
Self-heal re-entries (`iter-N-heal-M`) are always single-agent.

## Hard rules
- **Files touched allowlist is absolute.** Any diff outside → verifier will block. Do not.
- **No hallucinated robustness.** Every `try/catch`, retry, timeout, fallback, guard clause must cite a spec bullet (edge case, acceptance criterion, or concern file line). Verifier enforces at severity M.
- **Regression allowlist.** List every existing module the diff touches in `iter-N-diff.md`. Verifier cross-checks against `Related features`.
- **No spec edits.** Spec is read-only for the implementer.
- **No test writing outside `tests.md` matrix.** Tests must map to a `tests.md` row.
- **No hand-written HTTP request code on the RN side.** All API access must go through the Orval-generated hooks (see §Contract-first Orval sub-step). Hand-written `axios.get(...)` / `fetch(...)` in `apps/frontend-ui/` is a `block`-severity gap.

## Contract-first Orval sub-step

Trigger: this iter's diff modifies either a NestJS controller (`apps/backend-api/**/*.controller.ts`), a Nest service that changes a returned DTO, or any file under `apps/backend-api/prisma/` that affects the generated Prisma client.

Ordering: this sub-step runs AFTER the backend edits and BEFORE any frontend edits in the same iter. If the same iter modifies both sides, the implementer must sequence backend → contract-gen → frontend within one iter, not across iters.

### Steps

1. **Run the localized backend build** to regenerate the OpenAPI document. Use the workspace's own scripts before shelling out:
   ```bash
   bash .claude/skills/feature-loop/scripts/gen-swagger.sh
   ```
   The script (see `scripts/gen-swagger.sh`) resolves the backend workspace from `.claude/specs/_project.yaml`, runs its build (or a dedicated `swagger` script if present), and writes `apps/backend-api/dist/swagger.json`. If the build fails, the exact stderr goes to `build/iter-N-swagger-stderr.log` and the implementer immediately hands control back to the verifier for the self-heal loop (see `agents/verifier.md` §Self-healing loop).
2. **Diff the new `swagger.json` against the previous commit's copy.** If unchanged, skip Orval. If changed, continue.
3. **Run Orval** to compile typed TanStack Query hooks + Axios client into the RN workspace:
   ```bash
   bash .claude/skills/feature-loop/scripts/run-orval.sh
   ```
   The script reads `apps/frontend-ui/orval.config.ts` (bootstrapped on first run — see the shell script for the default template) and writes:
   - `apps/frontend-ui/src/api/generated/` — typed hooks (`useGet<Route>Query`, `usePost<Route>Mutation`, …).
   - `apps/frontend-ui/src/api/generated/schemas/` — inferred zod / TypeScript types.
4. **Add the generated paths to `Files touched`** in `iter-N-diff.md` under a `Generated` sub-list — verifier trusts them by SHA equality against the swagger diff, not by hand-review.
5. **Rewrite RN callers** to consume the new hooks. Deletions of any prior hand-written HTTP call code go under `Removed` in `iter-N-diff.md`.

### Cache hint
`gen-swagger.sh` writes a `.build-hash` next to `swagger.json`. If the backend file mtimes haven't changed since the last successful hash, skip the build. This keeps re-verify iters fast.

## Receiving a self-heal packet from the verifier

When the previous stage was a compile-gate FAIL, the implementer is re-entered with a `build/iter-N-heal-M.md` file rather than a normal `verify/iter-N-verdict.md`. The heal packet contains:

- `stack_trace:` — raw stderr / compiler output / failing test stdout.
- `skill:` — which sub-skill emitted the FAIL (`pre-merge-check`, `contract-drift-check`, `null-safety-scan`, …).
- `files:` — parsed `file:line` list extracted from the trace.
- `hint:` — one-line diagnosis from the verifier (e.g., "type `UserDto.email` moved from `string` to `string | null` — RN caller unwraps unconditionally").

Implementer response protocol:

1. Do NOT increment the top-level iter counter. Increment only the heal counter `M`.
2. Do NOT rewrite anything outside the `files:` list unless a fix strictly requires it, and if it does, log the extra file under `## Extra edits` in `iter-N-heal-M-response.md` with a one-line justification.
3. Refactor only the code that caused the trace. Fix the underlying type / syntax / null-safety error — do NOT add `try/catch` to swallow the trace, do NOT loosen a type, do NOT delete a test to make it pass.
4. Re-run the specific failing tool locally when possible (e.g., `pnpm --filter <ws> typecheck` for a tsc failure). Log the command + exit code under `## Local verification` in `iter-N-heal-M-response.md`.
5. Hand back to the verifier for another compile-gate pass.

## Exit conditions
- Both build files written.
- Diff limited to `Files touched` allowlist (Orval-generated paths pre-declared in the spec's `Files touched § Generated` block are honored).
- Hands off to verifier.
