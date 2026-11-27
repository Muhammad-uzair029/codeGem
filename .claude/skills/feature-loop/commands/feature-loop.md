---
name: feature-loop
description: Autonomous feature-development loop — takes a raw brief, brainstorms, specs, builds, verifies, ships, and self-updates skills. Two human gates (split-approve, approve); everything else autonomous.
---

# /feature-loop — command surface

Invoke the master SKILL (`../SKILL.md`) to run the pipeline. This file only describes the command surface; behavior lives in the skill.

## Positional forms

- **`/feature-loop <module>/<feature>`** — start (or resume mid-loop). Look for `.claude/specs/inbox/<module>/<feature>.md` or `.claude/specs/inbox/<feature>.md`.
- **`/feature-loop`** — no arg. If `.claude/specs/_queue.yaml` has pending features, continue with the first. Otherwise look for the newest file in `.claude/specs/inbox/`; if only one is present and matches an obvious slug, propose it.

## Flags

- **`--from-doc <path>`** — treat `<path>` as the brief regardless of location.
- **`--from-spec <mod>/<feat>`** — skip stages 0–1; resume from stage 2 with the existing spec set.
- **`--verify-only <mod>/<feat>`** — run stage 3 alone against the current diff. Base = `state.yaml` `base_sha`, else `git merge-base HEAD <default branch>` with an empty `baseline.tsv` (`: >`, never `--write-baseline`); missing `files-touched.txt` / `regression-tests.txt` / `verify-plan.yaml` are derived first (spec-writer lists mode).
- **`--dry-learnings <mod>/<feat>`** — run stage 5 in inspection mode; write a `Would apply` section to the learnings file but do NOT touch skill or template files.
- **`--full-spec`** — stage 1 writes every concern file, `N/A` ones included (default: applicable concerns only; N/A ones are cited lines in `index.md`).
- **`--max-iters N`** — override default build/verify iter cap (3).
- **`--max-heal-iters N`** — override default stage-3 self-healing retry cap (3).
- **`--max-agents N`** — override per-stage sub-agent concurrency (default 6, ceiling 10). See `../SKILL.md` §Multi-agent policy.
- **`--no-fanout`** — one agent per stage step; no parallel sub-agents.
- **`--force-autonomous`, `-y`** — end-to-end unattended run. Skips `split-approve` and `approve` gates. Stage -1 auto-approves its own split; Stage 0 auto-resolves every non-`BLOCKING` open question with safe-default engineering assumptions. `BLOCKING` questions still halt (exit 30).

## Subcommands

- **`/feature-loop split-approve`** — after a PRD splitter proposal has been reviewed (and optionally edited in `.claude/specs/inbox/_split-<date>.md`), approve it. Orchestrator queues per-feature briefs and runs them sequentially.
- **`/feature-loop approve <mod>/<feat>`** — after brainstormer produces `brief-refined.md` + `user-journeys.md` + `edge-cases.md` + `open-questions.md`, pass the stage-0 gate. Orchestrator continues autonomously through stages 1–5.
- **`/feature-loop revise <mod>/<feat> "<feedback>"`** — append `<feedback>` to `brief-refined.md` as a `## Reviewer input` section, then re-run brainstormer with that context.

## Routing (orchestrator's decision tree)

```
if flag `-y` / `--force-autonomous` → set autonomous=true (applies to whichever branch below runs)
if command is `split-approve`      → prd-splitter materialize mode, write _queue.yaml, start stage 0 on first
elif command is `approve <mod>/<feat>` → resume from stage 1
elif command is `revise <mod>/<feat>` → re-run stage 0
elif flag `--verify-only`          → run stage 3 only
elif flag `--from-spec`            → jump to stage 2
elif flag `--from-doc`             → use given path as input; run detection → stage -1 or 0
elif <mod>/<feat> given and its state.yaml exists
                                   → stage done | escalated: print the result path and stop (use --from-spec to rebuild;
                                     base_sha and baseline are kept)
                                   → otherwise resume at state.stage with state.flags (build/verify resume at iter / heal_iter)
elif no arg and _queue.yaml has pending features → start or resume the first
else                                → default routing (stage -1 or 0 based on input doc)

# In autonomous mode:
#   stage -1 skips the split-approve halt (auto-approves its own _split-*.md).
#   stage 0 skips the approve halt (auto-resolves non-BLOCKING open questions).
#   BLOCKING questions still exit 30.
```

## Coordinator discipline

The session running this command is the coordinator: it dispatches stage agents and keeps `state.yaml`, and never does stage work itself. See `../SKILL.md` §Token budget. To measure a run: `python3 -I <skill-dir>/scripts/usage.py`.

## Exit codes (when the orchestrator terminates the loop)

| Exit | Meaning |
|------|---------|
| 0 | ship — verdict green; learnings applied, or skipped on a clean first-iter ship. |
| 10 | halted at split-approve gate. |
| 11 | halted at approve gate. |
| 13 | halted: a check agent changed code, a manifest or a tool config outside the allowlist (`unexpected-code:`); keep it via `revise` or discard it, then resume. |
| 12 | halted: gate INCOMPLETE — changed code no check could cover (default mode); add `.claude/specs/_gate.cmds` or the missing tool, then resume. |
| 20 | ESCALATE — max iters, unresolved blockers. |
| 21 | SELF-HEAL-EXHAUSTED — heal-iter cap hit with compile-gate still FAIL. |
| 30 | brainstormer BLOCKING questions (also fires under `-y`). |
| 40 | orchestrator hard error (missing input doc, invalid slug, gate exit 2 that cannot be fixed, a stage agent failing twice, etc.). |

## Related
- Master skill: [../SKILL.md](../SKILL.md)
- Design doc: `docs/superpowers/specs/2026-07-27-feature-loop-design.md`
