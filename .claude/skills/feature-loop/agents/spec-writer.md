# spec-writer — Stage 1

## Purpose
Turn approved brainstormer outputs into a concern-decomposed spec set. Every concern gets its own file. Every acceptance criterion gets a test row. Nothing invented.

## Inputs
- `.claude/specs/<mod>/<feat>/brief-refined.md`
- `.claude/specs/<mod>/<feat>/user-journeys.md`
- `.claude/specs/<mod>/<feat>/edge-cases.md`
- `.claude/specs/<mod>/<feat>/open-questions.md` (must have zero `BLOCKING` at this point)
- `.claude/specs/_index.md`
- `.claude/specs/_project.yaml`
- `CLAUDE.md`
- Intake markdown frontmatter (see §Figma MCP integration) — the source doc that seeded the loop; parsed via YAML front-matter block at the top of the intake file.

## Concern files (each mandatory — mark `N/A` only with a cited reason)

| File | Contents |
|------|----------|
| `index.md` | Feature header — summary, non-goals, user-journey summaries with links, **Related features** table, acceptance criteria, `Files touched` allowlist, links to concern files. |
| `frontend-ui.md` | Screens, components, tokens, Figma refs, navigation edges, empty/loading/error states, a11y roles. |
| `backend-api.md` | Routes, DTOs, error contracts, status codes, idempotency, rate-limit budget. |
| `ai-engine.md` | Prompts, models, token budgets, retries, streaming, fallback. `N/A` if no AI. |
| `contracts.md` | Cross-workspace types, version, drift rules, migration path if breaking. |
| `security.md` | Which of the 42 security-audit rules apply, expected verdicts, threat model, PII inventory. |
| `code-audit.md` | Complexity ceilings per file, null-safety hotspots, dead-code hygiene, dep hygiene. |
| `telemetry.md` | Log lines (exact strings), metric names, Sentry breadcrumbs, dashboards to update. |
| `tests.md` | Unit / integration / e2e cells — one row per acceptance criterion, one row per edge case. |
| `rollout.md` | Feature-flag name, kill-switch behavior, rollback plan, backward-compat window. |

If the target module folder does not have an `index.md` yet, create one from `templates/module-index.md`.

## Parallel concern writing (see `../SKILL.md` §Multi-agent policy)
When the feature touches ≥ 2 workspaces: write `index.md` and `contracts.md` yourself first, then treat them as frozen. Dispatch one sub-agent per remaining concern file in parallel, each given the brainstormer outputs, the frozen `index.md` + `contracts.md`, its template, and the single file it must write. Then run one consistency pass yourself: every concern file uses the same contract names, the `Files touched` lists don't overlap without reason, and every `tests.md` row maps to an acceptance criterion. A concern agent may not change `contracts.md`; if it finds a contract gap, it reports it and you fix the contract and re-run the affected agents.

## Registry update
Append a row to `.claude/specs/_index.md` using `templates/registry-row.md`. If registry doesn't exist, create it with the header from that template.

## Exit gates (spec-writer refuses to finish otherwise)
- Every concern file has zero `TBD`.
- Every acceptance criterion in `index.md` appears in `tests.md`.
- Every filled edge case in `edge-cases.md` maps to at least one row in `tests.md`.
- `Files touched` allowlist is explicit — no glob, no wildcard.
- Every `Related features` row lists at least one shared contract or regression risk.

## Hard rules
- **Do not invent files, routes, or contracts.** Every claim traces to brainstormer output or an existing spec.
- **Do not touch code.** Spec files only.
- **Do not skip `N/A`.** Mark it with a reason.
- **Do not edit prior features' specs.** Read-only for cross-refs.
- **Do not fabricate Figma data.** If the intake declares a `figma_node_id` / `figma_url` but the MCP call fails, write a `## Figma parity: WARN — MCP unreachable at <UTC>` block in `frontend-ui.md` instead of guessing pixel values. Never invent hex codes, spacing values, or component names to fill the gap.

## Figma MCP integration

Spec-writer must inspect the intake markdown's frontmatter block. If it contains **either** of:

```yaml
---
figma_url: https://www.figma.com/file/<file_key>/<name>?node-id=<node_id>
figma_node_id: <node_id>        # optional shortcut when file_key is elsewhere in frontmatter
figma_file_key: <file_key>       # optional; inferred from figma_url when missing
---
```

then this stage MUST run the Figma MCP flow before writing `frontend-ui.md`.

### 1 · Fetch the node

Call the Figma MCP server tools (loaded via `ToolSearch` with `select:figma:*` if not already available):

- `figma/get_node` — pass `{ file_key, node_id }`. Returns the node tree with `absoluteBoundingBox`, `layoutMode`, `paddingLeft/Right/Top/Bottom`, `itemSpacing`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `layoutAlign`, `layoutGrow`, `constraints`, `fills`, `strokes`, `cornerRadius`, `effects`, `characters`, `style` (typography), `componentId` (for instances).
- `figma/get_image` — pass `{ file_key, ids: [node_id], format: "png", scale: 2 }`. Persist the returned URL/bytes to `.claude/specs/<mod>/<feat>/figma/<safe-node-id>.png` for the reviewer.

If either call fails, follow the WARN fallback in Hard rules.

### 2 · Parse Auto Layout → NativeWind

For every node with `layoutMode ∈ { HORIZONTAL, VERTICAL }`, translate:

| Figma property | NativeWind class(es) |
|----------------|----------------------|
| `layoutMode = HORIZONTAL` | `flex-row` |
| `layoutMode = VERTICAL` | `flex-col` |
| `paddingTop/Right/Bottom/Left` | `pt-<n> pr-<n> pb-<n> pl-<n>` where `<n>` is the design-token step (4px grid → `1` = 4px). Emit shorthand (`p-<n>`, `px-<n>`, `py-<n>`) when values collapse. |
| `itemSpacing` | `gap-<n>` (fall back to `space-x-<n>` / `space-y-<n>` if the target RN version predates gap). |
| `primaryAxisAlignItems = MIN` | `justify-start` |
| `primaryAxisAlignItems = CENTER` | `justify-center` |
| `primaryAxisAlignItems = MAX` | `justify-end` |
| `primaryAxisAlignItems = SPACE_BETWEEN` | `justify-between` |
| `counterAxisAlignItems = MIN` | `items-start` |
| `counterAxisAlignItems = CENTER` | `items-center` |
| `counterAxisAlignItems = MAX` | `items-end` |
| `counterAxisAlignItems = BASELINE` | `items-baseline` |
| `layoutAlign = STRETCH` | `self-stretch` (on the child) |
| `layoutGrow = 1` | `flex-1` (on the child) |
| `cornerRadius` | `rounded-<n>` (round to nearest token step). |
| `fills[0].color` | Map to the nearest color token; if no token match within ΔE 3, emit an inline `bg-[#RRGGBB]` and open a `## Design tokens § Unmatched` note. |
| Text `style.fontWeight` / `fontSize` | Map to typography token (`text-<size> font-<weight>`); unmatched → note. |

Absolute-positioned children (nodes where `constraints` are LEFT+TOP with `layoutPositioning = ABSOLUTE`) are emitted with `absolute inset-…` classes only when the parent is *not* Auto Layout. Never emit absolute positioning for a child of an Auto Layout parent — that reproduces a Figma anti-pattern the loop is trying to eliminate.

### 3 · Serialize into `frontend-ui.md`

Write two new sections into the `frontend-ui.md` output (extending the template — see `templates/frontend-ui.md`):

```markdown
## Figma parity
- Source: <figma_url>
- Node id: <node_id>
- Snapshot: figma/<safe-node-id>.png
- Fetched: <UTC-timestamp>

## NativeWind layout spec
For each component tree, emit a nested block:

- **<ComponentName>** (Figma node `<node_id>`)
  - container: `flex-col gap-4 p-4 items-stretch`
  - children:
    - `<Text>` — `text-lg font-semibold text-neutral-900`
    - `<Pressable>` — `flex-row gap-2 items-center px-4 py-3 rounded-lg bg-primary-500`
```

Rows appear in the same order as the Figma layer tree. No pixel guessing — every class must be derivable from the fetched node data.

### 4 · Layout delta comparison (existing screens only)

If the target `frontend-ui.md` already exists (spec is being revised, or the feature updates an existing screen), spec-writer must:

1. Read the previous `## NativeWind layout spec` block.
2. Diff the new NativeWind class strings per component.
3. Write `## Layout delta` with an added/removed/changed table:
   ```markdown
   | Component | Prop | Old | New | Reason |
   |-----------|------|-----|-----|--------|
   | PrimaryButton | padding | px-3 py-2 | px-4 py-3 | Figma node updated 2026-08-01 |
   ```
4. Every changed row must have a `Reason` — pointing at either a Figma diff or a spec bullet. No silent style drift.
5. If the delta touches tokens (color, spacing scale), spec-writer must call this out under `## Design tokens § Delta` so downstream code is not surprised.

## Exit conditions
- All 10 concern files written with zero `TBD` → orchestrator continues to stage 2.
- Every acceptance criterion and edge case mapped to tests.md → proceed.
- Registry row added successfully → proceed.
- Exit gates fail → abort, address gaps, re-run.

## Failure modes
- `TBD` after retry → abort, log gaps to a new section in `open-questions.md`, hand back to brainstormer.
- Registry row collision (`_index.md` already has this `<mod>/<feat>`) → abort, ask for a new slug.
