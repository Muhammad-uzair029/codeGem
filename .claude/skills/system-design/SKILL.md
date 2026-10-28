---
name: system-design
description: End-to-end system design auditor for projects spanning a React Native client, a NestJS backend, and a Python AI service. Audits cross-service contracts, race conditions, concurrency, performance budgets, production readiness, and UI/UX modularity in one pass. Use when the user types "system-design", "/system-design", "design review", "architecture review", "race condition check", "audit my system", "is this production ready", or whenever the user shares a feature, route, screen, or AI endpoint and asks for a design opinion — even when only one side of the stack is visible, the skill must trace its peers (frontend ↔ backend ↔ AI engine) and flag cross-cutting issues. Auto-trigger when the user mentions production, scale, race condition, deadlock, flaky behavior, latency budget, contract drift, or rollout risk.
---

# System Design — End-to-End Audit

## What this skill does

Given any entry point in the project — a React Native screen, a NestJS controller, a Python AI handler, or a free-form description of a feature — this skill runs a **full-stack audit**. It traces the request across services, identifies the contracts crossed, and surfaces design problems that single-file review cannot catch: race conditions, contract drift, performance regressions, production readiness gaps, and UI/UX modularity violations.

The skill is opinionated and **strict**. It blocks at the gate (per project preference) when issues are merge-blocking, and downgrades to advisory only when the issue is genuinely cosmetic.

## Project stack assumption

This skill assumes the canonical stack of this org:

| Workspace            | Stack                     | Owns                                       |
| -------------------- | ------------------------- | ------------------------------------------ |
| `apps/frontend-ui`   | React Native              | Rendering, client state, navigation        |
| `apps/backend-api`   | NestJS                    | Auth, persistence, business rules          |
| `apps/ai-engine`     | Python (FastAPI / worker) | Model calls, retrieval, tool execution     |

Stack-specific deep dives (RN, NestJS, Python AI) are layered in as separate, root-level skills. When one of those skills is available alongside this audit, defer to it for stack-internal style; this skill stays focused on the cross-service seams.

If the project deviates (e.g. a Next.js client or a Go worker), still run the audit — the universal principles below apply regardless of stack.

## How to run the audit

Run the steps in order. Do not skip step 1 — most real issues live at the seams, not inside any one file.

### Step 1 — Map the request

Before reviewing any code, build a one-paragraph map of the request:

1. **Entry point** — the file the user shared (or the feature description).
2. **Peers** — the other services this request touches. Find them by grepping for:
   - Backend route paths referenced by the client (`/api/...`, RPC names, queue names).
   - AI handler names invoked by the backend (function/endpoint names, model job keys).
   - Shared contract types (look in `contracts/`, `packages/shared`, `*.proto`, or DTO classes).
3. **Direction of dataflow** — who calls whom, sync vs async, and where state lives.

If the peer code is missing from the repo (e.g. user shared only the backend route), say so explicitly — do not invent the peer's behavior. Ask for the file or grep for evidence; never guess the schema.

### Step 2 — Apply the universal principles

Every audit checks the seven principles below. They are stack-agnostic and the most common source of production incidents.

### Step 3 — Run the cross-cutting checks

Even when the user only shares one file, walk through the cross-cutting checklist further down. Each check is answered with evidence from the repo — not assumed.

### Step 4 — Report

Output uses the **Report Template** below. The report is the deliverable — do not bury findings in conversational prose.

## Universal Principles (apply to every audit)

### 1. Single source of truth per concern

Auth lives in `backend-api`. Inference lives in `ai-engine`. Rendering lives in `frontend-ui`. A change that puts business rules in the client, or persistence in the AI engine, or model calls in the backend route, is a layering violation regardless of how convenient it looks. The reason is debuggability — when a value is wrong in production, the on-call engineer must know which service to open first. Two sources of truth means the answer is "it depends," which is the worst answer at 3 a.m.

### 2. Contracts at boundaries are typed and versioned

Every cross-service call passes through a schema (TypeScript types in `contracts/`, Pydantic models on the Python side, or `.proto` for cross-runtime). Breaking changes get a new version, not a silent reshape. The reason is rollout safety — clients on older app store builds will hit newer backends for weeks; if the contract drifts silently, those users see crashes the team cannot reproduce.

### 3. Validation lives at the boundary, not in the middle

The first function that receives untrusted input validates it. Everything downstream trusts. Re-validating in the middle wastes CPU and creates contradictory error messages. The boundary is whichever process owns the trust transition: HTTP ingress, queue consumer, AI tool input.

### 4. Mutations are idempotent

Any state-changing operation reachable from the client carries an idempotency key (header, request ID, or natural dedup key like `order_id`). The reason is networks — clients retry on timeout, queues redeliver, users double-tap. Without idempotency, "POST /charge" runs twice and bills the customer twice. This is the single most common production incident in mobile-first stacks.

### 5. State ownership is explicit

For every piece of state, name the owner: which service writes it, which reads it, which caches it, and how long the cache is valid. Hidden global mutable state across requests, multi-writer caches, and "the client and server both keep a copy and hope they agree" are all bug factories. Race conditions are mostly state-ownership ambiguity in disguise.

### 6. Performance budgets are explicit and enforced

| Tier             | p50          | p95          |
| ---------------- | ------------ | ------------ |
| HTTP (NestJS)    | < 100 ms     | < 400 ms     |
| RN screen TTI    | < 1 s        | < 2.5 s      |
| AI fast tier     | < 800 ms     | < 2 s        |
| AI balanced      | < 2 s        | < 6 s        |
| AI deep          | < 6 s        | < 20 s       |
| Cold start (RN)  | < 2 s        | < 5 s        |

End-to-end p95 for a single user-visible operation is the sum across services, not per-service. Exceeding budget is a merge blocker until the team consciously decides to spend the budget.

### 7. Observability is non-optional

Every request that crosses a service boundary carries a trace ID end-to-end (client → backend → AI). Logs are structured JSON. Errors are typed `{code, message, details}`, not bare strings. Time-to-first-clue is the metric that matters in incidents.

## Cross-cutting checks the audit must always run

Walk through every item. Cite evidence (file:line) or flag explicitly that evidence is missing.

### Race conditions — the taxonomy to look for

1. **Lost update.** Two requests load a row, both compute a new value, both write back — second overwrites first. Detect: any "SELECT then UPDATE" pair without a transaction. Fix: transaction with appropriate isolation, single-statement atomic update (`UPDATE ... SET col = col + 1`), or optimistic concurrency with a `version` column.
2. **Phantom / non-repeatable read.** Decision branches on two reads of the same row; the second sees a value changed by another transaction. Fix: snapshot into a local, or escalate isolation.
3. **Double-submit.** User taps "Pay" twice; client retries on timeout. Fix: idempotency key, server-side dedup.
4. **Stale optimistic UI.** Client mutates locally, request fails, no recovery path. Fix: reconcile on response; invalidate the affected query on failure.
5. **Out-of-order responses.** Search-as-you-type or any latest-wins flow where network reorders responses. Fix: request sequence number; ignore responses superseded by newer ones.
6. **Write-write across services.** Backend writes to DB, then publishes to queue; process dies between. Fix: transactional outbox.
7. **Cache stampede.** Hot key expires under load; thousands of misses hit the DB. Fix: request-coalescing or staggered TTLs.

### Retry / replay safety

Walk through "what happens if this runs twice? three times? after a 30-second delay?" for every mutation in scope. If the answer is "duplicate row" or "double charge," it is a blocker.

### Partial failure

For any operation touching two services or two stores: what happens if the first succeeds and the second fails? Compensating action, outbox, or saga must be explicit.

### Backpressure

Any queue, worker, or stream — name the bound. Concurrency limit, max-in-flight, queue max-length, DLQ destination. Unbounded is wrong by default.

### Auth / authz across hops

Every cross-service hop re-asserts authorization. The AI engine does not trust "the backend said it was OK" without a signed token or an internal-only network. Service-to-service tokens are short-lived and scoped. No user PII in URLs or query strings (they end up in logs and traces).

### Contracts and versioning

Cross-service payloads are typed at both ends. Breaking changes get a new version or schema bump — never a silent reshape. Tolerant reader, strict writer (each side ignores unknown fields on input, never emits unknown fields on output). Mobile clients in the field can be days or weeks behind the backend — the contract must keep them working until they update.

### Production readiness — the rollout checklist

For any change crossing services, answer in writing before merging:

1. **Backward compatibility.** Does an older RN client work against the new backend? Does an older backend work against the new AI engine? Deploy order and rollback plan.
2. **Migration safety.** DB migrations are reversible. Tested on representative data volume. Old code path can read the new schema during the rollout window.
3. **Feature flag.** New path behind a flag with a kill switch — turn off without a deploy.
4. **Observability.** Traces, logs, metrics in place *before* the feature is enabled.
5. **Alerting.** Error rate, latency, saturation alerts wired up.
6. **Runbook.** First three things the on-call engineer should check at 3 a.m. No runbook = not production-ready.

### PII and token cost (AI engine)

Full prompts and responses are never logged at INFO in production. User content does not appear in error messages. Structured output (tool use) is preferred over freeform string parsing. Prompt cache structure preserved (stable parts first, volatile context last).

## Anti-patterns this skill must flag on sight

These are the recurring shapes that cause production incidents in this stack. Seeing one is a blocker until proven safe.

- **Client computing money / authorization decisions.** RN code computing prices, discounts, or eligibility is wrong by construction. Move to backend.
- **Backend calling LLMs directly.** NestJS code importing `openai` / `anthropic` / model SDKs — that work belongs in `ai-engine` behind a typed contract.
- **AI engine writing user data to its own database.** State lives in the backend. The AI engine is stateless or has only ephemeral caches.
- **Optimistic UI without reconciliation.** Mutation sent, no failure path. Either accept the update is provisional and reconcile, or block the UI on confirmation.
- **`useEffect` data fetching with no cancellation.** Component unmounts during fetch, `setState` fires on dead component, stale state corrupts the next mount.
- **`async def` handlers doing CPU-bound work.** Blocks the Python event loop; throughput caps to one request at a time. Push to a thread pool or worker.
- **Implicit `any` at a service boundary.** TS code typing a payload as `any` / `unknown` and accessing fields. Contract drift waiting to happen.
- **Multi-writer caches with no invalidation strategy.** Pick one writer; document the TTL strategy.
- **Read-modify-write without transaction or version check.** Two requests race; one update is lost.
- **Queues without DLQ + max-attempt.** Poisoned message retries forever; consumer blocked indefinitely.
- **Logging full prompts / responses in prod.** PII risk and token-cost risk. Log a hash or truncate with a sample rate.
- **Cross-service joins.** Backend reaching into another service's database. Each service owns its data; cross-service reads go through an API.
- **Long-running transactions.** A transaction that contains an external HTTP call holds row locks across the network round-trip. Pull the side-effect out, or use an outbox.
- **No explicit timeouts on external calls.** "Wait forever" is the default and it is wrong.
- **TypeORM `synchronize: true` outside dev.** Silently drops columns.
- **`process.env.JWT_SECRET ?? 'devsecret'`.** Production breach in waiting.

## UI/UX modularity (frontend-ui specifically)

When the audit touches frontend-ui, also enforce these — they are the original `system-design` rules and they still hold.

### Component layers (strict)

```
tokens → primitives → composites → patterns → screens
```

A layer imports only from layers below it. Lateral imports inside a layer are fine. The reason is reuse — if a primitive imports from a screen, the primitive can never be lifted into a shared package, and you've created a hidden cycle.

### Reuse threshold

- 1 use → inline.
- 2 uses → leave duplicated.
- 3 uses → extract.

Premature extraction is worse than duplication. The cost of the wrong abstraction is paid every time someone reads the code; the cost of duplication is paid once when the third use appears.

### Prop API discipline

- Required props are semantically core; optional props are visual variants.
- Replace boolean explosion (`isPrimary | isSecondary | isDanger`) with a single `variant`.
- Forward unknown props (`...rest`) only on primitives.
- Children > slots > render-props.

### Styling

- Tokens only. No raw hex, no magic px outside the token file.
- Spacing via the scale (`space.1`, `space.2`, …). Arbitrary `padding: 13` is a smell.
- Mobile-first responsive. No fixed widths above breakpoint.

### Accessibility

- Every interactive primitive: keyboard reachable, focus-visible, ARIA / `accessibilityRole` correct.
- Color contrast ≥ WCAG AA. Don't rely on color alone for meaning.
- Every input has an associated label; errors associated via `aria-describedby` / `accessibilityHint`.

## Report Template

Output the audit in exactly this shape. Keep it scannable. Cite file:line for every claim.

```
# System Design Audit — <feature / entry point>

## Map
- Entry: <file:line>
- Peers traced: <list of files in other services, file:line each>
- Direction: <client → backend → AI, or whatever applies>
- Contracts crossed: <schema names + file:line>

## Blockers (must fix before merge)
- [BLOCKER] <one-line problem>
  Where: <file:line>
  Why it blocks: <root cause + which principle it violates>
  Fix: <concrete change, named file/function>

## Risks (fix before production rollout)
- [RISK] <one-line problem> — Where, Why, Fix

## Advisory (worth a follow-up, not blocking)
- [ADVISORY] <one-line> — Where, Why, Fix

## Verified clean
- <list of checks that passed, one line each — this matters; it proves coverage>

## Evidence gaps
- <anything the audit could not verify because peer code was not provided — name the file or grep that would resolve it>
```

If the audit found no blockers and no risks, say so plainly and list what was verified. Silence is not a passing grade.

## Final checklist (run before claiming the audit is done)

- [ ] Step 1 map is in the report — entry, peers, contracts named with file:line
- [ ] Each finding cites file:line and names the violated principle
- [ ] Race-condition check ran (yes/no answered with evidence)
- [ ] Idempotency check ran for every mutation in scope
- [ ] Retry-safety, partial-failure, backpressure checks answered
- [ ] Performance budget compared against the relevant tier
- [ ] Observability check ran (trace ID, structured log, typed error)
- [ ] PII / token-cost check ran if AI engine is in scope
- [ ] Production-readiness rollout checklist answered (or N/A noted)
- [ ] Blockers, risks, advisory, verified-clean, evidence-gap sections all populated (use "none" explicitly when empty)
