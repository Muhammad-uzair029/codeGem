---
name: dependency-hygiene
description: Audits third-party dependencies across TS/JS + Python workspaces for unused packages, duplicate versions, peer-dep conflicts, license drift, and outdated critical libraries. Broader than `security-scan` (which is vuln-only). Use when the user types "dependency-hygiene", "/dependency-hygiene", "check deps", "unused packages", "dep drift", "audit deps", "why is node_modules so big", or before a release / dependency-bump PR.
---

# dependency-hygiene — Third-party dep auditor

## Objective
Answer one question per run: **is this repo's dependency footprint minimal, current, and consistent?** Separate concerns from `security-scan` (CVEs) and `pre-merge-check` (build passes). This skill is about hygiene — dead weight, silent version drift, license risk.

## How to run

Run in **parallel** across workspaces. Each finding tagged with a rank and a suggested fix.

### 1. Detect stack + workspaces
- `package.json` at root → TS/JS. Package manager from lockfile: `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`.
- `pnpm-workspace.yaml` / workspaces array → monorepo. Scan every package.
- `pyproject.toml`, `requirements*.txt`, `Pipfile` → Python. Detect uv/poetry/pip.

### 2. Unused-dep scan
- TS/JS: run `npx depcheck --json` per workspace. Ignore false positives seeded from `.depcheckrc` if present.
- Python: `pip-check` / `deptry` per Python project.
- Report:

```
| Workspace           | Package         | Last import found | Rank |
|---------------------|-----------------|-------------------|------|
| apps/backend-api    | moment          | none              | M    |
| apps/ai-engine      | pandas          | scripts/analysis  | L (dev-only) |
```

Rank rules:
- Prod dep with zero imports → **H**
- Dev dep with zero imports → **M**
- Dep only imported in tests, listed under `dependencies` (not `devDependencies`) → **M**

### 3. Duplicate-version scan
- TS/JS: `pnpm why <pkg>` / `npm ls <pkg>` for every duplicate in the lockfile. Report packages with ≥ 2 resolved versions.
- Python: cross-project version diffs for the same package across workspaces.
- Rank: any duplicate is **M** by default; **H** if the package is a runtime peer of a large lib (React, RN, NestJS).

### 4. Peer-dep conflict scan
- Parse install-time warnings from `pnpm install --frozen-lockfile` / `npm ls`.
- Report every unresolved peer as **H** (silent runtime bug waiting to happen).

### 5. Outdated critical libs
Detect critical libs by category and check semver drift vs latest stable:

| Category          | Libs to check                                          | Fail rank |
|-------------------|--------------------------------------------------------|-----------|
| Runtime           | `node`, `python`, `react`, `react-native`, `expo`      | **H** if major behind |
| Framework         | `@nestjs/*`, `fastapi`, `next`                         | **H** if major behind |
| Security-critical | `bcrypt`, `jsonwebtoken`, `helmet`, `cryptography`     | **H** if minor behind |
| Type/lint         | `typescript`, `eslint`, `ruff`, `mypy`                 | **M** if major behind |

Non-critical libs: report as `L` only. Don't spam the report.

### 6. License drift
- Run `license-checker --json` (TS/JS) and `pip-licenses --format=json` (Python).
- Fail on: `GPL-3.0`, `AGPL-3.0`, `SSPL`, `BUSL` unless the workspace declares an allow-list in `.licenses.json`.
- Warn on: `LGPL`, `MPL`, no-license, license-mismatch (package.json says MIT but LICENSE file is Apache).

### 7. Lockfile drift
- `pnpm-lock.yaml` or `package-lock.json` newer than `package.json`? OK.
- `package.json` newer than lockfile? **H** — someone edited manifest without reinstalling. Report the delta.

## Output

Save to `docs/deps/hygiene-<YYYY-MM-DD>.md`. Print rollup + verdict to stdout.

```markdown
# dependency-hygiene — <YYYY-MM-DD>

**Verdict:** clean | drift(<n>) | broken(<n>)
**Scope:** <N> workspaces, <M> packages total

## Rollup
- Unused: 4 (H:1 M:2 L:1)
- Duplicates: 2 (M:2)
- Peer conflicts: 1 (H:1)
- Outdated critical: 1 (H:1)
- License warnings: 0
- Lockfile drift: none

## Details
...
```

## Hard rules
- **Do not auto-remove.** Only report. Removal must be a human decision — some deps are dynamically required.
- **Ignore vendored / mirrored packages** listed in the workspace `.dephygieneignore`.
- **Do not overlap with `security-scan`.** If a finding is a CVE, that's `security-scan`'s report. This skill's job is hygiene, not vulns.
- Verdict is `broken` if any rank-H finding exists — block the PR.
