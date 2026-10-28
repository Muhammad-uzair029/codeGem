<!-- template: spec-writer — rollout -->
# rollout — {{module}}/{{feature}}

## Feature flag
- Name: `{{flag_name}}`.
- Default: OFF in production, ON in staging.
- Owner: {{owner}}.

## Kill-switch
- Trigger: {{condition}}.
- Behavior: {{fallback_behavior}}.

## Rollback plan
1. Flip `{{flag_name}}` to OFF.
2. {{step}} (e.g., revert migration, restore prior handler).

## Backward-compat window
- Old clients supported until {{date_or_version}}.
- Old-DB support: {{plan}}.

## Rollout stages
| Stage | Audience | Success criteria | Abort criteria |
|-------|----------|------------------|----------------|
| 1 — internal | employees | {{criteria}} | {{criteria}} |
| 2 — 5% | random 5% | {{criteria}} | {{criteria}} |
| 3 — 100% | all users | {{criteria}} | {{criteria}} |
