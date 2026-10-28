---
name: feature-loop
description: Autonomous feature-development loop — takes a raw brief, brainstorms, specs, builds, verifies, ships, and self-updates skills. Two human gates (split-approve, approve); everything else autonomous.
---

# /feature-loop — command surface

Invoke the master SKILL (`../SKILL.md`) to run the pipeline. This file only describes the command surface; behavior lives in the skill.

## Positional forms

- **`/feature-loop <module>/<feature>`** — start (or resume mid-loop). Look for `.claude/specs/inbox/<module>/<feature>.md` or `.claude/specs/inbox/<feature>.md`.
- **`/feature-loop`** — no arg. Look for the newest file in `.claude/specs/inbox/`; if only one is present and matches an obvious slug, propose it.

## Flags

- **`--from-doc <path>`** — treat `<path>` as the brief regardless of location.
- **`--from-spec <mod>/<feat>`** — skip stages 0–1; resume from stage 2 with the existing spec set.
- **`--verify-only <mod>/<feat>`** — run stage 3 alone against the current diff.
- **`--dry-learnings <mod>/<feat>`** — run stage 5 in inspection mode; write a `Would apply` section to the learnings file but do NOT touch skill or template files.
- **`--max-iters N`** — override default build/verify iter cap (3).
- **`--max-heal-iters N`** — override default stage-3 self-healing retry cap (3).
- **`--force-autonomous`, `-y`** — end-to-end unattended run. Skips `split-approve` and `approve` gates. Stage -1 auto-approves its own split; Stage 0 auto-resolves every non-`BLOCKING` open question with safe-default engineering assumptions. `BLOCKING` questions still halt (exit 30).

## Subcommands

- **`/feature-loop split-approve`** — after a PRD splitter proposal has been reviewed (and optionally edited in `.claude/specs/inbox/_split-<date>.md`), approve it. Orchestrator queues per-feature briefs and runs them sequentially.
- **`/feature-loop approve <mod>/<feat>`** — after brainstormer produces `brief-refined.md` + `user-journeys.md` + `edge-cases.md` + `open-questions.md`, pass the stage-0 gate. Orchestrator continues autonomously through stages 1–5.
- **`/feature-loop revise <mod>/<feat> "<feedback>"`** — append `<feedback>` to `brief-refined.md` as a `## Reviewer input` section, then re-run brainstormer with that context.

## Routing (orchestrator's decision tree)

```
if flag `-y` / `--force-autonomous` → set autonomous=true (applies to whichever branch below runs)
if command is `split-approve`      → read _split-*.md, queue features, start stage 0 on first
elif command is `approve <mod>/<feat>` → resume from stage 1
elif command is `revise <mod>/<feat>` → re-run stage 0
elif flag `--verify-only`          → run stage 3 only
elif flag `--from-spec`            → jump to stage 2
elif flag `--from-doc`             → use given path as input; run detection → stage -1 or 0
else                                → default routing (stage -1 or 0 based on input doc)

# In autonomous mode:
#   stage -1 skips the split-approve halt (auto-approves its own _split-*.md).
#   stage 0 skips the approve halt (auto-resolves non-BLOCKING open questions).
#   BLOCKING questions still exit 30.
```

## Exit codes (when the orchestrator terminates the loop)

| Exit | Meaning |
|------|---------|
| 0 | ship — verdict green, learnings applied. |
| 10 | halted at split-approve gate. |
| 11 | halted at approve gate. |
| 20 | ESCALATE — max iters, unresolved blockers. |
| 21 | SELF-HEAL-EXHAUSTED — heal-iter cap hit with compile-gate still FAIL. |
| 30 | brainstormer BLOCKING questions (also fires under `-y`). |
| 40 | orchestrator hard error (missing input doc, invalid slug, etc.). |

## Related
- Master skill: [../SKILL.md](../SKILL.md)
- Design doc: `docs/superpowers/specs/2026-07-27-feature-loop-design.md`
