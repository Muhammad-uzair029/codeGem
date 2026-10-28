<!-- template: learnings — stage 5 -->
# learnings — {{module}}/{{feature}}

**Date:** {{date}}
**Iters:** {{n}}
**Mode:** applied \| dry-run

## Applied patches
_Each patch was applied to the target project's `.claude/skills/<skill>/SKILL.md` (fork-on-write). Prefix marker: `<!-- learned: {{module}}/{{feature}} {{date}} -->`._

- **[.claude/skills/{{skill}}/SKILL.md]** {{one_line_summary_of_added_rule}}
  - Reason: {{recurring_pattern_evidence}}.
  - Diff summary: +{{added}} / -{{removed}} lines.

- **[.claude/specs/_templates/{{template}}.md]** {{template_change_summary}}
  - Reason: {{evidence}}.

## Would apply (dry-learnings mode only — no writes performed)
- **[.claude/skills/{{skill}}/SKILL.md]** {{proposed_change}}
- **[.claude/specs/_templates/{{template}}.md]** {{proposed_change}}

## Deferred (seen once — will act on recurrence)
- **Pattern:** {{description}}. Suggested rule: {{rule}}. Occurrences: 1.

## Skill patch safety-rail log
- Skills patched this feature: {{count_per_skill}} (max 1 each — cap enforced).
- Rejected due to > 40 LOC: {{list_or_none}} (moved to Deferred instead).
