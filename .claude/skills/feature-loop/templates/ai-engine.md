<!-- template: spec-writer — ai-engine -->
# ai-engine — {{module}}/{{feature}}

_(Mark N/A with a cited reason if the feature does not touch the AI engine.)_

## Prompts
| Prompt name | Purpose | System / user templates | Version |
|-------------|---------|-------------------------|---------|
| {{name}} | {{purpose}} | {{path}} | {{version}} |

## Models
| Task | Model | Token budget (in/out) | Latency budget |
|------|-------|----------------------|----------------|
| {{task}} | {{model_id}} | {{in}}/{{out}} | {{p95_ms}} |

## Retries + fallback
- Retry policy: {{policy}} — source: {{spec_line}}
- Fallback model / behavior: {{fallback}}

## Streaming
- Streamed: {{yes_or_no}}. If yes, event schema: {{schema}}.

## Safety
- Prompt injection defenses: {{defense}}
- Output moderation: {{moderation}}
