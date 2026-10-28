---
title: Rate limits, fallbacks, and multi-provider routing
summary: Keep the feature working when a provider returns 429s or goes down, and route each request to the model that fits it.
minutes: 11
practice: [prod-route-1, prod-route-2, prod-route-3]
flow:
  title: A request through a resilient LLM router
  steps:
    - label: Per-user limit
      detail: Check the user's own quota first, so one noisy user cannot burn the whole provider limit.
    - label: Pick a route
      detail: Choose a model by task type, required quality, latency target, and cost.
    - label: Call primary
      detail: Send the request with a timeout. Success returns immediately.
    - label: Classify the failure
      detail: 429 or 5xx or timeout is retryable. 400 (bad request) or a content refusal is not.
    - label: Back off and retry
      detail: Wait using the Retry-After header if present, else exponential backoff with jitter.
    - label: Fall back
      detail: After retries, or if the circuit breaker is open, call the next model or provider in the chain.
    - label: Degrade gracefully
      detail: If every option fails, return a clear message or a cached or simpler answer instead of a stack trace.
  loop:
    from: 5
    to: 3
    label: Limited retries
selfCheck:
  - q: Why add random jitter to exponential backoff?
    options:
      - It makes each retry cheaper
      - It stops many clients that failed at the same moment from retrying at the same moment again
      - Providers require it in their terms of service
    answer: 1
    why: Without jitter, all clients retry in lockstep and cause another spike (a "thundering herd").
  - q: Your fallback model is from a different provider. What should you do before relying on it in production?
    options:
      - Nothing, models are interchangeable behind the same prompt
      - Run your eval set against it with your prompts and tool schemas, and adjust prompts if needed
      - Only check that it returns HTTP 200
    answer: 1
    why: Different models follow prompts, formats, and tool calls differently. An untested fallback can fail silently with bad output.
---

## Core concepts

Every LLM provider limits how much you can send. Limits are usually expressed as **requests per minute** and **tokens per minute**, and they depend on your account tier. Go over and you get **HTTP 429 Too Many Requests**. Providers also have outages, slow periods, and occasional 5xx errors.

If your feature calls one model with no plan B, every one of those becomes a user-facing failure. Production systems layer several defences:

- **Your own rate limits** per user or tenant, so one customer's script cannot eat everyone's quota. A *token bucket* is the classic algorithm: each user has a bucket that refills at a steady rate, and each request takes tokens out.
- **Retries with exponential backoff and jitter** for transient errors. Respect the `Retry-After` header when the provider sends one.
- **Fallbacks**: a chain of alternatives (a second region, another model, another provider).
- **Circuit breaker**: after many failures in a row, stop calling the broken provider for a short cool-down instead of making every user wait for a timeout. It is like a fuse in your house that trips so the whole circuit doesn't burn.
- **Graceful degradation**: a cached answer, a simpler non-AI path, or an honest "try again in a minute".

**Routing** is the positive version of fallbacks: deciding up front which model handles which request. A small, fast model can classify intent or extract fields; a larger model handles hard reasoning. Routing can be by task type, user plan, input length, latency target, or cost.

## How it works in real systems

A fallback chain with backoff. Note that official SDKs (for example the OpenAI and Anthropic ones) already retry some errors by default, so set their retry count deliberately to avoid retries stacking on top of yours.

```ts
type Route = { name: string; call: (req: ChatReq, signal: AbortSignal) => Promise<ChatRes> };

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function completeWithFallback(req: ChatReq, routes: Route[]): Promise<ChatRes> {
  for (const route of routes) {
    if (breaker.isOpen(route.name)) continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await route.call(req, AbortSignal.timeout(30_000));
        breaker.recordSuccess(route.name);
        return { ...res, servedBy: route.name };
      } catch (err: any) {
        breaker.recordFailure(route.name);
        if (err.status && !RETRYABLE.has(err.status)) throw err; // bad input: don't retry
        const retryAfter = Number(err.headers?.['retry-after']) * 1000;
        const backoff = Math.min(8000, 500 * 2 ** attempt) * (0.5 + Math.random());
        await sleep(retryAfter || backoff);
      }
    }
  }
  throw new Error('All LLM routes failed'); // caller shows a friendly message
}
```

A simple router picks the chain per task:

```ts
function routesFor(task: 'classify' | 'chat' | 'deep-analysis'): Route[] {
  switch (task) {
    case 'classify': return [smallModelA, smallModelB];        // cheap and fast
    case 'chat': return [mainModelA, mainModelOtherRegion, mainModelB];
    case 'deep-analysis': return [largeModelA, largeModelB];   // quality first
  }
}
```

Build or buy? You can write this layer yourself, use a library that normalises many providers behind one interface (for example the Vercel AI SDK or LiteLLM), or put an **AI gateway** in front of providers (Cloudflare AI Gateway and others offer logging, caching, rate limiting, and fallbacks as a proxy). Whatever you choose, keep model ids and the chain order in config so you can change them without a deploy.

> [!tip] Fallbacks need evals
> A fallback that returns valid HTTP but wrong JSON or ignores your tool schema is worse than an error. Run your eval suite against every model in the chain, and log `servedBy` so you can see quality per route.

## Common mistakes

- Retrying 400 errors or content-policy refusals → only retry timeouts, 429s, and 5xx-style errors.
- Retrying immediately in a tight loop → exponential backoff with jitter, and honour `Retry-After`.
- Your retries plus the SDK's retries plus the gateway's retries → decide which layer retries and turn the others down.
- No per-user limit → one tenant's batch job triggers 429s for everyone; enforce quotas before the provider call.
- Untested fallback models → run evals on every route and adapt prompts per model if needed.
- Hard-coding model names across the codebase → one config-driven router.

## Interview angle

Usually asked as: "Our LLM provider had an outage and the whole product went down. How would you redesign this?" or "How do you handle 429s?"

A strong answer covers:

- Per-user and per-tenant quotas in front of the provider (token bucket in Redis).
- Classify errors: retry transient ones with backoff and jitter, fail fast on bad requests.
- A fallback chain plus a circuit breaker so a dead provider fails fast.
- Routing by task to balance quality, latency, and cost.
- Evals per route, `servedBy` logging, and graceful degradation in the UI.

Follow-up interviewers like: "What about streaming? The primary fails after 200 tokens." (You usually cannot switch providers mid-stream invisibly. Options: retry the whole turn on the fallback and replace the partial text, or show the partial answer with an error and a retry button.)
