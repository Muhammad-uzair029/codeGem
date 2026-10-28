# Project — orchestrated by SkillFacet

This project was scaffolded (or adopted) by SkillFacet. See
`.claude/skills/` for the injected skill matrix. Canonical entry points:

- `feature-loop` — 6-stage autonomous feature-development engine.
- `figma-to-code` — Figma MCP layout translation engine.
- `quality-assurance` — self-healing compilation verification engine.

## Directory blueprint (enforced by SkillFacet)

```
[Client-Project-Root]/
├── .claude/
│   ├── CLAUDE.md                   <- (this file — global agent behavior + verification loop macros)
│   ├── specs/
│   │   ├── inbox/                  <- dropped feature-brief.md files
│   │   └── active/                 <- decomposed active feature spec-sets
│   └── skills/
│       ├── feature-loop/
│       ├── figma-to-code/
│       ├── quality-assurance/
│       └── … (other injected skills — full boilerplate matrix)
```

## Verification-loop macros

- `/feature-loop -y <mod>/<feat>` — end-to-end unattended run (Stages -1 → 5).
- `/feature-loop --verify-only <mod>/<feat>` — Stage 3 alone against current diff.
- `/quality-assurance` — compile-gate composition (pre-merge-check + contract-drift-check + null-safety-scan) with up to 3 self-healing retries before escalation.
- `/figma-to-code <node|url>` — translate a Figma node to React Native + NativeWind.

## Global agent behavior rules

- **Feature-loop is the primary entry point** for any non-trivial feature.
- **No hand-written HTTP call code in the mobile/web client** — Orval-generated hooks only.
- **Every commit passes the full 42-rule security-audit** before push.
- **Contracts at boundaries** — cross-service types live in versioned schemas; drift is caught by `contract-drift-check`.
- **No speculative abstraction** — extract on third repeat, not the first.
- **Self-healing is authoritative during Stage 3.** Do not intervene mid-loop; up to 3 retries then ESCALATE / SELF-HEAL-EXHAUSTED.
- **Figma parity** — when the intake brief declares `figma_url` / `figma_node_id`, the spec-writer calls the Figma MCP server (configured in `.mcp.json`) and serializes Auto Layout properties into NativeWind classes. No pixel guessing.

## Framework mapping

The manager records the project's framework in its persistent
`config.json`. This template is written for these two enums:

- `REACT_NATIVE_EXPO` — Expo / React Native client stack.
- `NEST_JS` — NestJS service stack.

Other stacks (`NEXT_JS`, `FASTAPI`, `GO`, `GENERIC`) get their own template
from the manager's stack picker. Unknown → the manager surfaces the
ambiguity in the UI so a human can tag it before launch.

## Cache discipline

This CLAUDE.md is loaded at the top of every conversation. Keep it stable.
Volatile per-workspace concerns belong under `apps/<workspace>/CLAUDE.md`.
