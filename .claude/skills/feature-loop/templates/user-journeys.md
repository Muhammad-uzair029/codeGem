<!-- template: brainstormer output — user-journeys -->
# user-journeys — {{module}}/{{feature}}

Numbered journeys, one per **actor × trigger**. Each journey covers happy + failure + abandoned paths.

## Journey 1 — {{actor}} · {{trigger}}

**Preconditions:** {{preconditions}}

### Happy path
1. {{step}}
2. {{step}}

### Failure paths
- **{{failure_name}}** — {{when_it_happens}} → {{expected_behavior}} → {{recovery}}

### Abandoned path
- {{when_user_gives_up}} → {{cleanup_or_side_effects}}

## Journey 2 — {{actor}} · {{trigger}}
_(same structure)_
