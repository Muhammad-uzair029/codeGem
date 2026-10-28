# brainstormer — Stage 0

## Purpose
Zero-hallucination expansion of the raw brief. Every assumption ties to evidence: a spec line, a code file, a related feature's spec, or the source doc itself.

## Inputs
- Raw brief file (from inbox or `--from-doc`).
- `.claude/specs/_index.md` — registry of every prior feature.
- Related features' `index.md` (discovered per rules below).
- `CLAUDE.md`, `.claude/specs/_project.yaml`.
- Target project's source tree (read-only, via Read/Grep).

## Related-feature discovery
1. Keyword match on brief nouns/verbs vs registry rows.
2. Overlap on the `touches (workspaces)` column.
3. Shared contract names.
4. Explicit mentions in the brief.

For every match, open the related feature's `index.md` and note the relation (extends / overlaps / depends-on / conflicts-with) + shared contracts.

## Parallel research (see `../SKILL.md` §Multi-agent policy)
If ≥ 3 related features are found or the brief touches ≥ 2 workspaces, dispatch read-only sub-agents in parallel: one per related feature (returns relation + shared contracts, each with a file:line citation) and/or one per workspace (returns the existing modules, patterns, and contracts the feature will meet). For large briefs, split the 9 edge-case categories across ≤ 3 agents. You merge their results into the four outputs; drop any claim that lacks a citation.

## Edge-case exhaustion (9 categories — ALL mandatory)

Fill `templates/edge-cases.md` completely. Each case gets: **trigger · expected behavior · test hook · source**. A case may be marked `N/A` only with a cited reason (e.g., "backend-only feature — Platform category N/A").

Categories:
1. **Input validation** — empty, null, oversized, malformed, wrong-type, injection, unicode, RTL, whitespace, decimal edge.
2. **Auth / authz** — unauth, expired session, insufficient role, cross-tenant access, role escalation, disabled account.
3. **Concurrency** — race, double-submit, lock timeout, deadlock, out-of-order events, replay.
4. **Failure modes** — network drop, downstream 5xx, downstream timeout, partial write, retry storm, circuit-break.
5. **Data lifecycle** — create-existing, read-missing, update-stale, delete-referenced, restore, migrate mid-flight.
6. **State transitions** — illegal transition, replay, idempotency key, resume-after-crash.
7. **Boundary** — empty list, max size, unicode name, timezone, DST, leap day, currency rounding, pagination end.
8. **Platform** — mobile offline, background/foreground, low-battery, cold start, a11y, i18n, RTL.
9. **Rollout** — flag off, mid-rollout, kill-switch fired, backward compat, old-client + new-server.

## Outputs (all four — refuse to finish if any missing)
- `.claude/specs/<mod>/<feat>/brief-refined.md` — from `templates/brief-refined.md`.
- `.claude/specs/<mod>/<feat>/user-journeys.md` — from `templates/user-journeys.md`. Every actor × trigger, numbered, happy + failure + abandoned paths.
- `.claude/specs/<mod>/<feat>/edge-cases.md` — from `templates/edge-cases.md`. 9 categories filled.
- `.claude/specs/<mod>/<feat>/open-questions.md` — from `templates/open-questions.md`. Any unresolved question. Tag `BLOCKING` if it must be answered before stage 1.

## Hard rules
- **Zero invented facts.** Every assumption in `brief-refined.md` has a `source:` line pointing at evidence.
- **No guessing between two related features.** If overlap is ambiguous, log a `BLOCKING` question.
- **No edge case skipped.** All 9 categories filled. If truly N/A, cite why.
- **No implementation detail.** Brainstormer never proposes code or file paths — that's stage 1's job.

## Abort conditions
- Any `BLOCKING` open question → stop, print to stdout, wait for `revise` (also fires under `-y`).
- Insufficient context to differentiate two related features → same.
- Missing input doc → hard error.

## Exit conditions
- All four files written, zero `BLOCKING` questions, default mode → orchestrator halts for `approve`.
- All four files written, zero `BLOCKING` questions, `--force-autonomous` / `-y` → auto-advance to stage 1 (see §Autonomous mode).
- With `BLOCKING` questions → orchestrator halts for `revise` (default) or exits 30 (autonomous).

## Autonomous mode (`--force-autonomous` / `-y`)

When invoked with `-y`, the brainstormer MUST classify every open question up front:

- `BLOCKING` — missing product intent that safe defaults cannot invent. Examples: which payment provider, which retention window, whether a feature is customer-facing vs. internal, what the pricing model is, whether PII is stored. These still halt the loop.
- `NON-BLOCKING` — implementation posture the loop can safely default. These must be resolved in-place before writing `open-questions.md`; each resolution line reads:
  ```
  - question: <question>
    resolution: auto-default (<rule id from Auto-default catalog>)
    rationale: <one line>
    source: auto-default-catalog
  ```

### Auto-default catalog

| Rule id | Question shape | Default resolution |
|---------|----------------|--------------------|
| ad-error-boundary | "What renders when the screen throws?" | Error boundary at the screen root; boundary shows `templates/frontend-ui.md § Empty / loading / error state` fallback; report the crash via Sentry breadcrumb (`sec-02`). |
| ad-loading-state | "What renders while data loads?" | Skeleton if the shape is known, spinner otherwise. Never a blank screen. |
| ad-empty-state | "What renders when the list is empty?" | Empty-state component with the primary CTA that would create the first item. Never "No data" alone. |
| ad-network-retry | "Should we retry on network error?" | Idempotent GETs: retry ×2 with exponential backoff (250ms base, capped 2s). Non-idempotent: no auto-retry; surface a user-triggered retry. |
| ad-feature-flag | "Should this ship behind a flag?" | Yes — flag off by default, name = `<mod>_<feat>_enabled`, kill-switch drops to previous UI/behavior. |
| ad-auth-error-uniform | "What text on failed login?" | `"Invalid credentials"` — uniform per `sec-41`, constant-time compare per `sec-11`/`sec-42`. |
| ad-rate-limit | "What limit for this endpoint?" | Global + per-user limit per `sec-13`; conservative defaults 60 rpm / user, 600 rpm / IP unless the spec says otherwise. |
| ad-cache-ttl | "How long should we cache?" | React Query: `staleTime` 30s, `cacheTime` 5m unless the data mutates on user action. |
| ad-input-validation | "Where do we validate the field?" | zod/pydantic at the boundary per `sec-29`. Mirror rules client + server. |
| ad-i18n | "How do we handle translations?" | Weglot per `sec-10`; no parallel pipeline. |
| ad-log-lines | "What do we log?" | One structured log per state transition; PII redacted per `sec-39`. |
| ad-pagination | "Page size / infinite scroll?" | Cursor pagination, page size 20; infinite scroll on mobile, page controls on web. |
| ad-a11y | "What a11y roles?" | Every interactive element gets `accessibilityLabel` + `accessibilityRole`; contrast ≥ 4.5:1 per WCAG AA. |
| ad-timeout | "What request timeout?" | 10s soft, 30s hard; on timeout, show retry UI per `ad-network-retry`. |

If a non-`BLOCKING` question does not match a rule, the brainstormer MUST either (a) reclassify it as `BLOCKING`, or (b) add a new rule to `templates/open-questions.md` §Auto-default catalog extension in the same run, cite a source, and use it. Never resolve without a citation.

Append a `> autonomous-mode: on` line to `brief-refined.md` and `open-questions.md` so reviewers can filter after the fact.

## On revise
Master orchestrator appends the reviewer feedback under a `## Reviewer input` section in `brief-refined.md`, then re-runs this agent. New assumptions born from feedback get `source: reviewer`.
