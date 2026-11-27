# implementer — Stage 2

## Purpose
Build the feature per the spec. Zero hallucinated robustness. Zero code outside the `Files touched` allowlist.

## Inputs (read only what your mode needs — Token budget rules 6–7 in `../SKILL.md`)
- **Iter 1:** `index.md`, `contracts.md`, `tests.md`, `files-touched.txt`, and the concern files that exist for this feature (non-applicable concerns are one line in `index.md` § Concerns not applicable).
- **Iter N > 1:** `verify/iter-(N-1)-verdict.md` + only the spec sections its `gaps[]` cite + `files-touched.txt`. Do not re-read every concern file.
- **Heal mode:** the `build/iter-N-heal-M.md` packet + the files it lists; open its `full_log` only if the excerpt is not enough.
- `.claude/specs/_project.yaml` (workspaces, `available_skills`).

Return the ≤ 15-line summary from `../SKILL.md` §Token budget rule 3 — never the diff.

## Composed sub-skills (invoked as needed by prompt-lookup, not sub-agents; only those in `available_skills`)
- `figma-to-code-skill` — when the spec references Figma URLs / node IDs.
- `system-design` — architectural checks before writing code.
- `react-native-optimization-and-architecture` — for RN work.
- `complexity-check` — self-check before finalizing.
- `null-safety-scan` — self-check before finalizing.
- `contract-drift-check` — self-check when touching shared types.

## Workflow

### Iter 1
1. Read `index.md`, `contracts.md`, `tests.md` and the concern files that exist for this feature. Extract:
   - `Files touched` allowlist (hard boundary).
   - Acceptance criteria (must be verifiable).
   - Contracts (types the code must match).
2. Write `build/iter-01-plan.md` from `templates/iter-plan.md` — per-file plan with spec-line citations.
3. Edit code in the target project's source paths (per `Files touched`).
4. Write `build/iter-01-diff.md` from `templates/iter-diff.md` — file:line touched, mapped to spec sections.
5. Optional local check: the `gate_cmd:` from your brief with `--out .claude/specs/<mod>/<feat>/build/iter-N-local/`, never direct builds/emitters — same reason as heal step 4. Run it in the foreground (Bash timeout 600000) and make no edits until it returns: files created while a gate runs are treated as the checks' own output. Parallel workspace agents do **not** run it (concurrent gates would race on the baseline); only the lead implementer, in its merge pass.

### Iter N (N > 1)
1. Read `verify/iter-(N-1)-verdict.md`. Extract `gaps[]`, then open only the spec sections and files those gaps cite.
2. Write `build/iter-N-plan.md` addressing every gap in the array. Do NOT modify code unrelated to a listed gap.
   - A `files_touched_violation` gap: revert only paths that appear in your own earlier `build/iter-*-diff.md` / workspace notes. Never `git checkout`, `git clean`, `git stash`, `rm` or rewrite any other path — it may be the user's work or a tool's output. List such paths under `blocking:` in your return (`status: blocked`).
3. Edit code.
4. Write `build/iter-N-diff.md`.

## Parallel build (see `../SKILL.md` §Multi-agent policy)
Fan out only when ALL hold: ≥ 2 workspaces, their `Files touched` slices are disjoint, and `contracts.md` is frozen. You cannot spawn agents — the coordinator does. So:
1. As the lead implementer, write `iter-N-plan.md` split into one section per workspace.
2. If the Orval sub-step triggers, do backend → contract-gen yourself, sequentially, first.
3. Return `fanout:` with one line per remaining workspace: `<workspace> → build/iter-N-<workspace>-notes.md`. The coordinator dispatches one implementer per workspace in parallel; each gets the spec paths, its own plan section, only its slice of the allowlist, and these hard rules, and writes its code plus its notes file.
4. The coordinator then re-dispatches you (merge mode) to fold the notes into `iter-N-diff.md` and to confirm each workspace agent stayed in its slice: compare its notes with `git diff --name-only` restricted to that workspace. An edit outside its slice but inside the overall allowlist is reverted and redone by you. Edits outside the overall allowlist are also caught by `gate.sh --allowlist`.
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
   bash <skill-dir>/scripts/gen-swagger.sh
   ```
   The script (see `scripts/gen-swagger.sh`) resolves the backend workspace from `.claude/specs/_project.yaml`, runs its build (or a dedicated `swagger` script if present), and writes `apps/backend-api/dist/swagger.json`. If the build fails, the exact stderr goes to `build/iter-N-swagger-stderr.log` and the implementer immediately returns `status: blocked` with that log path; the coordinator feeds it into the self-heal loop (see `agents/verifier.md` §Self-healing loop).
2. **Diff the new `swagger.json` against the previous commit's copy.** If unchanged, skip Orval. If changed, continue.
3. **Run Orval** to compile typed TanStack Query hooks + Axios client into the RN workspace:
   ```bash
   bash <skill-dir>/scripts/run-orval.sh
   ```
   The script reads `apps/frontend-ui/orval.config.ts` (bootstrapped on first run — see the shell script for the default template) and writes:
   - `apps/frontend-ui/src/api/generated/` — typed hooks (`useGet<Route>Query`, `usePost<Route>Mutation`, …).
   - `apps/frontend-ui/src/api/generated/schemas/` — inferred zod / TypeScript types.
4. **List the generated paths** in `iter-N-diff.md` under a `Generated` sub-list — verifier trusts them by SHA equality against the swagger diff, not by hand-review. They must already be pre-declared in the spec's `Generated` block (and so in `files-touched.txt`, as dir lines ending in `/`); the gate fails any that are not. If Orval writes to an undeclared path, return `status: blocked` naming it — the coordinator re-dispatches the spec-writer to declare it. Never edit the spec yourself.
5. **Rewrite RN callers** to consume the new hooks. Deletions of any prior hand-written HTTP call code go under `Removed` in `iter-N-diff.md`.

### Cache hint
`gen-swagger.sh` writes a `.build-hash` next to `swagger.json`. If the backend file mtimes haven't changed since the last successful hash, skip the build. This keeps re-verify iters fast.

## Receiving a self-heal packet

When the previous stage was a compile-gate FAIL, the implementer is re-entered with a `build/iter-N-heal-M.md` file rather than a normal `verify/iter-N-verdict.md`. The heal packet contains:

- `stack_trace:` — the failing excerpt of the gate output, verbatim; `full_log:` points at the untruncated log.
- `skill:` — which check emitted the FAIL (`gate:<check>` from `scripts/gate.sh`, `contract-drift-check`, `null-safety-scan`, …).
- `files:` — parsed `file:line` list extracted from the trace, limited to allowlisted files; paths in the trace are relative to `paths_relative_to:`.
- `hint:` — one-line diagnosis from the verifier (e.g., "type `UserDto.email` moved from `string` to `string | null` — RN caller unwraps unconditionally").

Implementer response protocol:

1. Do NOT increment the top-level iter counter. Increment only the heal counter `M`.
2. Do NOT rewrite anything outside the `files:` list unless a fix strictly requires it, and if it does, log the extra file under `## Extra edits` in `iter-N-heal-M-response.md` with a one-line justification.
3. Refactor only the code that caused the trace. Fix the underlying type / syntax / null-safety error — do NOT add `try/catch` to swallow the trace, do NOT loosen a type, do NOT delete a test to make it pass.
4. Verify locally with the gate command from the packet (`gate_cmd:`, its `--out` pointed at `.claude/specs/<mod>/<feat>/build/iter-N-heal-M-local/`) — it runs the same checks, keeps output short, and records any build output the checks create as not-this-feature. Do not run builds or emitters (`tsc -b`, bundlers, codegen) directly: their output would appear as out-of-allowlist files. Run the gate in the foreground (Bash timeout 600000) and make no edits until it returns. Log the command + exit code under `## Local verification` in `iter-N-heal-M-response.md`.
5. Return your summary; the coordinator re-runs the Phase-A gate.

## Exit conditions
- Both build files written.
- Diff limited to `Files touched` allowlist (Orval-generated paths pre-declared in the spec's `Files touched § Generated` block are honored).
- Returns the ≤ 15-line summary to the coordinator, which runs Stage 3.
