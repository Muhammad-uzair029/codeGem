# Project — orchestrated by SkillFacet (FastAPI)

This project was scaffolded (or adopted) by SkillFacet with the
`FASTAPI` stack preset. See `.claude/skills/` for the injected skill matrix.
Canonical entry points:

- `feature-loop` — 6-stage autonomous feature-development engine.
- `quality-assurance` — self-healing compilation verification engine.
- `figma-to-code` — injected as a canonical dir, but it emits React Native
  code. Not relevant to a Python API (see skills below).

## Directory blueprint (enforced by SkillFacet)

```
[Client-Project-Root]/
├── CLAUDE.md                       <- (this file — global agent behavior + verification loop macros)
├── .claude/
│   ├── specs/
│   │   ├── inbox/                  <- dropped feature-brief.md files
│   │   └── active/                 <- decomposed active feature spec-sets
│   └── skills/                     <- injected skill matrix
├── app/
│   ├── main.py                     <- FastAPI() instance + router includes
│   ├── api/                        <- APIRouter modules, one per resource
│   ├── schemas/                    <- pydantic request / response models
│   ├── services/                   <- business logic, no FastAPI imports
│   └── db/                         <- models, session, repositories
├── alembic/                        <- migrations (if using SQLAlchemy + Alembic)
├── tests/                          <- pytest suite
└── pyproject.toml                  <- or requirements*.txt
```

Follow the package name the repo already uses if it is not `app/`.

## Verification-loop macros

- `/feature-loop -y <mod>/<feat>` — end-to-end unattended run (Stages -1 → 5).
- `/feature-loop --verify-only <mod>/<feat>` — Stage 3 alone against current diff.
- `/quality-assurance` — compile-gate (pre-merge-check + null-safety-scan) with up to 3 self-healing retries before escalation.

Verification commands (run inside the project's virtualenv, or prefix with
`uv run` / `poetry run` if the repo uses them):

| Check     | Command                                  |
| --------- | ---------------------------------------- |
| Lint      | `ruff check .` and `ruff format --check .` |
| Typecheck | `mypy .`                                 |
| Tests     | `pytest`                                 |
| Run       | `uvicorn app.main:app --reload`          |

## Global agent behavior rules

- **Feature-loop is the primary entry point** for any non-trivial feature.
- **Pydantic models at every boundary.** Every route declares request and `response_model` types; never return raw ORM objects or untyped dicts.
- **Async all the way down.** Don't call blocking I/O inside `async def` routes; use async drivers or a plain `def` route.
- **Dependencies via `Depends`** for DB sessions, auth, and settings; no module-level globals for request state.
- **Config from environment** (e.g. pydantic-settings); no secrets in code.
- **Every schema change ships a migration** reviewed by `migration-safety`.
- **Every commit passes the full 42-rule security-audit** before push.
- **No speculative abstraction** — extract on third repeat, not the first.
- **Self-healing is authoritative during Stage 3.** Do not intervene mid-loop; up to 3 retries then ESCALATE / SELF-HEAL-EXHAUSTED.

## Skills that fit this stack

Use:

- `feature-loop`, `feature-review`, `feature-audit` — stack-agnostic orchestration and review.
- `pre-merge-check`, `quality-assurance`, `null-safety-scan`, `complexity-check`, `dead-code-scan`, `dependency-hygiene`, `test-coverage-delta` — all support Python (ruff, mypy, pytest / pytest-cov).
- `migration-safety` — supports Alembic and raw SQL.
- `api-mock-parity` — when a client keeps mocks against this API's OpenAPI / pydantic schemas.
- `security-audit`, `security-scan`, `pentesting` — API attack surface applies directly.
- `perf-budget` — API p95 latency budget applies (ignore the bundle and React Native metrics).
- `adr-writer`, `generate-docs`, `git-push`, `pr-open`, `team-pulse` — workflow skills, stack-agnostic.

Skip:

- `figma-to-code`, `figma-to-code-skill`, `react-native-optimization-and-architecture` — React Native only.
- `contract-drift-check`, `system-design` — assume the RN + NestJS + Python monorepo layout; useful only if this service is the `apps/ai-engine` of such a monorepo.

## Framework mapping

The manager records this project as `FASTAPI` in its persistent
`config.json`. Change it from the stack picker and re-inject skills to
regenerate this file.

## Cache discipline

This CLAUDE.md is loaded at the top of every conversation. Keep it stable.
Volatile per-area concerns belong in nested `CLAUDE.md` files.
