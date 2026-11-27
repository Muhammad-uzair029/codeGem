---
name: feature-loop
description: Autonomous 6-stage feature-development loop for any Claude Code project. Reads a raw brief from `.claude/specs/inbox/<slug>.md` (or a `--from-doc <path>` one-off), splits multi-feature PRDs, brainstorms with zero hallucination against every existing spec, writes a concern-decomposed spec set, builds the feature, verifies against the spec with regression checks, writes a result, and auto-updates skills from what it learned. Two human gates only — `split-approve` (multi-feature PRDs) and `approve` (post-brainstorm). Use when the user types "feature-loop", "/feature-loop", "/feature-loop <mod>/<feat>", "build this feature", "spec this feature", "run the loop", "ship this brief", or drops a document under `.claude/specs/inbox/`.
---

# feature-loop — autonomous feature-development loop

## What it is

The team's senior-engineer-in-a-box. Point it at a rough feature brief; it produces a production-grade spec, ships the code, verifies against the spec, and updates the skill ecosystem from what it learned. Two pauses for you by default: PRD split approval (only if the input is multi-feature) and post-brainstorm approval. With `--force-autonomous` (`-y`) both gates collapse and the loop runs end-to-end unattended.

**You — the session that loaded this skill — are the coordinator.** `<skill-dir>` below = the directory this SKILL.md was loaded from (the skill's base directory — `.claude/skills/feature-loop` in a project install, `~/.claude/skills/feature-loop` in a global one); scripts are `<skill-dir>/scripts/…`. You route work, dispatch stage agents, and keep `state.yaml`. You do not do stage work yourself. Read §Token budget before anything else; it is what keeps a run affordable.

## Runtime flags

| Flag | Behavior |
|------|----------|
| `--force-autonomous`, `-y` | Zero human gates. Stage -1 auto-approves its own split proposal (dependency order = source-doc order unless the doc dictates otherwise). Stage 0 auto-resolves every non-`BLOCKING` open question with safe-default engineering assumptions (standard error boundaries, empty/loading/error component states, idempotent retries at network boundaries only, feature-flag off by default, uniform auth error strings, artificial delay on auth paths) and advances to Stage 1 without waiting. `BLOCKING` questions still halt — they represent missing product intent that assumptions cannot invent. Every auto-resolved question is stamped `resolution: auto-default (<rule cited>)` in `open-questions.md` so reviewers can audit after the fact. |
| `--from-doc <path>` | Treat `<path>` as the brief regardless of location. |
| `--from-spec <mod>/<feat>` | Skip stages 0–1; resume from stage 2 with the existing spec set. |
| `--verify-only <mod>/<feat>` | Run stage 3 alone against the current diff. Base = `state.yaml` `base_sha`; without a state file, `git merge-base HEAD <default branch>` (origin/HEAD → main → master) and an **empty** baseline created with `: > baseline.tsv` — never `--write-baseline`, which would record the feature itself as not-this-feature. Noted in the verdict. |
| `--dry-learnings <mod>/<feat>` | Stage 5 inspection mode; do not touch skill or template files. |
| `--full-spec` | Stage 1 writes every concern file, including `N/A` ones (default: only applicable concerns get a file; see `agents/spec-writer.md`). |
| `--max-iters N` | Override build/verify iter cap (default 3). |
| `--max-heal-iters N` | Override Stage 3 self-healing retry cap (default 3). |
| `--max-agents N` | Override per-stage sub-agent concurrency (default 6, ceiling 10). See §Multi-agent policy. |
| `--no-fanout` | One agent per stage step; Stage-3 checks run one after another. |

## When to invoke

- User types `/feature-loop <module>/<feature>` — start (or resume).
- User drops a doc in `.claude/specs/inbox/<slug>.md` and says "run it".
- User says "build this feature", "spec this feature", "run the loop", "ship this brief".
- User provides a PRD or design doc and asks Claude to turn it into working code.
- Never invoke on generic questions ("what does X do?"), on code review ("review this PR" → `feature-review`), or on incident work.

## Token budget — coordinator rules (hard)

Measured on real runs: 80–95% of a run's tokens were the coordinator's own context being re-read every turn (median 380–475k tokens per turn) because it read source, screenshots and PDFs and did the building itself. Stage agents start clean and end; the coordinator lives for the whole run. So:

1. **Coordinator never does stage work.** It does not edit code or spec files, and does not `Read` source files, spec bodies, diffs, images, PDFs, or logs.
   - **Reads only:** `state.yaml`, `.claude/specs/_project.yaml`, `.claude/specs/_queue.yaml`, the feature's `verify-plan.yaml` (spec facts it decides on), `files-touched.txt` membership via `grep -Fx` (heal-packet filtering), gate `changed-since.txt` lists, small manifests (≤ 100 lines) for workspace detection, agent return summaries, `gate.sh` stdout, the `gaps:` blocks of Stage-3 check files (`sed -n '/^gaps:/,/^```/p'` — the block ends at its fence), and the BLOCKING count (`sed -n '/^## BLOCKING/,/^## /p' open-questions.md | grep -c '^- '`).
   - **Writes only:** `state.yaml`, `_project.yaml`, `_queue.yaml`, `verify/iter-N-verdict.md`, heal packets, the gate baseline (via `gate.sh --write-baseline`), and `revise` feedback appended to `brief-refined.md` with a shell append (no read).
2. **Only the coordinator dispatches agents.** Sub-agents cannot spawn sub-agents (0 of 199 recorded sub-agent runs did). A stage that needs parallel work returns a `fanout:` request in its summary; the coordinator dispatches those agents, then the stage's merge step. Never tell a stage agent to "fan out".
3. **Every agent returns ≤ 15 lines** in this shape — detail stays in the files it wrote:
   ```
   status: ok | blocked | error
   wrote: [<paths>]
   verdict: <ship|block|pass|fail|single-feature|split-proposed|n/a>
   gaps: H=<n> M=<n> L=<n>            # counts only; full gaps live in the file
   blocking: [<one line each, max 5>]
   auto_resolved: <n>                  # brainstormer under -y
   fanout: [<scope → output file>]     # only when requesting parallel work
   next: <suggested next step>
   ```
   Put the return contract in every brief. If an agent returns more, do not echo or re-quote it.
4. **`state.yaml` is the memory** (template `templates/state.yaml`, at `.claude/specs/<mod>/<feat>/state.yaml`), including the run flags (`-y`, `--no-fanout`, `--max-agents`, `--max-iters`, `--max-heal-iters`, `--dry-learnings`, `--full-spec`). Update it after every dispatch returns. Resume = read `state.yaml` and continue with its saved flags (flags passed on the resume command override them); never reconstruct state by reading the paper trail.
5. **One feature per context.** A PRD split's queue lives in `.claude/specs/_queue.yaml` (template `templates/queue.yaml`) — not in any feature's state, so it survives `/clear`. After a feature reaches `done` or `escalated`, pop it from the queue; in default mode print `next: /clear, then /feature-loop` (no-arg resumes the queue) and stop; under `-y`, continue in place (the coordinator holds only summaries).
6. **Media and big inputs stay inside the agent that needs them.** PDF/DOCX briefs are converted once to `.claude/specs/inbox/<slug>.md` (Stage -1/0 agent) and everyone reads the text. Screenshots and Figma images are read only by the agent whose task needs them, once each. Never re-read a file already read in the same context.
7. **Command output goes to files.** Any command expected to print > 50 lines (tests, builds, installs, Playwright) is redirected to `.claude/specs/<mod>/<feat>/logs/` and inspected with `grep`/`tail`. Applies to every agent.
8. **Pick the model per dispatch** (Stage map `Model` column). `inherit` = omit the `model` parameter. Judgement-heavy work (brainstorm, spec, build, review, security, QA, second opinion) always inherits.

## Stage map

| Stage | Agent playbook | Trigger | Model | Human pause? | Paper trail root |
|-------|----------------|---------|-------|--------------|------------------|
| -1 | `agents/prd-splitter.md` | Input doc is multi-feature | sonnet | ✅ `split-approve` — skipped under `-y` | `.claude/specs/inbox/_split-<date>.md` |
| 0 | `agents/brainstormer.md` | Every feature | inherit | ✅ `approve` — skipped under `-y` | `.claude/specs/<mod>/<feat>/{brief-refined,user-journeys,edge-cases,open-questions}.md` |
| 1 | `agents/spec-writer.md` | After stage-0 approval | inherit | — | `.claude/specs/<mod>/<feat>/index.md` + applicable concern files + `files-touched.txt` + `regression-tests.txt` + `verify-plan.yaml` |
| 2 | `agents/implementer.md` | After stage 1; every retry | inherit | — | Code diff + `build/iter-N-*.md` |
| 3 | `agents/verifier.md` (coordinator procedure + check-agent briefs) | After every stage-2 iter | gate: no LLM · checks: see verifier | — | `verify/iter-N-*.md` |
| 4 | `agents/result-writer.md` | Verdict = `ship` or escalation | sonnet | — | `results/result.md` |
| 5 | `agents/learnings.md` | Verdict = `ship` and something to learn | sonnet | — | `learnings/<YYYY-MM-DD>-learnings.md` + skill/template patches (fork-on-write into target project's `.claude/skills/`) |

Fan-out agents that write a file must be `general-purpose` (`Explore` cannot write). Stage-0 research / code-survey agents, edge-case category agents and concern-file writers all feed judgement stages: `general-purpose`, inherit the main model; each writes its own file, every claim with a `file:line` citation. Sonnet is used only where the Stage map says so.

## How to run

### 0. Resolve target project and workspace layout

- Target project = the current working directory (where the user invoked the command). Never write outside it.
- On first run, detect workspaces (coordinator, from small manifests only): read `CLAUDE.md` hints → `pnpm-workspace.yaml` / `turbo.json` → `package.json` workspaces → `pyproject.toml` → single-root fallback. Cache the answer at `.claude/specs/_project.yaml` (schema in design doc §3).
- Same pass: record `available_skills:` in `_project.yaml` — which composed skills (§Composition) are actually installed (`.claude/skills/<name>/SKILL.md` in the project or `~/.claude/skills/`, or an enabled plugin), and which agent types exist (`reviewer`, `security-reviewer`, `qa-tester`). Stages use this list; a skill not on it is never "run" — it is skipped or covered by its fallback (see `agents/verifier.md`).
- On subsequent runs, read the cache. Re-detect only if `CLAUDE.md`, root manifests, or `_project.yaml` itself is newer than the cache.

### 1. Route input

- `state.yaml` exists for the slug → resume at its `stage` (see `commands/feature-loop.md` routing).
- No arg → if `.claude/specs/_queue.yaml` has pending features, continue with the first; else look for the newest file in `.claude/specs/inbox/` and prompt for a `<mod>/<feat>` slug.
- `<mod>/<feat>` arg → use `.claude/specs/inbox/<mod>/<feat>.md` (or `.claude/specs/inbox/<feat>.md` if not module-scoped in inbox yet).
- `--from-doc <path>` → treat `<path>` as the brief, regardless of location. Non-text (PDF/DOCX) → the Stage -1/0 agent converts it once to `inbox/<slug>.md` (rule 6).

### 2. Detect multi-feature PRD

Dispatch **prd-splitter** (`model: sonnet`). It applies the detection rules in `agents/prd-splitter.md` — the coordinator does not scan the doc itself.

- `split-proposed` → write `_queue.yaml` with `status: awaiting-split-approve` and the run flags; wait for `/feature-loop split-approve` (skipped under `-y`). Then dispatch the prd-splitter in **materialize mode** (it writes one inbox file per row from the source doc), set the queue `status: approved`, and run features sequentially (rule 5).
- `single-feature` → stage 0.

### 3. Stage 0 — brainstormer

Dispatch **brainstormer** per feature (see `agents/brainstormer.md`). It emits four files (`brief-refined.md`, `user-journeys.md`, `edge-cases.md`, `open-questions.md`). If it returns a `fanout:` request (≥ 3 related features or ≥ 2 workspaces), dispatch the research agents in parallel, then re-dispatch the brainstormer in merge mode with the research file paths.

**Default mode.** Halt. Print to stdout:
```
brainstorm complete — .claude/specs/<mod>/<feat>/
review, then run:
  /feature-loop approve <mod>/<feat>          # continue
  /feature-loop revise <mod>/<feat> "…"       # send back with feedback
```

Do NOT auto-continue.

**Under `--force-autonomous` / `-y`.** Do NOT halt. Instead:
1. Count BLOCKING questions deterministically (rule 1's `sed … | grep -c`), not from the agent's return: any `BLOCKING` question still halts the loop and exits 30 — safe defaults cannot invent missing product intent (e.g., "which payment provider?", "which retention window?").
2. For every non-`BLOCKING` question, the brainstormer must have already stamped a `resolution: auto-default (<rule>)` line pointing at a safe-default rule (see `agents/brainstormer.md` §Auto-default catalog).
3. Emit `[auto-approve]` to stdout with the `auto_resolved` count from the brainstormer's return, then advance directly to stage 1.

### 4. Stage 1 — spec-writer

On `approve`, dispatch **spec-writer** (see `agents/spec-writer.md`). It writes `index.md`, `contracts.md`, the applicable concern files, `files-touched.txt` (the allowlist, one path per line), `regression-tests.txt` (related features' test files) and `verify-plan.yaml` (the spec facts Stage 3 decides on: risk flags, surfaces, workspace count, contract types, budgets — the coordinator reads this instead of spec bodies), and appends a row to `.claude/specs/_index.md` (`templates/registry-row.md`). Multi-workspace features: it writes `index.md` + `contracts.md` first and returns `fanout:` with one concern file per agent; dispatch those in parallel, then re-dispatch the spec-writer for its consistency pass.

### 5. Stages 2–3 — build/verify/self-heal loop

Before the first iter — **only when `state.yaml` has no `base_sha` yet** (never on a resume, `--from-spec` after an escalation, or a retry; the gate also refuses to overwrite an existing baseline): record `base_sha` (`git rev-parse HEAD`), record the hashes of `files-touched.txt`, `regression-tests.txt`, `verify-plan.yaml` and `.claude/specs/_gate.cmds` (if present) in `state.yaml` `lists:` (`git hash-object`), then record what is already changed and is not this feature's (the user's uncommitted work, earlier queued features):
```bash
bash <skill-dir>/scripts/gate.sh --write-baseline .claude/specs/<mod>/<feat>/baseline.tsv --base <base_sha>
```
`--from-spec` / `--verify-only` on a spec set without `files-touched.txt`, `regression-tests.txt` or `verify-plan.yaml` (written before these existed): dispatch the spec-writer in **lists mode** (main model — it derives the risk flags that decide the second opinion and the full security audit) to derive them from `index.md` first — the gate fails closed without them. Whenever the spec-writer rewrites a list, re-record its hash in `lists:`; before every gate run, compare — a list changed by anyone else → verdict `block`, gap "spec lists edited outside the spec-writer". A changed or new `_gate.cmds` (the user adds one after an INCOMPLETE stop): default mode — show its lines and ask before using it, then re-record its hash; `-y` — `block`.

Loop until verdict = `ship` or `iter == --max-iters` (default 3):

1. Dispatch **implementer** (see `agents/implementer.md`); the lead implementer's brief (never a parallel workspace agent's) includes `gate_cmd:` (the exact Phase-A gate command) for its local checks. Iter 1 gets the spec set; iter N > 1 gets only `verify/iter-(N-1)-verdict.md` + the spec sections its gaps cite. It writes code + `build/iter-N-plan.md` + `build/iter-N-diff.md`, running the **contract-first Orval sub-step** when the diff touches NestJS controllers or Prisma DTOs. Parallel per-workspace builds come back as a `fanout:` request (see implementer §Parallel build).
2. Run **Stage 3** exactly as `agents/verifier.md` describes:
   - **Phase A** — you run `scripts/gate.sh` (lint + typecheck + related tests incl. monorepo dependents + Files-touched allowlist + regression tests; no LLM). HEAL-class FAIL (anything but `files-touched` / `regression-missing`, including related-feature regression tests — as `pre-merge-check`'s full suite was) and heal-iter < `--max-heal-iters` → write `build/iter-N-heal-M.md` from the gate summary and re-dispatch the implementer in heal mode (heal-iter increments; the iter counter does NOT). BLOCK-class FAIL (`files-touched`, `regression-missing`) → no heal; verdict `block`. INCOMPLETE (exit 3) → see the failure-mode table. Then the installed Phase-A skills (`contract-drift-check`, `null-safety-scan`) when they apply.
   - **Phase B** — dispatch the applicable checks in parallel (cap 6), incremental on iter > 1. Once everything else is green: the gate with `--full`, then `feature-qa` — once, on that final candidate.
   - Assemble `verify/iter-N-verdict.md` with the deterministic rules.
3. Verdict = `ship` → step 6. Verdict = `block` and iter < max → next iter. Verdict = `block` and iter == max → **escalate**: result-writer with `ESCALATE` tag. Heal-iter cap hit without a green gate → same escalate path, tagged `SELF-HEAL-EXHAUSTED`.

### 6. Stage 4 — result-writer

Dispatch **result-writer** (`model: sonnet`, see `agents/result-writer.md`). Writes `results/result.md` from `templates/result.md`.

### 7. Stage 5 — learnings

On `ship` only, and only if this feature had something to learn: any gap (any severity) in any iter, any heal iter, or any `error` check. A first-iter clean ship has nothing that the pattern rules could trigger on — skip, record `learnings: skipped (clean ship)` in `state.yaml`. Otherwise dispatch **learnings** (`model: sonnet`, see `agents/learnings.md`). Learnings agent may patch `<target-project>/.claude/skills/<skill>/SKILL.md` (fork-on-write from installed plugin defaults) and template files under `<target-project>/.claude/specs/_templates/`. Safety rails: max 1 patch per skill per feature; additive/tightening only; every patch prefixed with `<!-- learned: <mod>/<feat> <date> -->`; > 40 LOC → deferred, not applied.

## Slash commands (routed to `commands/feature-loop.md`)

- `/feature-loop <mod>/<feat>` — start or resume (from `state.yaml`).
- `/feature-loop --from-doc <path> <mod>/<feat>` — one-off doc anywhere.
- `/feature-loop split-approve` — accept PRD split proposal (edit `_split-*.md` first if needed).
- `/feature-loop approve <mod>/<feat>` — pass stage-0 gate.
- `/feature-loop revise <mod>/<feat> "<feedback>"` — brainstormer re-runs.
- `/feature-loop --from-spec <mod>/<feat>` — resume from stage 2 (skip 0–1).
- `/feature-loop --verify-only <mod>/<feat>` — stage 3 alone.
- `/feature-loop --dry-learnings <mod>/<feat>` — see stage-5 patch plan without applying.
- `/feature-loop --full-spec <mod>/<feat>` — write every concern file, `N/A` ones included.
- `/feature-loop --max-iters N` — override build/verify iter cap.
- `/feature-loop --max-heal-iters N` — override stage-3 self-healing retry cap.
- `/feature-loop --max-agents N` — override per-stage sub-agent concurrency.
- `/feature-loop --no-fanout` — one agent per stage step.
- `/feature-loop -y <mod>/<feat>` / `/feature-loop --force-autonomous <mod>/<feat>` — end-to-end unattended run: skip `split-approve` and `approve` gates, auto-resolve non-`BLOCKING` questions with safe defaults.

Measure a run: `python3 -I <skill-dir>/scripts/usage.py` (per-session coordinator vs sub-agent tokens; see the script header).

## Composition — sub-skills invoked at runtime

`feature-loop` is an orchestrator. It calls these skills **when they are installed** (`_project.yaml` `available_skills:`). Read their SKILL.md for their own rules. A missing skill is never improvised — its fallback in `agents/verifier.md` §Check catalogue applies, or it is skipped and the skip is recorded in the verdict.

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
- `pre-merge-check` — superseded in Phase A by `scripts/gate.sh` (same lint/typecheck/tests, deterministic, no LLM)
- `feature-qa` — end-to-end Playwright QA with a report (verifier, UI/HTTP features; `flow-qa` is the fallback when installed)
- `adr-writer` — nudged by learnings when a new pattern lands
- `feature-audit` — orchestrator sibling; `feature-loop` does NOT invoke `feature-audit` to avoid recursion. Verifier composes the same underlying sub-skills directly.

## Multi-agent policy

Every stage step runs in its own agent (fresh context). **Fan-out** means more than one agent for a step, in parallel — use it **only when the work splits into independent pieces**, and then without asking. Stage agents request fan-out with `fanout:`; the coordinator dispatches (Token budget rule 2).

### When to fan out (per stage)

| Stage | Fan out when | One agent per | Merge step |
|-------|--------------|---------------|------------|
| 0 · brainstormer | ≥ 3 related features found, OR brief touches ≥ 2 workspaces | Related feature (read its spec + code, return relation + shared contracts with citations), and/or workspace (read-only code survey). For large briefs, also split the 9 edge-case categories across ≤ 3 agents. | Brainstormer (merge mode) writes the 4 output files; every claim keeps its citation. |
| 1 · spec-writer | Feature touches ≥ 2 workspaces | Concern file (`frontend-ui`, `backend-api`, `ai-engine`, `security`, `tests`, `telemetry`, `rollout`, …) | `index.md` + `contracts.md` — written FIRST by the spec-writer, then frozen and handed to every concern agent. Spec-writer (consistency mode) checks all concern files. |
| 2 · implementer | ≥ 2 workspaces AND their `Files touched` sets are disjoint AND `contracts.md` is frozen | Workspace (gets only its slice of the `Files touched` allowlist) | The lead implementer writes `iter-N-plan.md`, runs backend → contract-gen **sequentially first** (Orval rule); workspace agents run after; the lead's merge pass checks each agent stayed in its slice, and `gate.sh --allowlist` catches anything outside the overall allowlist. |
| 3 · verifier | Always (Phase B) — see `agents/verifier.md` | Check (mechanical checks batched into one agent) | Coordinator assembles one verdict. |
| 3 · verifier (second opinion) | Verdict would be `ship` AND feature touches auth, payments, PII, DB migrations, or ≥ 3 workspaces | One fresh **independent reviewer** given only the spec set + diff — never the other checks' conclusions | A confirmed severity-H gap turns the verdict into `block` with that gap in `gaps[]`. |

### When NOT to fan out

- Feature is small: 1 workspace and ≤ 5 files in `Files touched`.
- Pieces share files, or one piece needs another's output (sequence them instead).
- The work is one self-heal retry (keep heal fixes single-agent — `files:` list is narrow by design).
- `--no-fanout` was passed.

### How to brief a sub-agent

Each sub-agent knows only what its prompt says. Every brief includes: the goal, the exact spec file paths to read (paths — never pasted content), its slice of the `Files touched` allowlist (implementer only), the hard rules that apply (no hallucinated robustness, cite spec lines), the single output file it must write, the ≤ 15-line return contract, and Token budget rules 6–7. Never pass a sub-agent the coordinator's hypothesis to "confirm" — give it the evidence.

### Limits

- **Concurrency ≤ 6** per stage (override with `--max-agents N`, hard ceiling 10).
- **Depth 1.** Only the coordinator dispatches. A sub-agent may *invoke a skill* (e.g. read and follow `feature-review`), but never spawns agents, `feature-loop` or `feature-audit`.
- A sub-agent that errors or times out is retried once. If it fails again, the coordinator does not take the work over itself (rule 1): a Stage-3 check → `error` per `agents/verifier.md`; a fan-out piece → the merge step notes it as missing and the stage returns `blocked` if the piece was required; any other stage agent (stages -1, 0, 1, 2, 4) → halt with exit 40, `state.yaml` unchanged except a `log:` line, and print the resume command; stage 5 → skip learnings, note it in `state.yaml`.
- Log every fan-out in `state.yaml` `log:`: `fan-out: <N> agents — <scope → output file>` one line each.

## Templates

Every markdown artifact the loop emits is copied from a template under `templates/`:

- `brief-refined.md`, `user-journeys.md`, `edge-cases.md`, `open-questions.md` — brainstormer outputs.
- `index.md`, `frontend-ui.md`, `backend-api.md`, `ai-engine.md`, `contracts.md`, `security.md`, `code-audit.md`, `telemetry.md`, `tests.md`, `rollout.md` — spec-writer outputs.
- `module-index.md`, `registry-row.md` — module-level scaffolding.
- `iter-plan.md`, `iter-diff.md`, `verdict.md` — build/verify paper trail.
- `result.md`, `learnings.md` — stage 4/5 outputs.
- `state.yaml`, `queue.yaml` — coordinator state (per feature; PRD-split queue at `.claude/specs/_queue.yaml`).

Sub-agents copy the template, string-substitute `{{FIELD_NAME}}` placeholders, and write to `.claude/specs/<mod>/<feat>/…`.

## Portability

- All paths resolve from the **target project's root** — never the plugin install location.
- First-run bootstrap creates `.claude/specs/` and `.claude/specs/inbox/` in the target project.
- Stage-5 skill patches land in the target project's `.claude/skills/` (fork-on-write). The installed plugin source is never mutated.
- `scripts/gate.sh` auto-detects JS/TS, Python and Go. Any other stack: put `name: command` lines in `.claude/specs/_gate.cmds`.

## Hard rules

- **Coordinator stays thin** — §Token budget rules 1–3 are not optional, including under `-y`.
- **One report, one verdict per iter.** Never surface conflicting verdicts from sub-skills without reconciling.
- **Never modify code outside the spec's `Files touched` allowlist.** `gate.sh --allowlist` flags it; verdict = `block`.
- **Never add retry/fallback/guard logic without a spec-line citation.** Verifier enforces (severity M).
- **Never edit an existing skill without going through the learnings sub-agent's safety rails.** Direct edits are forbidden.
- **Sub-agents cannot spawn agents or `feature-loop`.** Guard against recursion.
- **Never "run" a composed skill that is not installed.** Use its fallback or record the skip.
- **Heal packets target only allowlisted files.** A path outside `files-touched.txt` (the user's work, QA artifacts) is never handed to the implementer to "fix".
- **Sub-agent concurrency ≤ 6 per stage** (`--max-agents N` to change, ceiling 10). Fan-out rules for every stage live in §Multi-agent policy.
- **Two human gates only** (default). `split-approve` and `approve`. No other pauses in the pipeline. Both gates are suppressed under `--force-autonomous` / `-y`; a `BLOCKING` question in stage 0 still halts because assumptions cannot invent missing product intent.

## Failure modes + recovery

| Failure | Behavior |
|---------|----------|
| Brainstormer has `BLOCKING` open questions | Stop, print questions, wait for `revise`. |
| Spec-writer emits any `TBD` | Retry once with tighter spec-line grounding; if still `TBD`, log to `open-questions.md` and abort stage 1. |
| Implementer diff exceeds `Files touched` | `gate.sh` FAIL `files-touched` (BLOCK-class, no heal) → verdict `block`. Next iter the implementer reverts only violation paths that appear in its own `build/iter-*-diff.md` / notes; any other violation path (edited by someone else during the run, or a tool artifact) is never touched — it returns `blocked` listing them, and the coordinator stops (default) or escalates (`-y`) with the list. Paths in the baseline (pre-existing work, QA output, gate artifacts) are never counted. |
| Verifier check errors out | Mark that check `error`, do not block on it. ≥ 2 check errors → escalate. |
| Composed skill not installed | Fallback from verifier §Check catalogue, or `skipped (not installed)` in `skill_verdicts`. Never improvised. |
| `gate.sh` exit 3 `INCOMPLETE` (changed code no static check examined — unknown stack, missing toolchain or `node_modules`, no runner for regression tests) | If the only uncovered lines are `gate budget` cuts: re-run with `GATE_TOTAL_BUDGET=3600` in the background first — that is not an error. Otherwise skip is not pass. Default mode: stop (exit 12, `state.yaml` stays at `verify`) and ask for `.claude/specs/_gate.cmds` or the missing tool; the next `/feature-loop <mod>/<feat>` re-runs Phase A. Under `-y`: Phase A = `error` (counts toward the ≥ 2-errors escalation), continue, and list the uncovered items in the verdict and result. |
| `gate.sh` exit 2 | Coordinator error (missing allowlist/baseline/regression list, bad base, malformed `_gate.cmds`, baseline already written, or a stale `baseline.tsv.lock` left by a killed gate — remove it when no gate is running). Fix the invocation or run lists mode — never treat as pass; if it cannot be fixed, halt with exit 40. |
| `gate.sh` not found (exit 127) | Wrong `<skill-dir>` — resolve it from the skill's base directory, never assume `.claude/skills/`. |
| Stage agent (stages -1, 0, 1, 2, 4) fails twice | Halt, exit 40, resume command printed; `state.yaml` keeps the stage. |
| Max iters reached still `block` | Write partial `result.md` tagged `ESCALATE`. Print blockers to stdout. |
| Self-healing retry cap hit with gate still `FAIL` | Write partial `result.md` tagged `SELF-HEAL-EXHAUSTED`. Copy last `iter-N-heal-M.md` into the result. |
| `--force-autonomous` and Stage 0 emits a `BLOCKING` question | Halt (exit 30). Assumptions cannot invent missing product intent. |
| Figma MCP unreachable during Stage 1 | Fall back to text-only spec; write a `WARN` line in `frontend-ui.md` under `## Figma parity`. Do NOT block the stage. |
| `swagger.json` build fails during implementer Orval sub-step | Feed error into self-healing loop (same channel as the gate). |
| Learnings patch > 40 LOC | Deferred, not applied. Written to learnings MD `Deferred` section. |
| Related-feature test failure | `gate.sh` runs `regression-tests.txt` (`regression …`, HEAL-class — the self-heal loop fixes the code, never the test); still failing at the heal cap, or a listed test file missing (`regression-missing`, BLOCK-class) → verdict = `block`. Cannot proceed even if all other checks pass. |

## Related design doc

Source of truth for behavior + rationale: `docs/superpowers/specs/2026-07-27-feature-loop-design.md`. Read that when in doubt. Where it conflicts with §Token budget or the coordinator-dispatch rules here, this file wins (those rules postdate it).
