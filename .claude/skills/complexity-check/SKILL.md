---
name: complexity-check
description: Enforces per-function and per-file complexity ceilings — cyclomatic complexity, cognitive complexity, function length, file length, parameter count, nesting depth. Blocks over-ceiling, warns near-ceiling. Works on TS/JS + Python. Use when the user types "complexity-check", "/complexity-check", "is this code too complex", "cyclomatic", "cognitive complexity", "long function check", or as a merge gate.
---

# complexity-check — Per-symbol complexity ceilings

## Objective
Catch the 40-line callback inside a hook inside an if-statement **before** it lands in `main`. Enforce concrete ceilings that map to what a lead calls "please split this up".

## Ceilings (default)

| Metric                        | Warn | Fail |
|-------------------------------|------|------|
| Cyclomatic complexity / func  | 10   | 15   |
| Cognitive complexity / func   | 12   | 20   |
| Function length (LOC)         | 60   | 100  |
| File length (LOC)             | 400  | 700  |
| Parameter count / func        | 5    | 8    |
| Nesting depth                 | 4    | 6    |
| React component render LOC    | 80   | 150  |
| React component `useX` count  | 8    | 12   |

Overrides via `.claude/skills/complexity-check/config.json`.

## How to run

Scope defaults to **files changed in the current branch vs `main`** unless the user passes `--all`.

### 1. Detect stack and pick tools
- TS/JS: `npx eslint --rule 'complexity: [\"error\", 15]' --rule 'max-lines-per-function: [\"error\", 100]' --rule 'max-lines: [\"error\", 700]' --rule 'max-depth: [\"error\", 6]' --rule 'max-params: [\"error\", 8]' --format=json <paths>` — reuse the project ESLint config where possible, else run standalone.
- Python: `radon cc -j <paths>` (cyclomatic), `radon mi -j <paths>` (maintainability), `radon raw -j <paths>` (LOC). Cognitive via `xenon` or `cognitive_complexity` package.

### 2. React-specific rules
For `.tsx` / `.jsx`:
- Count `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`, `useContext`, custom `use*` hooks in the top-level function body.
- Count lines inside the returned JSX tree.
- Flag if either exceeds ceiling.

### 3. Rank findings

| Situation | Rank |
|-----------|------|
| Any metric over Fail ceiling | **H** — block |
| Any metric over Warn ceiling | **M** — advisory |
| Three or more Warn-level metrics in one function | **H** — smell aggregation |
| Function exports a public API (in an `index.ts`, controller, or component barrel) AND is over Warn | Escalate one rank |

### 4. Suggested split
For every **H**, print a suggested split pattern:

- Long function → extract helper (`extract-function`)
- Long React component → split by concern (`derive props`, `useReducer`, custom hook)
- Deep nesting → early-return / guard clauses
- Too many params → group into options object with typed shape

## Output

```markdown
# complexity-check — <YYYY-MM-DD>

**Verdict:** clean | warn(<n>) | fail(<n>)
**Scope:** <N> files

| File                                        | Symbol              | Metric               | Value | Ceiling | Rank | Suggested split |
|---------------------------------------------|---------------------|----------------------|-------|---------|------|-----------------|
| apps/backend-api/src/orders/orders.svc.ts   | createOrder         | cyclomatic           | 21    | 15      | H    | Extract validators |
| apps/frontend-ui/src/orders/OrderScreen.tsx | OrderScreen         | render LOC + hooks   | 190 / 14 | 150/12 | H    | Split into <OrderHeader>, <OrderBody>, useOrderData hook |
```

## Hard rules
- **Do not over-report.** Silence Warn-level findings on files not in the diff unless `--all` is passed.
- **Do not silence with `// eslint-disable-next-line complexity`.** If a file needs an exception, it goes in `.claude/skills/complexity-check/config.json` with a comment on why. Grep the config in review.
- **Ceilings are ceilings, not targets.** Do not lower them without lead sign-off.
- Verdict is `fail` if any **H** finding exists — block PR.
