# Project — orchestrated by SkillFacet (Go)

This project was scaffolded (or adopted) by SkillFacet with the
`GO` stack preset. See `.claude/skills/` for the injected skill matrix.
Canonical entry points:

- `feature-loop` — 6-stage autonomous feature-development engine.
- `quality-assurance` — injected as a canonical dir; its checks are TS/JS +
  Python only, so the Go commands below are the real compile gate.
- `figma-to-code` — injected as a canonical dir, but it emits React Native
  code. Not relevant to Go (see skills below).

## Directory blueprint (enforced by SkillFacet)

```
[Client-Project-Root]/
├── CLAUDE.md                       <- (this file — global agent behavior + verification loop macros)
├── .claude/
│   ├── specs/
│   │   ├── inbox/                  <- dropped feature-brief.md files
│   │   └── active/                 <- decomposed active feature spec-sets
│   └── skills/                     <- injected skill matrix
├── cmd/<app>/main.go               <- one main package per binary
├── internal/                       <- private packages (handlers, services, storage)
├── migrations/                     <- SQL migrations, if any
├── go.mod
└── go.sum
```

## Verification-loop macros

- `/feature-loop -y <mod>/<feat>` — end-to-end unattended run (Stages -1 → 5).
- `/feature-loop --verify-only <mod>/<feat>` — Stage 3 alone against current diff.

Verification commands (the Stage 3 verifier must run these; all must pass):

| Check      | Command                                         |
| ---------- | ----------------------------------------------- |
| Format     | `gofmt -l .` (must print nothing)               |
| Vet        | `go vet ./...`                                  |
| Lint       | `golangci-lint run` (when the repo configures it) |
| Tests      | `go test -race ./...`                           |
| Build      | `go build ./...`                                |

## Global agent behavior rules

- **Feature-loop is the primary entry point** for any non-trivial feature.
- **Handle every error.** Never discard an `error` with `_`; wrap with context using `fmt.Errorf("...: %w", err)`.
- **`context.Context` is the first parameter** of any function that does I/O or may block, and is passed down, not stored in structs.
- **No `panic` for expected failures**; return errors. Reserve panics for programmer bugs.
- **Keep packages under `internal/`** unless they are meant to be imported by other modules.
- **`go mod tidy` leaves no diff** — go.mod / go.sum stay in sync with imports.
- **Table-driven tests** next to the code (`*_test.go`); new behaviour ships with tests.
- **Every commit passes the full 42-rule security-audit** before push.
- **No speculative abstraction** — define interfaces where they are consumed, on the third repeat, not the first.

## Skills that fit this stack

Use:

- `feature-loop`, `feature-review` — stack-agnostic orchestration and review; the verifier should use the Go commands above.
- `security-audit`, `security-scan`, `pentesting` — rule- and attack-surface-based; apply to Go services.
- `migration-safety` — supports raw SQL migrations.
- `adr-writer`, `generate-docs`, `git-push`, `pr-open`, `team-pulse` — workflow skills, stack-agnostic.

Skip (or expect partial results):

- `pre-merge-check`, `quality-assurance`, `null-safety-scan`, `complexity-check`, `dead-code-scan`, `dependency-hygiene`, `test-coverage-delta` — built for TS/JS + Python toolchains, not Go. Use `go vet`, `golangci-lint`, and `go test -cover` instead.
- `feature-audit` — dispatches many of the TS/JS + Python skills above; only its stack-agnostic parts apply.
- `api-mock-parity`, `perf-budget` — assume a JS client / Node or Python backend layout.
- `figma-to-code`, `figma-to-code-skill`, `react-native-optimization-and-architecture` — React Native only.
- `contract-drift-check`, `system-design` — assume the RN + NestJS + Python monorepo layout.

## Framework mapping

The manager records this project as `GO` in its persistent `config.json`.
Change it from the stack picker and re-inject skills to regenerate this
file.

## Cache discipline

This CLAUDE.md is loaded at the top of every conversation. Keep it stable.
Volatile per-area concerns belong in nested `CLAUDE.md` files.
