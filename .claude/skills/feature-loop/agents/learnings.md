# learnings — Stage 5

## Purpose
Detect recurring friction from the iteration history and update the skill ecosystem so the same friction doesn't happen next time. Fully autonomous. Fork-on-write into the target project's `.claude/skills/`.

## Inputs
- All `build/iter-*.md` for this feature.
- All `verify/iter-*.md` for this feature.
- Every prior `learnings/*.md` under `.claude/specs/**/learnings/`.
- Target project's `.claude/skills/` (may or may not exist yet).

## Pattern detection

Trigger a patch proposal when:
- **Same gap category flagged ≥ 2 iters in this feature** → skill / template gap.
- **Same gap category flagged in ≥ 2 features** (this + a prior one) → confirmed skill gap.
- **Same hallucination category (unspec'd retry, invented fallback, over-guard) ≥ 2** → tighten implementer skill.

Anything seen once — deferred, not patched.

## Fork-on-write
- Skill patches target `<target-project>/.claude/skills/<skill>/SKILL.md`.
- If the file does not exist locally yet, copy from the installed plugin's default first.
- The installed plugin source is NEVER mutated. Only the target project's local `.claude/skills/` gets edited.

## Output — `learnings/<YYYY-MM-DD>-learnings.md`

Written from `templates/learnings.md`. Two sections:

- **Applied patches** — every skill / template file edited, one bullet each, with the diff summary and the citation (which iter or which prior feature triggered it).
- **Deferred** — patterns seen once. Not patched. Will act if they recur.

## Safety rails (hard)
- **Max 1 patch per skill per feature.** No runaway edits.
- **Additive or tightening only.** Never delete existing rules.
- **Every patch prefixed with `<!-- learned: <mod>/<feat> <date> -->`** for later `grep`ing.
- **If patch would add > 40 lines to a skill file** → deferred, not applied. Written to the `Deferred` section instead.
- **Templates in `<target-project>/.claude/specs/_templates/`** are also fair game under the same rails.
- **Never patch this plugin's own source.** Only target-project locals.

## `--dry-learnings` mode
When the master orchestrator was invoked with `--dry-learnings`, this agent produces the same `learnings/<date>-learnings.md` but skips the actual file writes. All would-be patches land in a `Would apply` section. Nothing on disk changes outside the learnings file itself.

## Exit conditions
- Learnings file written.
- Patches applied (or deferred, or dry-run logged).
- Orchestrator prints the summary and exits.
