<!-- template: spec-writer — frontend-ui -->
# frontend-ui — {{module}}/{{feature}}

## Screens / views
| Screen | Route / component path | Figma ref | Empty / loading / error state |
|--------|-----------------------|-----------|-------------------------------|
| {{name}} | {{path}} | {{figma_url_or_dash}} | {{states}} |

## Components
| Component | Reused from | Tokens used | a11y roles |
|-----------|-------------|-------------|------------|
| {{component}} | {{origin_or_new}} | {{token_names}} | {{roles}} |

## Navigation edges
- {{from_screen}} → {{to_screen}} — trigger: {{trigger}}

## State management
{{store_slice_or_context}}

## Design tokens (from Figma)
- Color: {{color_tokens}}
- Type: {{type_tokens}}
- Spacing: {{spacing_tokens}}

## a11y
- All interactive elements have accessible labels.
- Contrast ≥ {{ratio}}:1.
- Focus order documented in `user-journeys.md`.

## Figma parity
<!-- Populated by spec-writer when the intake declares figma_url / figma_node_id. Otherwise "N/A — no Figma reference in intake." -->
- Source: {{figma_url_or_na}}
- Node id: {{figma_node_id_or_na}}
- Snapshot: {{figma_snapshot_path_or_na}}
- Fetched: {{fetched_at_or_na}}

## NativeWind layout spec
<!-- Auto-generated from Figma Auto Layout properties by spec-writer. One block per component. -->
- **{{component}}** (Figma node `{{node_id}}`)
  - container: `{{nativewind_classes}}`
  - children:
    - `{{child_type}}` — `{{child_classes}}`

## Layout delta
<!-- Only populated on revised specs. Empty on first write. -->
| Component | Prop | Old | New | Reason |
|-----------|------|-----|-----|--------|
| {{component}} | {{prop}} | {{old}} | {{new}} | {{reason}} |
