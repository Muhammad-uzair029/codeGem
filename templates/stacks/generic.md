# Project — orchestrated by SkillFacet

This project was scaffolded (or adopted) by SkillFacet with the
`GENERIC` stack preset: no stack-specific rules. See `.claude/skills/` for
the injected skill matrix. Canonical entry points:

- `feature-loop` — 6-stage autonomous feature-development engine.
- `quality-assurance` — self-healing compilation verification engine (TS/JS + Python toolchains).
- `figma-to-code` — injected as a canonical dir; emits React Native code only.

## Directory blueprint (enforced by SkillFacet)

```
[Client-Project-Root]/
├── CLAUDE.md                       <- (this file — global agent behavior + verification loop macros)
└── .claude/
    ├── specs/
    │   ├── inbox/                  <- dropped feature-brief.md files
    │   └── active/                 <- decomposed active feature spec-sets
    └── skills/                     <- injected skill matrix
```

Source layout is whatever the project already uses; document it here once
it is settled.

## Verification-loop macros

- `/feature-loop -y <mod>/<feat>` — end-to-end unattended run (Stages -1 → 5).
- `/feature-loop --verify-only <mod>/<feat>` — Stage 3 alone against current diff.
- `/quality-assurance` — compile-gate with up to 3 self-healing retries (TS/JS + Python only).

Verification commands — fill these in for this project so the Stage 3
verifier runs the real checks:

| Check     | Command |
| --------- | ------- |
| Lint      | _TODO_  |
| Typecheck | _TODO_  |
| Tests     | _TODO_  |
| Build     | _TODO_  |

## Global agent behavior rules

- **Feature-loop is the primary entry point** for any non-trivial feature.
- **Run the verification commands above** before marking a feature done.
- **Validate input at boundaries** (HTTP handlers, CLI args, queue consumers); keep types explicit where data crosses them.
- **Every commit passes the full 42-rule security-audit** before push.
- **No speculative abstraction** — extract on third repeat, not the first.
- **Self-healing is authoritative during Stage 3.** Do not intervene mid-loop; up to 3 retries then ESCALATE / SELF-HEAL-EXHAUSTED.

## Skills that fit this stack

Use on any stack:

- `feature-loop`, `feature-review` — orchestration and review.
- `security-audit`, `security-scan`, `pentesting` — security gates.
- `migration-safety` — when the repo has Prisma / TypeORM / Knex / Alembic / raw SQL migrations.
- `adr-writer`, `generate-docs`, `git-push`, `pr-open`, `team-pulse` — workflow skills.

Use only if the project is TS/JS or Python:

- `pre-merge-check`, `quality-assurance`, `null-safety-scan`, `complexity-check`, `dead-code-scan`, `dependency-hygiene`, `test-coverage-delta`, `api-mock-parity`, `perf-budget`, `feature-audit`.

Skip unless the project matches their assumptions:

- `figma-to-code`, `figma-to-code-skill`, `react-native-optimization-and-architecture` — React Native only.
- `contract-drift-check`, `system-design` — RN + NestJS + Python monorepo layout.

## Framework mapping

The manager records this project as `GENERIC` in its persistent
`config.json`. Pick a specific stack in the stack picker and re-inject
skills to get stack-specific rules.

## Cache discipline

This CLAUDE.md is loaded at the top of every conversation. Keep it stable.
Volatile per-area concerns belong in nested `CLAUDE.md` files.
