---
name: feature-loop
description: Autonomous 6-stage feature-development loop for any Claude Code project. Reads a raw brief from `.claude/specs/inbox/<slug>.md` (or a `--from-doc <path>` one-off), splits multi-feature PRDs, brainstorms with zero hallucination against every existing spec, writes a concern-decomposed spec set, builds the feature, verifies against the spec with regression checks, writes a result, and auto-updates skills from what it learned. Two human gates only — `split-approve` (multi-feature PRDs) and `approve` (post-brainstorm). Use when the user types "feature-loop", "/feature-loop", "/feature-loop <mod>/<feat>", "build this feature", "spec this feature", "run the loop", "ship this brief", or drops a document under `.claude/specs/inbox/`.
---

# feature-loop — autonomous feature-development loop

## What it is

The team's senior-engineer-in-a-box. Point it at a rough feature brief; it produces a production-grade spec, ships the code, verifies against the spec, and updates the skill ecosystem from what it learned. Two pauses for you by default: PRD split approval (only if the input is multi-feature) and post-brainstorm approval. With `--force-autonomous` (`-y`) both gates collapse and the loop runs end-to-end unattended.

## Runtime flags

| Flag | Behavior |
|------|----------|
| `--force-autonomous`, `-y` | Zero human gates. Stage -1 auto-approves its own split proposal (dependency order = source-doc order unless the doc dictates otherwise). Stage 0 auto-resolves every non-`BLOCKING` open question with safe-default engineering assumptions (standard error boundaries, empty/loading/error component states, idempotent retries at network boundaries only, feature-flag off by default, uniform auth error strings, artificial delay on auth paths) and advances to Stage 1 without waiting. `BLOCKING` questions still halt — they represent missing product intent that assumptions cannot invent. Every auto-resolved question is stamped `resolution: auto-default (<rule cited>)` in `open-questions.md` so reviewers can audit after the fact. |
| `--from-doc <path>` | Treat `<path>` as the brief regardless of location. |
| `--from-spec <mod>/<feat>` | Skip stages 0–1; resume from stage 2 with the existing spec set. |
| `--verify-only <mod>/<feat>` | Run stage 3 alone against the current diff. |
| `--dry-learnings <mod>/<feat>` | Stage 5 inspection mode; do not touch skill or template files. |
| `--max-iters N` | Override build/verify iter cap (default 3). |
| `--max-heal-iters N` | Override Stage 3 self-healing retry cap (default 3). |
| `--max-agents N` | Override per-stage sub-agent concurrency (default 6, ceiling 10). See §Multi-agent policy. |
| `--no-fanout` | Run every stage single-agent (stage-3 phase B runs its sub-skills sequentially). |

## When to invoke

- User types `/feature-loop <module>/<feature>` — start (or resume).
- User drops a doc in `.claude/specs/inbox/<slug>.md` and says "run it".
- User says "build this feature", "spec this feature", "run the loop", "ship this brief".
- User provides a PRD or design doc and asks Claude to turn it into working code.
- Never invoke on generic questions ("what does X do?"), on code review ("review this PR" → `feature-review`), or on incident work.

## Stage map

| Stage | Agent playbook | Trigger | Human pause? | Paper trail root |
|-------|----------------|---------|--------------|------------------|
| -1 | `agents/prd-splitter.md` | Input doc is multi-feature | ✅ `split-approve` — skipped under `-y` | `.claude/specs/inbox/_split-<date>.md` |
| 0 | `agents/brainstormer.md` | Every feature | ✅ `approve` — skipped under `-y` | `.claude/specs/<mod>/<feat>/{brief-refined,user-journeys,edge-cases,open-questions}.md` |
| 1 | `agents/spec-writer.md` | After stage-0 approval | — | `.claude/specs/<mod>/<feat>/{index,frontend-ui,backend-api,ai-engine,contracts,security,code-audit,telemetry,tests,rollout}.md` |
| 2 | `agents/implementer.md` | After stage 1; every retry | — | Code diff + `build/iter-N-*.md` |
| 3 | `agents/verifier.md` | After every stage-2 iter | — | `verify/iter-N-verdict.md` |
| 4 | `agents/result-writer.md` | Verifier verdict = `ship` | — | `results/result.md` |
| 5 | `agents/learnings.md` | Verifier verdict = `ship` | — | `learnings/<YYYY-MM-DD>-learnings.md` + skill/template patches (fork-on-write into target project's `.claude/skills/`) |

## How to run

### 0. Resolve target project and workspace layout

- Target project = the current working directory (where the user invoked the command). Never write outside it.
- On first run, detect workspaces: read `CLAUDE.md` hints → `pnpm-workspace.yaml` / `turbo.json` → `package.json` workspaces → `pyproject.toml` → single-root fallback. Cache the answer at `.claude/specs/_project.yaml` (schema in design doc §3).
- On subsequent runs, read the cache. Re-detect only if `CLAUDE.md`, root manifests, or `_project.yaml` itself is newer than the cache.

### 1. Route input

- No arg → look for the newest file in `.claude/specs/inbox/` and prompt for a `<mod>/<feat>` slug.
- `<mod>/<feat>` arg → use `.claude/specs/inbox/<mod>/<feat>.md` (or `.claude/specs/inbox/<feat>.md` if not module-scoped in inbox yet).
- `--from-doc <path>` → treat `<path>` as the brief, regardless of location.

### 2. Detect multi-feature PRD

Scan input doc for multi-feature markers (headings matching `/^#+\s*(Feature|Milestone|Phase|Epic)\s+\d+/i`, numbered top-level H2/H3s each with their own goals + acceptance, explicit `## Table of contents` block listing ≥ 2 features).

- If multi-feature → dispatch **prd-splitter** sub-agent (see `agents/prd-splitter.md`). Wait for `/feature-loop split-approve`. Then queue features sequentially.
- If single-feature → skip to stage 0.

### 3. Stage 0 — brainstormer

Dispatch **brainstormer** sub-agent per feature (see `agents/brainstormer.md`). It emits four files (`brief-refined.md`, `user-journeys.md`, `edge-cases.md`, `open-questions.md`).

**Default mode.** Halt. Print to stdout:
```
brainstorm complete — .claude/specs/<mod>/<feat>/
review, then run:
  /feature-loop approve <mod>/<feat>          # continue
  /feature-loop revise <mod>/<feat> "…"       # send back with feedback
```

Do NOT auto-continue.

**Under `--force-autonomous` / `-y`.** Do NOT halt. Instead:
1. Inspect `open-questions.md`. Any question tagged `BLOCKING` still halts the loop and exits 30 — safe defaults cannot invent missing product intent (e.g., "which payment provider?", "which retention window?").
2. For every non-`BLOCKING` question, the brainstormer must have already stamped a `resolution: auto-default (<rule>)` line pointing at a safe-default rule (see `agents/brainstormer.md` §Auto-default catalog).
3. Emit `[auto-approve]` to stdout with the count of auto-resolved questions, then advance directly to stage 1.

### 4. Stage 1 — spec-writer

On `approve`, dispatch **spec-writer** sub-agent (see `agents/spec-writer.md`). It writes every concern file (see §10 of the design doc). It also appends a row to `.claude/specs/_index.md` (use `templates/registry-row.md`).

### 5. Stages 2–3 — build/verify/self-heal loop

Loop until verdict = `ship` or `iter == --max-iters` (default 3):

1. Dispatch **implementer** (see `agents/implementer.md`) with the spec set (and the previous iter's `verify/iter-N-verdict.md` on retry). Implementer writes code + `build/iter-N-plan.md` + `build/iter-N-diff.md`. When the diff touches NestJS Controllers or Prisma DTOs, implementer runs the **contract-first sub-step** (see `agents/implementer.md` §Contract-first Orval sub-step): localized workspace build → `swagger.json` → `npx orval` → typed TanStack Query / Axios hooks land in the RN workspace.
2. Dispatch **verifier** (see `agents/verifier.md`). Verifier first runs the **compile-gate sub-stage** (`pre-merge-check`, `contract-drift-check`, `null-safety-scan`); if any of those return `FAIL` and heal-iter < `--max-heal-iters` (default 3), verifier packages the exact CLI/compiler/test stderr into `build/iter-N-heal-M.md` and hands control back to the implementer with the runtime engineering prompt described in `agents/verifier.md` §Self-healing loop. Heal-iter increments; the normal iter counter does NOT. Once compile-gate passes (or heal-iter cap hit), verifier fans out to the remaining sub-skills in parallel (`feature-review`, `security-audit`, `api-mock-parity`, `complexity-check`, `test-coverage-delta`, `dead-code-scan`, `perf-budget`, `migration-safety`, `dependency-hygiene`, `feature-qa`) via the `Agent` tool, cap 6 concurrent. Verifier writes `verify/iter-N-verdict.md`.
3. Verdict = `ship` → step 6. Verdict = `block` and iter < max → next iter with `gaps[]` as implementer input. Verdict = `block` and iter == max → **escalate**: skip to result-writer with `ESCALATE` tag. Heal-iter cap hit without compile-gate green → same escalate path, tagged `SELF-HEAL-EXHAUSTED`.

### 6. Stage 4 — result-writer

Dispatch **result-writer** sub-agent (see `agents/result-writer.md`). Writes `results/result.md` from `templates/result.md`.

### 7. Stage 5 — learnings

On `ship` only. Dispatch **learnings** sub-agent (see `agents/learnings.md`). Learnings agent may patch `<target-project>/.claude/skills/<skill>/SKILL.md` (fork-on-write from installed plugin defaults) and template files under `<target-project>/.claude/specs/_templates/`. Safety rails: max 1 patch per skill per feature; additive/tightening only; every patch prefixed with `<!-- learned: <mod>/<feat> <date> -->`; > 40 LOC → deferred, not applied.

## Slash commands (routed to `commands/feature-loop.md`)

- `/feature-loop <mod>/<feat>` — start or resume.
- `/feature-loop --from-doc <path> <mod>/<feat>` — one-off doc anywhere.
- `/feature-loop split-approve` — accept PRD split proposal (edit `_split-*.md` first if needed).
- `/feature-loop approve <mod>/<feat>` — pass stage-0 gate.
- `/feature-loop revise <mod>/<feat> "<feedback>"` — brainstormer re-runs.
- `/feature-loop --from-spec <mod>/<feat>` — resume from stage 2 (skip 0–1).
- `/feature-loop --verify-only <mod>/<feat>` — stage 3 alone.
- `/feature-loop --dry-learnings <mod>/<feat>` — see stage-5 patch plan without applying.
- `/feature-loop --max-iters N` — override build/verify iter cap.
- `/feature-loop --max-heal-iters N` — override stage-3 self-healing retry cap.
- `/feature-loop --max-agents N` — override per-stage sub-agent concurrency.
- `/feature-loop --no-fanout` — run every stage single-agent.
- `/feature-loop -y <mod>/<feat>` / `/feature-loop --force-autonomous <mod>/<feat>` — end-to-end unattended run: skip `split-approve` and `approve` gates, auto-resolve non-`BLOCKING` questions with safe defaults.

## Composition — sub-skills invoked at runtime

`feature-loop` is an orchestrator. It calls these skills (installed alongside it in the target project). Read their SKILL.md for their own rules:

- `figma-to-code-skill` — Figma → React Native code (implementer)
- `system-design` — cross-service design invariants (implementer + verifier)
- `react-native-optimization-and-architecture` — RN best practices (implementer)
- `feature-review` — regression-risk map + approach critique (verifier)
- `security-audit` — 42-rule OWASP gate (verifier + spec-writer for `security.md`)
- `contract-drift-check` — cross-workspace type drift (verifier)
- `api-mock-parity` — mocks vs contracts (verifier)
- `complexity-check` — complexity ceilings (verifier)
- `null-safety-scan` — null/undef/None (verifier)
- `test-coverage-delta` — new-lines coverage (verifier)
- `perf-budget` — perf budgets (verifier)
- `dead-code-scan` — unused code (verifier)
- `migration-safety` — DB migrations (verifier)
- `dependency-hygiene` — third-party deps (verifier)
- `feature-qa` — end-to-end Playwright QA with a report (verifier, UI/HTTP features)
- `adr-writer` — nudged by learnings when a new pattern lands
- `feature-audit` — orchestrator sibling; `feature-loop` does NOT invoke `feature-audit` to avoid recursion. Verifier composes the same underlying sub-skills directly.

## Multi-agent policy

The loop runs single-threaded by default. Fan out to parallel sub-agents (via the `Agent` tool) **only when the work splits into independent pieces** — then fan out without asking. Bigger or riskier features should use more agents; small ones should use none.

### When to fan out (per stage)

| Stage | Fan out when | One agent per | Coordinator still owns |
|-------|--------------|---------------|------------------------|
| 0 · brainstormer | ≥ 3 related features found, OR brief touches ≥ 2 workspaces | Related feature (read its spec + code, return relation + shared contracts with citations), and/or workspace (read-only code survey). For large briefs, also split the 9 edge-case categories across ≤ 3 agents. | Merging into the 4 output files; every claim keeps its citation. |
| 1 · spec-writer | Feature touches ≥ 2 workspaces | Concern file (`frontend-ui`, `backend-api`, `ai-engine`, `security`, `tests`, `telemetry`, `rollout`, …) | `index.md` + `contracts.md` — written FIRST, single writer, then frozen and handed to every concern agent. Final consistency pass across all concern files. |
| 2 · implementer | ≥ 2 workspaces AND their `Files touched` sets are disjoint AND `contracts.md` is frozen | Workspace (gets only its slice of the `Files touched` allowlist) | `iter-N-plan.md` / `iter-N-diff.md`, sequencing, and the Orval rule: backend → contract-gen → frontend stays **sequential**; only work after contract-gen may run in parallel. |
| 3 · verifier | Always (phase B) — already defined in `agents/verifier.md` | Sub-skill | One reconciled verdict. |
| 3 · verifier (second opinion) | Verdict would be `ship` AND feature touches auth, payments, PII, DB migrations, or ≥ 3 workspaces | One fresh **independent reviewer** given only the spec set + diff — never the verifier's conclusions | If it finds a severity-H gap, verdict becomes `block` with that gap in `gaps[]`. |

### When NOT to fan out

- Feature is small: 1 workspace and ≤ 5 files in `Files touched`.
- Pieces share files, or one piece needs another's output (sequence them instead).
- The work is one self-heal retry (keep heal fixes single-agent — `files:` list is narrow by design).
- `--no-fanout` was passed.

### How to brief a sub-agent

Each sub-agent knows only what its prompt says. Every brief includes: the goal, the exact spec file paths to read, its slice of the `Files touched` allowlist (implementer only), the hard rules that apply (no hallucinated robustness, cite spec lines), and the single output file it must write. Sub-agents write to files; the coordinator reads and reconciles them. Never pass a sub-agent the coordinator's hypothesis to "confirm" — give it the evidence.

### Limits

- **Concurrency ≤ 6** per stage (override with `--max-agents N`, hard ceiling 10).
- **Nesting depth ≤ 2.** A sub-agent may invoke a composing skill (e.g. `feature-review`), but nothing spawns `feature-loop` or `feature-audit`.
- A sub-agent that errors or times out is retried once; if it fails again, the coordinator does that piece itself and notes it in the stage's output.
- Log every fan-out in the stage's paper trail: `fan-out: <N> agents — <one line per agent: scope → output file>`.

## Templates

Every markdown artifact the loop emits is copied from a template under `templates/`:

- `brief-refined.md`, `user-journeys.md`, `edge-cases.md`, `open-questions.md` — brainstormer outputs.
- `index.md`, `frontend-ui.md`, `backend-api.md`, `ai-engine.md`, `contracts.md`, `security.md`, `code-audit.md`, `telemetry.md`, `tests.md`, `rollout.md` — spec-writer outputs.
- `module-index.md`, `registry-row.md` — module-level scaffolding.
- `iter-plan.md`, `iter-diff.md`, `verdict.md` — build/verify paper trail.
- `result.md`, `learnings.md` — stage 4/5 outputs.

Sub-agents copy the template, string-substitute `{{FIELD_NAME}}` placeholders, and write to `.claude/specs/<mod>/<feat>/…`.

## Portability

- All paths resolve from the **target project's root** — never the plugin install location.
- First-run bootstrap creates `.claude/specs/` and `.claude/specs/inbox/` in the target project.
- Stage-5 skill patches land in the target project's `.claude/skills/` (fork-on-write). The installed plugin source is never mutated.

## Hard rules

- **One report, one verdict per iter.** Never surface conflicting verdicts from sub-skills without reconciling.
- **Never modify code outside the spec's `Files touched` allowlist.** Verifier flags any such diff as `block`.
- **Never add retry/fallback/guard logic without a spec-line citation.** Verifier enforces (severity M).
- **Never edit an existing skill without going through the learnings sub-agent's safety rails.** Direct edits are forbidden.
- **Sub-agents cannot spawn `feature-loop`.** Guard against recursion.
- **Sub-agent concurrency ≤ 6 per stage** (`--max-agents N` to change, ceiling 10). Fan-out rules for every stage live in §Multi-agent policy.
- **Two human gates only** (default). `split-approve` and `approve`. No other pauses in the pipeline. Both gates are suppressed under `--force-autonomous` / `-y`; a `BLOCKING` question in stage 0 still halts because assumptions cannot invent missing product intent.

## Failure modes + recovery

| Failure | Behavior |
|---------|----------|
| Brainstormer has `BLOCKING` open questions | Stop, print questions, wait for `revise`. |
| Spec-writer emits any `TBD` | Retry once with tighter spec-line grounding; if still `TBD`, log to `open-questions.md` and abort stage 1. |
| Implementer diff exceeds `Files touched` | Verifier flags `block`. Implementer fixes in next iter. |
| Verifier sub-skill errors out | Mark that sub-skill `error`, do not block on it. ≥ 2 sub-skill errors → escalate. |
| Max iters reached still `block` | Write partial `result.md` tagged `ESCALATE`. Print blockers to stdout. |
| Self-healing retry cap hit with compile-gate still `FAIL` | Write partial `result.md` tagged `SELF-HEAL-EXHAUSTED`. Copy last `iter-N-heal-M.md` into the result. |
| `--force-autonomous` and Stage 0 emits a `BLOCKING` question | Halt (exit 30). Assumptions cannot invent missing product intent. |
| Figma MCP unreachable during Stage 1 | Fall back to text-only spec; write a `WARN` line in `frontend-ui.md` under `## Figma parity`. Do NOT block the stage. |
| `swagger.json` build fails during implementer Orval sub-step | Feed error into self-healing loop (same channel as compile-gate). |
| Learnings patch > 40 LOC | Deferred, not applied. Written to learnings MD `Deferred` section. |
| Related-feature test failure | Verdict = `block`. Cannot proceed even if all other checks pass. |

## Related design doc

Source of truth for behavior + rationale: `docs/superpowers/specs/2026-07-27-feature-loop-design.md`. Read that when in doubt.
