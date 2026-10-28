# Project — orchestrated by claude-code-boilerplate (Next.js)

This project was scaffolded (or adopted) by feature-loop-manager with the
`NEXT_JS` stack preset. See `.claude/skills/` for the injected skill matrix.
Canonical entry points:

- `feature-loop` — 6-stage autonomous feature-development engine.
- `quality-assurance` — self-healing compilation verification engine.
- `figma-to-code` — injected as a canonical dir, but it emits React Native +
  NativeWind. Do not use it for web components (see skills below).

## Directory blueprint (enforced by feature-loop-manager)

```
[Client-Project-Root]/
├── CLAUDE.md                       <- (this file — global agent behavior + verification loop macros)
├── .claude/
│   ├── specs/
│   │   ├── inbox/                  <- dropped feature-brief.md files
│   │   └── active/                 <- decomposed active feature spec-sets
│   └── skills/                     <- injected skill matrix
├── app/                            <- App Router routes, layouts, route handlers (or pages/ for Pages Router)
├── components/                     <- shared UI components
├── lib/                            <- server/client utilities, data access
├── public/                         <- static assets
├── next.config.(js|mjs|ts)
├── tsconfig.json
└── package.json
```

`src/app/` + `src/components/` is equally valid; follow whatever the repo
already uses.

## Verification-loop macros

- `/feature-loop -y <mod>/<feat>` — end-to-end unattended run (Stages -1 → 5).
- `/feature-loop --verify-only <mod>/<feat>` — Stage 3 alone against current diff.
- `/quality-assurance` — compile-gate (pre-merge-check + null-safety-scan) with up to 3 self-healing retries before escalation.

Verification commands (prefer the `package.json` scripts with the repo's
package manager when they exist):

| Check     | Command                                         |
| --------- | ----------------------------------------------- |
| Lint      | `npx eslint .`                                  |
| Typecheck | `npx tsc --noEmit`                              |
| Tests     | `npx vitest run` or `npx jest` (whichever the repo uses) |
| Build     | `npx next build`                                |

## Global agent behavior rules

- **Feature-loop is the primary entry point** for any non-trivial feature.
- **Server Components by default.** Add `'use client'` only to components that need state, effects, or browser APIs; keep client boundaries small.
- **Secrets stay server-side.** Only `NEXT_PUBLIC_*` env vars may reach the browser; never read other env vars from client components.
- **Validate at boundaries** — route handlers and server actions validate input before use and return typed responses.
- **Every commit passes the full 42-rule security-audit** before push.
- **`next build` must pass** before a feature is marked done; a passing `tsc` alone is not enough.
- **No speculative abstraction** — extract on third repeat, not the first.
- **Self-healing is authoritative during Stage 3.** Do not intervene mid-loop; up to 3 retries then ESCALATE / SELF-HEAL-EXHAUSTED.

## Skills that fit this stack

Use:

- `feature-loop`, `feature-review`, `feature-audit` — stack-agnostic orchestration and review.
- `pre-merge-check`, `quality-assurance`, `null-safety-scan`, `complexity-check`, `dead-code-scan`, `dependency-hygiene`, `test-coverage-delta` — all support TS/JS (eslint, tsc, jest/vitest).
- `security-audit`, `security-scan`, `pentesting` — web attack surface applies directly.
- `perf-budget` — bundle-size and API-latency budgets apply (ignore the React Native startup metric).
- `api-mock-parity` — when the app keeps MSW / Storybook fixtures against an OpenAPI or typed backend.
- `migration-safety` — when the repo has Prisma / Knex / TypeORM / SQL migrations.
- `adr-writer`, `generate-docs`, `git-push`, `pr-open`, `team-pulse` — workflow skills, stack-agnostic.

Skip:

- `figma-to-code`, `figma-to-code-skill`, `react-native-optimization-and-architecture` — React Native / NativeWind only.
- `contract-drift-check`, `system-design` — assume the RN + NestJS + Python monorepo layout (`apps/frontend-ui`, `apps/backend-api`, `apps/ai-engine`).

## Framework mapping

The manager records this project as `NEXT_JS` in its persistent
`config.json`. Change it from the stack picker and re-inject skills to
regenerate this file.

## Cache discipline

This CLAUDE.md is loaded at the top of every conversation. Keep it stable.
Volatile per-area concerns belong in nested `CLAUDE.md` files.
