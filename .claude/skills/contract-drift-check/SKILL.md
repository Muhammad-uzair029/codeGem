---
name: contract-drift-check
description: Detects schema drift across the three workspaces of this monorepo — `apps/frontend-ui` (React Native), `apps/backend-api` (NestJS), `apps/ai-engine` (Python). Enforces the CLAUDE.md rule "type contracts at boundaries" by finding renamed / removed / newly-required fields that only one side of the boundary knows about. Use when the user types "contract-drift-check", "/contract-drift-check", "check contracts", "schema drift", "are frontend and backend in sync", "did the API change break the client", or before merging any diff that touches shared DTOs / OpenAPI / zod / pydantic / TS types crossed between workspaces.
---

# contract-drift-check — Cross-workspace contract auditor

## What this skill enforces

`CLAUDE.md` states: **"Type contracts at boundaries. Inter-app data crosses through versioned schemas, not implicit shapes."** This skill is the enforcement. It scans the three workspaces for the schemas that live at each seam and flags drift before the client hits `undefined` in production.

## Where contracts are expected to live

Discover contracts in this precedence order — stop at the first that exists:

1. `packages/contracts/**` or `packages/schemas/**` — the ideal: one versioned source of truth, imported by all three apps
2. `apps/backend-api/openapi.{json,yaml}` or `apps/backend-api/src/**/*.dto.ts` — backend-owned, generated / consumed by frontend
3. `apps/ai-engine/**/schemas/*.py` (`pydantic.BaseModel`) — Python-owned
4. Inline zod / TS types in `apps/frontend-ui/src/api/**` — client-owned mirrors

Missing a contract source is itself a finding: `WARN — no versioned contract package; boundary types are implicit`.

## How to run

### 1. Enumerate every boundary

For each pair of workspaces that share data (frontend ↔ backend, backend ↔ ai-engine, frontend ↔ ai-engine if applicable), list the endpoints / events / message shapes that cross the seam. Sources:

- HTTP routes exposed by `apps/backend-api/src/**/*.controller.ts`
- FastAPI / worker handlers exposed by `apps/ai-engine/**/routers/*.py`
- Websocket / SSE messages, if any
- Queue message shapes (`bull`, `sqs`, `celery`, `pubsub`) — treat producer + consumer as two ends of a contract

### 2. Extract the shape on each side

For each boundary, extract the type shape on both ends:

- Backend response type (from the controller return, the DTO class, or the OpenAPI schema)
- Client request/response type (from `apps/frontend-ui/src/api/**` or generated client)
- Python request/response (from the pydantic `BaseModel`)

Normalize to a shared representation: `{ field, type, optional, deprecated? }`.

### 3. Diff the shapes

For every field:

| Situation | Rank | Report |
|-----------|------|--------|
| Field exists on backend, missing on client, response type | **H** | Client will not render / read new data (dead field). Confirm intentional. |
| Field exists on backend, missing on client, request type | **H** | Client will not send required data — 400s in prod. |
| Field renamed on backend, client still uses old name | **CRIT** | Silent breakage. Block. |
| Field marked `required` on one side, `optional` on the other | **H** | Runtime error path. |
| Type widened on one side, narrowed on the other (e.g. `string` → `string \| null`) | **M** | Null-safety leak. Pair with `null-safety-scan`. |
| Field marked `@deprecated` on producer, still consumed | **M** | Track removal plan. |
| Field added, consumed nowhere | **L** | Dead field. Suggest removal or usage. |

### 4. Versioning check

- Endpoint path or DTO carries an explicit version (`/v1/`, `V1CreateOrderDto`, `X-API-Version`)? `PASS`.
- No version scheme + shape has changed since last audit? `FAIL — unversioned breaking change`.

Compare against `docs/contracts/last-audit.json` if present; otherwise establish it as the baseline.

### 5. Enum / literal-union drift

For every enum / literal union crossed at a boundary, enumerate members on each side. New member on producer but not consumer → **H** (client will hit `default` branch or throw). Removed member on consumer but still produced → **CRIT** if it's a discriminant.

### 6. Ownership check

For each contract, name its owner:

- Contract in `packages/contracts` — owner = the workspace that wrote it (git blame)
- Contract inline in backend — owner = backend
- Contract inline in client — owner = client (bad; recommend moving to `packages/contracts`)

Multi-owner (edited by both frontend and backend within the last 30 days) → **WARN — contested contract**. Nominate a single owner in the report.

## Output

Save to `docs/contracts/drift-<YYYY-MM-DD>.md`. Also update `docs/contracts/last-audit.json` with the current normalized shapes as the new baseline (only after user confirms fixes).

```markdown
# contract-drift-check — <YYYY-MM-DD>

**Verdict:** clean | drift(<n>) | breaking(<n>)

## Boundaries scanned
- POST /orders            (backend ↔ frontend)
- GET  /orders/:id        (backend ↔ frontend)
- POST /ai/summarize      (backend ↔ ai-engine)
- queue: `order.created`  (backend → ai-engine)

## Findings

| Boundary                | Field         | Situation                        | Rank |
|-------------------------|---------------|----------------------------------|------|
| POST /orders            | customer_id   | renamed on backend, not on client| CRIT |
| GET  /orders/:id        | total_cents   | new field, not consumed          | L    |

## Suggested fixes
- Move contract for `Order` from `apps/backend-api/src/orders/order.dto.ts` to `packages/contracts/order.ts` and import both sides. Owner: backend.
- Add discriminant version `v: 1` to `order.created` queue message; consumer branches on `v`.
```

## Hard rules

- **Do not silently fix a CRIT drift.** Flag it; a lead / owner decides which side to change.
- **Every drift must name both files** (producer and consumer) with line numbers, so the fix is one grep away.
- **The baseline lives in `docs/contracts/last-audit.json`.** Overwrite it only after user confirms the drifts are resolved or accepted.
- **Ignore internal-only helper types** — only fields that actually cross a workspace boundary count as contracts.
