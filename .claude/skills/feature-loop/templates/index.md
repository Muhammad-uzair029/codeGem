<!-- template: spec-writer — feature index -->
# {{module}}/{{feature}}

**Status:** {{status}}
**Started:** {{start_date}}
**Shipped:** {{shipped_date_or_dash}}
**Author(s):** {{authors}}

## Summary
{{one_paragraph_summary}}

## Non-goals
- {{non_goal_1}}
- {{non_goal_2}}

## User journey summary
_See [`user-journeys.md`](./user-journeys.md) for full detail._
- **Journey 1 — {{actor}} · {{trigger}}** — {{one_line_summary}}
- **Journey 2 — {{actor}} · {{trigger}}** — {{one_line_summary}}

## Related features
| Feature | Relation | Shared contracts | Regression risk |
|---------|----------|------------------|-----------------|
| {{feature_slug}} | {{relation}} | {{contracts}} | {{risk}} |

## Acceptance criteria
1. {{criterion}} — verified by row {{tests.md_row}}.
2. {{criterion}} — verified by row {{tests.md_row}}.

## Files touched (allowlist — implementer must not exceed)
- {{workspace}}/{{path}}
- {{workspace}}/{{path}}

_Machine-readable copy for `scripts/gate.sh`: [`files-touched.txt`](./files-touched.txt). Related features' tests: [`regression-tests.txt`](./regression-tests.txt)._

## Concern files
_List only the files written for this feature._
- [Contracts](./contracts.md)
- [Tests](./tests.md)
- [{{concern}}](./{{concern_file}}.md)

## Concerns not applicable
_One line per concern without a file (omit this section under `--full-spec`)._
- {{concern}} — N/A: {{cited_reason}}
