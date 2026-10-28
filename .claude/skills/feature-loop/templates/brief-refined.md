<!-- template: brainstormer output — brief-refined -->
# brief-refined — {{module}}/{{feature}}

**Date:** {{date}}
**Source doc:** {{source_doc_path}}
**Brainstormed against:** {{related_features_count}} prior features

## Goals
- {{goal_1}}
- {{goal_2}}

## Non-goals
- {{non_goal_1}}

## Actors
| Actor | Description | Auth level |
|-------|-------------|------------|
| {{actor_name}} | {{actor_description}} | {{auth_level}} |

## Related features (from `_index.md` scan)
| Feature | Relation | Shared contracts | Regression risk |
|---------|----------|------------------|-----------------|
| {{feature_slug}} | extends \| overlaps \| depends-on \| conflicts-with | {{contracts}} | {{risk}} |

## Assumption log
Every assumption is tied to evidence. `source:` is required.

- **{{assumption}}** — source: {{evidence}}
- **{{assumption}}** — source: {{evidence}}

## Reviewer input
_This section is appended by the orchestrator when the user runs `/feature-loop revise`. Do not hand-edit._
