# prd-splitter — Stage -1

## Purpose
Detect when the input document contains ≥ 2 independent features / milestones and propose a split into one feature per downstream loop.

## Inputs
- Input document path (from the master orchestrator).
- `.claude/specs/_index.md` (may be empty on first run).

## Detection rules (any one triggers a split proposal)
- Regex match on any heading: `/^#+\s*(Feature|Milestone|Phase|Epic)\s+\d+/i`.
- ≥ 2 top-level H2/H3 blocks each containing their own goals + acceptance sections.
- An explicit `## Table of contents` block that lists 2+ features.

If none of the above match, immediately return `single-feature` — master orchestrator skips to stage 0.

## Output
Write `.claude/specs/inbox/_split-<YYYY-MM-DD>.md`:

```markdown
# PRD split proposal — <source doc path>

## Proposed features
1. **<module>/<feature-slug>** — <one-line summary>. Source: <heading or line range>.
2. **<module>/<feature-slug>** — <one-line summary>. Source: <heading or line range>.
...

## Suggested dependency order
<numbered list — feature A must ship contracts before feature B can verify, etc.>

## Notes
<free text — cross-refs, shared contracts, risks>
```

## Hard rules
- Never invent features not present in the source doc. Each row's `Source:` must cite a real heading or line range.
- Slug convention: `<module>/<kebab-case-feature-name>`.
- Sequence order matters — if feature B references contracts from feature A, A must come first.
- Do NOT split into fewer than 2 items — if only one feature is present, return `single-feature`.
- Do NOT edit the source doc.

## Exit conditions
- `single-feature` → orchestrator continues to stage 0 with the input as-is.
- `split-proposed` → default mode: orchestrator prints the file path and waits for `/feature-loop split-approve`.
- `split-proposed` under `--force-autonomous` / `-y` → orchestrator auto-approves the freshly written `_split-<date>.md` in place (no edits, no user pause). The splitter must have populated every `Source:` field so post-hoc audit is possible.

## Autonomous mode contract (`--force-autonomous` / `-y`)
- Dependency order = the order features appear in the source doc. If two features reference a shared contract, the one that DECLARES the contract goes first; the one that CONSUMES it goes second.
- Never invent a "shared contract" not present in the source doc — if uncertain, keep source-doc order.
- Prepend a `> autonomous-approved: <UTC-timestamp>` line to `_split-<YYYY-MM-DD>.md` so the paper trail records that this was not human-reviewed.
- If detection is ambiguous (e.g., a section is not clearly a feature vs. a subsection of the previous one), fall back to `single-feature` rather than guessing — a wrong split cannot be undone cheaply mid-loop.

## After approval
Orchestrator (not this agent) writes one `inbox/<mod>/<feature>.md` per row, copying the referenced section of the source doc. Then it queues features sequentially per the dependency order.
