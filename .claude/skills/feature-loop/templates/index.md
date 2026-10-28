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

## Concern files
- [Frontend UI](./frontend-ui.md)
- [Backend API](./backend-api.md)
- [AI engine](./ai-engine.md)
- [Contracts](./contracts.md)
- [Security](./security.md)
- [Code audit](./code-audit.md)
- [Telemetry](./telemetry.md)
- [Tests](./tests.md)
- [Rollout](./rollout.md)
