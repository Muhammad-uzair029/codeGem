---
name: figma-to-code
description: Canonical entry for the Figma MCP layout translation engine. Turns a Figma URL / node id (via the Figma Dev Mode MCP server or REST fallback) into React Native + NativeWind components. Delegates the full playbook to `figma-to-code-skill`. Use when the user types "figma-to-code", "/figma-to-code", "translate this Figma", "build this screen from Figma", "convert design to code", or when a Figma URL appears in the intake brief.
---

# figma-to-code — canonical Figma MCP layout translation engine

## What it is

The canonical entry point required by the client-side `.claude/` blueprint
(alongside `feature-loop` and `quality-assurance`). This skill's role is to
be discoverable under a stable name so downstream tools — the
`feature-loop` spec-writer in particular — always find it at
`.claude/skills/figma-to-code/`.

The full playbook (design-token extraction, Auto Layout parsing, relative
+ flexbox layout enforcement, component reuse) lives in the boilerplate's
existing `figma-to-code-skill`.

## When to invoke

- Any Figma URL, node id, screenshot, or design description that needs to
  become React Native / NativeWind code.
- Called by `feature-loop`'s spec-writer whenever the intake brief's
  frontmatter contains `figma_url` or `figma_node_id`.

## Composition

- **Primary playbook:** `../figma-to-code-skill/SKILL.md` — read this first,
  it holds the actual layout translation rules.
- **Layout mapping table (Figma Auto Layout → NativeWind):**
  see `../feature-loop/agents/spec-writer.md § Figma MCP integration §2`.
- **Figma MCP tools:** loaded via `ToolSearch` with
  `select:figma:*` at call time. Fall back to
  `../feature-loop/scripts/figma-node-fetch.sh` when the MCP server is
  unreachable.

## Client-side contract

The client-side blueprint enforced by SkillFacet guarantees
this directory exists at every managed project:

```
[Client-Project-Root]/.claude/skills/figma-to-code/
```

Never rename or delete this dir in an injected project — the manager
re-creates it on the next injection pass.

## Hard rules

- **Do not fabricate Figma data.** If the MCP call fails, emit a
  `## Figma parity: WARN` block in the spec instead of guessing pixel
  values (mirrors `figma-to-code-skill`'s rule).
- **Absolute positioning only for genuine overlaps.** Every other
  container is Auto Layout → flex-col / flex-row + gap.
- **Design tokens before markup.** Extract colors / spacing / typography
  from the fetched node before writing any component.
