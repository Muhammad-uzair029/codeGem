---
title: Cost control and token budgeting
summary: Understand where LLM spend comes from, measure it per feature and per user, and put hard budgets in place before the bill surprises you.
minutes: 10
practice: [prod-cost-1, prod-cost-2, prod-cost-3]
flow:
  title: Enforcing a per-user token budget
  steps:
    - label: Estimate
      detail: Estimate input tokens (count or approximate) and add max_tokens as the worst-case output.
    - label: Check budget
      detail: Read the user's usage counter for the current day or month from Redis.
    - label: Decide
      detail: Under budget, proceed. Near the limit, switch to a cheaper model or shorter output. Over, refuse politely.
    - label: Call the model
      detail: Send the request with an explicit max_tokens cap.
    - label: Record actual usage
      detail: Read the usage field from the response and add real input and output tokens to the counter.
    - label: Report and alert
      detail: Emit usage metrics tagged by feature, model, and tenant; alert on unusual spikes.
selfCheck:
  - q: Which change usually cuts the cost of a RAG chatbot the most without touching the model?
    options:
      - Shorter variable names in the code
      - Sending fewer, more relevant retrieved chunks and trimming old chat history
      - Using HTTP/2 to call the provider
    answer: 1
    why: Input tokens dominate many RAG workloads. Every extra chunk and old turn is paid for on every request.
  - q: Why record usage from the provider's response instead of only your own pre-call estimate?
    options:
      - The response reports the actual tokens billed, including output you could not know in advance
      - Estimates are illegal under provider terms
      - Providers do not let you set max_tokens
    answer: 0
    why: Output length is only known after generation. The usage field on the response is the source of truth for billing.
---

## Core concepts

LLM cost is mostly simple arithmetic:

**cost ≈ input tokens × input price + output tokens × output price**

Output tokens are usually priced higher than input tokens. Prices differ a lot between models (often by an order of magnitude between small and large ones) and change often, so keep them in config and never hard-code them.

Where the tokens actually come from surprises people:

- The **system prompt** is resent on every call.
- **Chat history** grows with every turn, so turn 20 costs much more than turn 1.
- **RAG context**: ten retrieved chunks can be most of the prompt.
- **Agents** loop: one user request may mean 15 model calls, each with the growing transcript.
- **Retries and fallbacks** silently double spend during incidents.

Think of it like a taxi meter that also charges for every passenger who has ever been in the car. Long conversations and fat contexts keep the meter running.

The levers, roughly from easiest to hardest:

1. **Measure first.** Log tokens per request, tagged by feature, model, and tenant.
2. **Cap output** with `max_tokens` on every call.
3. **Trim input**: fewer and better chunks, summarise old turns, shorter system prompts.
4. **Route** easy tasks to smaller models.
5. **Cache**: answer caches and provider prompt caching for repeated prefixes.
6. **Batch** non-urgent work. Several providers offer discounted asynchronous batch APIs.
7. **Budgets**: per-user and per-tenant limits enforced in code, plus account-level spend alerts.

## How it works in real systems

Providers report usage on each response. With the Anthropic SDK it is `usage.input_tokens` and `usage.output_tokens`; OpenAI's Chat Completions returns `usage.prompt_tokens` and `usage.completion_tokens`. Record these, not guesses.

A per-user daily budget in Redis. `INCRBY` is atomic, so concurrent requests don't lose updates.

```ts
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL!);

const DAILY_TOKENS: Record<Plan, number> = { free: 50_000, pro: 1_000_000 }; // product decision

function key(userId: string) {
  return `budget:${userId}:${new Date().toISOString().slice(0, 10)}`; // per UTC day
}

export async function assertBudget(userId: string, plan: Plan, estimate: number) {
  const used = Number(await redis.get(key(userId))) || 0;
  if (used + estimate > DAILY_TOKENS[plan]) throw new BudgetExceededError(used);
  return { nearLimit: used + estimate > DAILY_TOKENS[plan] * 0.8 }; // maybe downgrade model
}

export async function recordUsage(userId: string, input: number, output: number) {
  const k = key(userId);
  await redis.multi().incrby(k, input + output).expire(k, 60 * 60 * 48).exec();
}
```

Wire it around the call. The estimate uses `max_tokens` as worst-case output; counting input exactly is possible with provider token-counting endpoints or a tokenizer library, but a character-based approximation is often enough for a budget check.

```ts
const estimate = Math.ceil(promptChars / 4) + MAX_TOKENS; // rough English approximation
const { nearLimit } = await assertBudget(user.id, user.plan, estimate);
const res = await client.messages.create({
  model: nearLimit ? config.models.small : config.models.main,
  max_tokens: MAX_TOKENS,
  messages,
});
await recordUsage(user.id, res.usage.input_tokens, res.usage.output_tokens);
metrics.increment('llm.tokens', res.usage.input_tokens + res.usage.output_tokens,
  { feature: 'chat', model: res.model, tenant: user.tenantId });
```

> [!tip] Cost per successful outcome
> "Tokens per request" can look fine while "cost per resolved ticket" is terrible because users retry five times. Track cost against the outcome the feature exists for.

Agents need their own guard: a maximum number of steps and a maximum total token spend per run, after which the agent stops and reports what it has.

## Common mistakes

- No `max_tokens` → a runaway answer or loop costs far more than planned; always cap output.
- Sending the full chat history forever → keep recent turns, summarise older ones, retrieve the rest when needed.
- Stuffing top-20 chunks "to be safe" → measure answer quality at lower top-k; it often holds.
- One big model for every task → route classification and extraction to smaller models.
- Only looking at the monthly invoice → per-request usage metrics tagged by feature and tenant, with alerts.
- Agent loops without step or spend limits → cap both per run.
- Hard-coding prices → keep a price table in config and update it when providers change.

## Interview angle

Usually asked as: "Our LLM bill tripled this month. How do you find out why and fix it?" or "How would you stop a single customer from running up costs?"

A strong answer covers:

- Measurement first: token usage per request tagged by feature, model, tenant, and route.
- The cost formula and why input context (history, RAG, system prompt) often dominates.
- Levers: output caps, context trimming, model routing, caching, batch APIs.
- Enforced budgets per user or tenant with atomic counters, with a downgrade path before a hard stop.
- Agent-specific limits on steps and total spend.

Follow-up interviewers like: "How do you reduce cost without hurting quality?" (Change one lever at a time and run the eval suite each time, comparing quality and cost per successful outcome.)
