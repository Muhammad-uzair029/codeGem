---
name: adr-writer
description: Guided Architecture Decision Record writer. Forces the engineer introducing a new library, pattern, or cross-cutting concern to spell out context / decision / consequences / alternatives on one page, saved to `docs/adr/NNNN-<slug>.md`. Use when the user types "adr-writer", "/adr-writer", "write an ADR", "record this decision", "new library check", or whenever a diff adds a top-level dependency or introduces a new architectural pattern (e.g. state manager, orchestration layer, message bus).
---

# adr-writer — Guided Architecture Decision Records

## Why
Juniors introduce libraries without stating trade-offs. Three months later the lead cannot remember why `zustand` was chosen over `redux-toolkit`. ADRs are the audit trail for architecture. This skill enforces the format and files them consistently.

## When to write one (heuristic)
Write an ADR if the diff does **any** of:
- Adds a new top-level runtime dependency to `package.json` / `pyproject.toml`
- Introduces a new architectural pattern (state manager, message bus, ORM, auth strategy)
- Changes a cross-workspace contract shape (see also `contract-drift-check`)
- Chooses between two vendor SDKs, deployment targets, or infra services
- Alters a public HTTP contract / URL scheme
- Reverses a prior ADR

If none apply, skip. Do not spam ADRs on typo fixes.

## Format — one page, four sections, no fluff

`docs/adr/NNNN-<slug>.md`:

```markdown
# NNNN. <title>

**Status:** proposed | accepted | superseded-by(NNNN) | deprecated
**Date:** YYYY-MM-DD
**Owner:** @<github-handle>

## Context
2–5 sentences on the problem. Focus on the constraints, not the solution.

## Decision
1–3 sentences. State what we are doing, imperative voice.

## Consequences
- What gets easier
- What gets harder
- What we can no longer do

## Alternatives considered
- **<option>** — one line on why not
- **<option>** — one line on why not
```

## How to run

### 1. Collect inputs
Prompt the user for:
- Title (3–7 words)
- Slug (auto-derive kebab-case from title)
- Owner GitHub handle (default: current git config `user.name` translated)
- Free-form context text (or reference an issue / PR)

If invoked non-interactively with a diff on stdin, extract:
- The added dependency name + version (if any)
- The new pattern introduced (best guess from imports and file paths)
- Populate skeleton, then flag which sections still need human input.

### 2. Number
- Find next N by scanning `docs/adr/` → max NNNN + 1 (zero-padded to 4).
- Never renumber. Numbers are permanent.

### 3. Fill the skeleton
- Populate `Status: proposed`, `Date: <today>`, `Owner: <handle>`.
- Write the four sections. Enforce ≤ 1 page (~ 60 lines).
- Reject empty `Alternatives considered`. If the user cannot name one alternative, they have not thought about it.

### 4. Index
Append the entry to `docs/adr/README.md` (create if missing):

```markdown
# ADR Index
| N    | Title                        | Status   | Date       |
|------|------------------------------|----------|------------|
| 0001 | Choose Zustand for RN state  | accepted | 2026-07-05 |
```

### 5. Link
- Print the file path.
- If the user is on a PR branch, remind them to reference the ADR from the PR description.

## Hard rules
- **Alternatives section is mandatory.** No alternatives = the ADR is fiction.
- **Do not silently supersede.** If a new ADR contradicts an old one, the old ADR's status flips to `superseded-by(NNNN)`. Both files stay.
- **No revisionist history.** Once `Status: accepted`, do not edit past sections; write a follow-up ADR instead.
- **≤ 1 page.** If it needs more, the decision is not decided — split it.
