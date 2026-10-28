---
title: "Caching LLM calls with Redis: exact vs semantic"
summary: Save money and latency by reusing answers, and learn when a "similar question" cache helps and when it returns the wrong answer.
minutes: 10
practice: [prod-cache-1, prod-cache-2, prod-cache-3]
flow:
  title: Two-layer cache lookup
  steps:
    - label: Build the key
      detail: Normalise the request (model, system prompt version, messages, parameters) and hash it.
    - label: Exact lookup
      detail: GET the hash in Redis. A hit returns instantly with zero tokens spent.
    - label: Embed the question
      detail: On a miss, embed the user's question (only for request types you allowed for semantic caching).
    - label: Nearest neighbour search
      detail: Search previous questions in the same tenant scope for the closest vector.
    - label: Threshold check
      detail: If similarity is above a tuned threshold, return the cached answer. Otherwise treat it as a miss.
    - label: Call the model
      detail: Generate a fresh answer.
    - label: Store with TTL
      detail: Save the answer under the exact key and the question vector, both with an expiry.
selfCheck:
  - q: A semantic cache returns the answer to "How do I cancel my subscription?" for the query "How do I NOT cancel, just pause, my subscription?". What went wrong?
    options:
      - The exact cache key was too long
      - Embedding similarity was high even though the meaning differed, so the threshold or scope was too loose
      - Redis evicted the right entry
    answer: 1
    why: Embeddings capture topic well but can miss negation and small details. That is the core risk of semantic caching.
  - q: How is provider-side prompt caching different from caching answers in Redis?
    options:
      - It is the same thing, just hosted by the provider
      - It reuses the processing of a repeated prompt prefix to cut input cost and latency, but the model still generates a new answer
      - It stores the final answer and returns it without calling the model
    answer: 1
    why: Prompt caching speeds up and discounts the repeated input prefix. An answer cache skips the model call entirely.
---

## Core concepts

LLM calls are slow and cost money per token. Many apps receive the same or nearly the same request again and again: the FAQ bot gets "what are your opening hours?" a hundred times a day. A cache lets you answer from memory.

There are two kinds:

**Exact cache.** The key is a hash of the full request. Identical request, identical key, cached answer. It is simple and safe: it only hits when nothing changed. Its weakness is a low hit rate for free text, because "opening hours?" and "what time do you open" are different strings.

**Semantic cache.** You turn the question into an **embedding** (a vector of numbers that captures meaning) and look for a previous question whose vector is close enough. "What time do you open" can now hit the cached answer to "opening hours?". The hit rate goes up, and so does the risk of a wrong hit.

An analogy: an exact cache is a librarian who only helps if you quote the book title perfectly. A semantic cache is a librarian who guesses what you mean. Faster for everyone, but occasionally hands you the wrong book with full confidence.

There is also a third thing people mix up with these: **provider prompt caching**. Several LLM providers can cache the processing of a long, repeated prompt prefix (a big system prompt, a document) so later calls with the same prefix are cheaper and faster. The model still writes a fresh answer. It complements an answer cache; it does not replace one.

## How it works in real systems

An exact cache with ioredis. The key includes everything that changes the answer, including a version for the system prompt, so a prompt change invalidates old entries.

```ts
import { createHash } from 'node:crypto';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

function cacheKey(req: { model: string; promptVersion: string; messages: unknown; temperature: number }) {
  const body = JSON.stringify(req); // build req with a stable field order
  return 'llm:exact:' + createHash('sha256').update(body).digest('hex');
}

export async function cachedCompletion(req: Parameters<typeof cacheKey>[0], call: () => Promise<string>) {
  const key = cacheKey(req);
  const hit = await redis.get(key);
  if (hit) return { text: hit, cached: true };
  const text = await call();
  await redis.set(key, text, 'EX', 60 * 60 * 24); // 24h TTL
  return { text, cached: false };
}
```

A semantic cache needs a vector index. Redis can do this with its vector search features (Redis Stack / Redis Query Engine), or you can use the vector database you already have. The logic is the same either way. Below, `vector_store` is your own thin wrapper around whichever store you use.

```python
SIMILARITY_THRESHOLD = 0.92  # tune on real traffic, don't copy this number

def semantic_lookup(question: str, tenant_id: str, embed, vector_store):
    vec = embed(question)
    match = vector_store.nearest(vec, filter={"tenant_id": tenant_id}, k=1)
    if match and match.score >= SIMILARITY_THRESHOLD:
        return match.payload["answer"]
    return None

def semantic_store(question: str, answer: str, tenant_id: str, embed, vector_store):
    vector_store.upsert(
        vector=embed(question),
        payload={"answer": answer, "tenant_id": tenant_id},
        ttl_seconds=6 * 60 * 60,
    )
```

When semantic caching is a good fit:

- Public, non-personal answers: FAQs, docs search, product questions.
- Answers that do not depend on time or on who is asking.

When it is risky or wrong:

- Personalised answers ("what's my balance?"). A cross-user hit is a data leak.
- Questions where small words flip the meaning (negation, numbers, dates).
- Multi-turn chats, where the same last message means different things in different conversations.

> [!warning] Scope every cache key
> Include the tenant (and the user, for anything personal) and the permission context in the key or the vector filter. A cache that ignores who is asking will happily serve one customer's data to another.

## Common mistakes

- Leaving the system prompt version or model out of the key → old answers survive prompt changes; include a prompt version and the model id.
- Turning on semantic caching for everything → allow-list the request types where a near-match answer is acceptable.
- Copying a similarity threshold from a blog post → tune it on logged traffic and check false hits by hand.
- No TTL → facts go stale; set expiries and invalidate when source documents change.
- Caching across tenants or users → scope keys and vector filters by tenant and user.
- Counting only hit rate → also measure wrong-hit rate; a fast wrong answer costs more than a slow right one.

## Interview angle

Usually asked as: "How would you reduce LLM cost and latency for a support bot?" or "What is a semantic cache and what can go wrong?"

A strong answer covers:

- Exact cache first (cheap, safe), semantic cache only where near-matches are acceptable.
- What goes in the key: model, prompt version, parameters, tenant and user scope.
- The threshold trade-off: higher means fewer wrong hits and a lower hit rate.
- TTLs and invalidation when the underlying data changes.
- The difference between answer caching and provider prompt caching.

Follow-up interviewers like: "How would you choose the similarity threshold?" (Sample logged query pairs, label whether the cached answer would be acceptable, and pick the threshold that keeps the wrong-hit rate below what the product can tolerate.)
