<!-- template: spec-writer — code-audit -->
# code-audit — {{module}}/{{feature}}

## Complexity ceilings (per file — enforced by complexity-check)
| File | Max cyclomatic | Max cognitive | Max LOC |
|------|----------------|---------------|---------|
| {{path}} | {{n}} | {{n}} | {{n}} |

## Null-safety hotspots (enforced by null-safety-scan)
- {{file}}:{{symbol}} — nullable because {{reason}}. Guard: {{guard}}.

## Dead-code hygiene
- Exports to add: {{list}}.
- Exports being removed: {{list}}.

## Dep hygiene
- New third-party deps: {{list}} — each justified in `rollout.md` or via `adr-writer`.
