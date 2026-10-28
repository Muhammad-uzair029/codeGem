<!-- template: spec-writer — telemetry -->
# telemetry — {{module}}/{{feature}}

## Log lines (exact strings)
| Level | Format string | Where emitted | Fields |
|-------|--------------|---------------|--------|
| info | `{{template_string}}` | {{file}}:{{line}} | {{fields}} |

## Metrics
| Metric name | Type | Labels | Emitted when |
|-------------|------|--------|--------------|
| {{name}} | counter | histogram | gauge | {{labels}} | {{trigger}} |

## Sentry breadcrumbs
- `{{category}}` · `{{message}}` — emitted at {{file}}:{{line}}.

## Dashboards to update
- {{dashboard_name}} — add panel {{panel_description}}.
