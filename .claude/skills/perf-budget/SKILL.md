---
name: perf-budget
description: Tracks and enforces performance budgets over time — frontend bundle size, backend API p95 latency, React Native startup / JS-thread time. Baselines the metrics under `docs/perf/baseline.json`, diffs against the current run, blocks the PR if any budget regresses beyond the tolerance. Use when the user types "perf-budget", "/perf-budget", "did I regress perf", "check bundle size", "startup time regression", "api latency budget", or before merging perf-sensitive changes.
---

# perf-budget — Performance-budget gate

## Objective
Prevent silent slow-death. Without budgets, bundles grow by 4 KB a week for a year and no one notices. This skill turns "how big is the bundle?" into a gate that blocks the PR when it exceeds the agreed cap.

## Budgets tracked (defaults)

| Metric                                           | Baseline source                  | Tolerance |
|--------------------------------------------------|----------------------------------|-----------|
| Web / RN bundle: JS main bundle gzipped size     | metro / webpack / vite report    | +5 %      |
| RN cold-start time (JS → first render)           | Flipper / Perf Monitor / manual  | +10 %     |
| Backend API p95 latency per top-10 routes        | k6 / autocannon smoke run        | +15 %     |
| Backend API request-body size cap (per route)    | route decorator / config         | hard cap  |
| AI-engine cold-start time                        | worker warmup log                | +15 %     |
| AI-engine per-request p95                        | k6 / structured log              | +15 %     |

Overrides via `.claude/skills/perf-budget/budgets.json`.

## How to run

### 1. Detect scope
- Frontend: `apps/frontend-ui/` — build production bundle, capture size + startup metric if available.
- Backend: `apps/backend-api/` — run k6 / autocannon smoke against a local `dev` server on the top 10 routes (by controller definitions).
- AI: `apps/ai-engine/` — run cold-start warmup + a small request batch.

Only run the relevant lanes based on which workspaces the diff touches.

### 2. Read baseline
- Load `docs/perf/baseline.json`.
- If missing → skill runs in `establish-baseline` mode: capture metrics, write file, exit 0 with note.

### 3. Measure current
Run the lane commands in **parallel**:

- Frontend bundle: `pnpm --filter frontend-ui build` → parse Metro / Webpack stats JSON for main / vendor gzip sizes.
- Backend p95: `pnpm --filter backend-api dev` (in background) → `npx autocannon -d 20 -c 20 <route>` per top-10 route → capture p95.
- Backend request-body caps: read fastify / express `bodyParser` config + NestJS `@Body()` decorator options. No runtime measurement — spec check only.
- AI cold-start / p95: python worker warmup → time first response; batch 50 requests → capture p95.

### 4. Diff vs baseline
For each metric:

```
delta_pct = (current - baseline) / baseline * 100
```

- `delta_pct <= 0`: `improved`, log for posterity.
- `0 < delta_pct <= tolerance`: `within budget`.
- `delta_pct > tolerance`: `over budget` → **H**.
- Hard-cap violation: **CRIT**.

### 5. Report

Save to `docs/perf/report-<YYYY-MM-DD>.md`.

```markdown
# perf-budget — 2026-07-05

**Verdict:** ok | regressed(<n>) | broken(<n>)

| Metric                              | Baseline | Current | Δ      | Verdict     |
|-------------------------------------|----------|---------|--------|-------------|
| frontend-ui/main.js gzip            | 312 KB   | 341 KB  | +9.3 % | over budget |
| POST /orders p95                    | 120 ms   | 128 ms  | +6.7 % | within      |
| RN cold-start (JS→first-render)     | 810 ms   | 880 ms  | +8.6 % | within      |
| ai-engine /summarize p95            | 1.4 s    | 1.9 s   | +35 %  | over budget |

## Regressions
- frontend-ui/main.js gzip: +29 KB. Likely culprit: `apps/frontend-ui/src/orders/OrderRow.tsx` imports `lodash` (full).
  Suggest: `import { debounce } from 'lodash/debounce'` OR replace with vanilla helper.
- ai-engine /summarize: +500 ms p95. Likely culprit: new synchronous model call in critical path.
```

### 6. Update baseline (opt-in)
Baseline updates are explicit — never automatic. If the user confirms the regression is expected (e.g. new feature), append a note and update `docs/perf/baseline.json` with the new value. Otherwise keep the old baseline so subsequent runs still gate.

## Hard rules
- **Never update the baseline automatically.** Regressions must be acknowledged.
- **Prefer local reproduction over remote metrics.** This skill is a PR gate, not observability. Point users at Grafana / DataDog for prod trends.
- **Verdict `broken` blocks the PR** — hard-cap violations only. Verdict `regressed` warns; the lead decides.
- **Metrics reported without a baseline are noise.** Establish baseline first, gate second.
