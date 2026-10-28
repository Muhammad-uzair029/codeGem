---
title: "Trade-offs: latency, cost, accuracy and scale"
summary: How to reason about the four forces that pull every AI design in different directions, and the usual levers for each.
minutes: 11
practice: [sd-trade-1, sd-trade-2, sd-trade-3]
flow:
  title: A cost and latency tuning loop
  steps:
    - label: Measure
      detail: Record quality on your eval set, p50 and p95 latency, and cost per request from real token counts. You can't trade what you haven't measured.
    - label: Trim the prompt
      detail: Remove unused instructions, examples and retrieved chunks. Fewer input tokens means lower cost and often faster responses.
    - label: Cache
      detail: Reuse answers for repeated questions and use provider prompt caching for long, stable prompt prefixes.
    - label: Route
      detail: Send easy requests to a smaller, cheaper model and only hard ones to the strongest model.
    - label: Move work offline
      detail: Anything that doesn't need an instant answer goes to a queue or a batch job, which is cheaper and smooths load.
    - label: Specialise
      detail: If a narrow task is high-volume, consider fine-tuning or distilling a small model for it.
    - label: Re-check evals
      detail: Every change must keep quality above the bar. If it doesn't, roll it back.
  loop:
    from: 7
    to: 1
    label: Repeat as usage grows
selfCheck:
  - q: Users complain a chat feature "feels slow" though total response time is unchanged. What helps most?
    options:
      - A bigger model
      - Streaming tokens so the first words appear quickly
      - Longer answers
    answer: 1
    why: Perceived latency depends heavily on time to first token. Streaming makes the wait feel much shorter even when total time is similar.
  - q: What is model routing?
    options:
      - Load-balancing requests across servers
      - Sending each request to the cheapest model that can handle it well, escalating hard ones
      - Choosing a provider by region
    answer: 1
    why: Routing lets most traffic use a cheaper, faster model while keeping quality on hard cases, if a reliable classifier or check decides.
  - q: Which work is a good fit for a batch or queue instead of a live call?
    options:
      - Inline autocomplete
      - Tagging yesterday's support tickets for a report
      - A user waiting for a chat reply
    answer: 1
    why: Nobody is waiting on it in real time, so it can run cheaper and in bulk without affecting user-facing latency.
---

## Core concepts

Every AI design balances four forces:

- **Latency**: how long the user waits. Split into *time to first token* (when something appears) and *total time*.
- **Cost**: mostly tokens in and out, times volume, plus retrieval, infrastructure and human review.
- **Accuracy (quality)**: how often the output is correct, grounded and safe, measured on your eval set.
- **Scale**: requests per second, peaks, provider rate limits, and data volume.

They pull against each other. A bigger model is usually more accurate but slower and pricier. More retrieved context can raise accuracy but adds tokens and latency. Multi-step agents can solve harder tasks but multiply cost and failure points.

Think of it like choosing a delivery service. Same-day courier, standard post or freight: each is right for some parcels. The skill is matching the option to the parcel, not always picking the fastest or the cheapest.

**The interview rule**: never say "it depends" and stop. Say what it depends on, pick an option for the stated requirements, and explain what would change your mind.

## How it works in real systems

**Levers for latency**

- Stream responses so users see progress.
- Use smaller models for steps on the critical path (classification, query rewrite).
- Run independent steps in parallel (retrieval from two sources at once).
- Cut output length: output tokens are generated one by one, so long answers are slow answers.
- Cache frequent results; keep retrieval indexes warm and close to the app.

**Levers for cost**

- Shorter prompts and fewer retrieved chunks.
- Prompt caching for long, repeated prefixes (system prompts, shared documents); major providers offer it, check yours for the details.
- Model routing and cascades: try cheap first, escalate when a check fails.
- Batch APIs or off-peak queues for non-urgent work; several providers discount batch jobs.
- Fine-tune or distil a small model for one high-volume, narrow task, once you have enough good examples.

**Levers for accuracy**

- Better retrieval (hybrid search, reranking, cleaner chunks) usually beats a bigger model.
- Clear instructions, examples, structured outputs.
- Verification steps: citation checks, schema validation, a second model as judge for risky outputs.
- Human review for high-stakes cases.

**Levers for scale**

- Queues and backpressure so spikes don't hit provider rate limits all at once.
- Retries with exponential backoff and jitter; timeouts on every call.
- Multiple providers or regions as fallback, behind a thin internal interface.
- Per-tenant quotas so one heavy customer can't starve everyone else.

A cascade in code: cheap model first, strong model only when a check fails.

```python
def answer_with_cascade(question: str, context: list[str]) -> str:
    draft = small_model.generate(build_prompt(question, context), max_tokens=400)
    if passes_checks(draft, context):        # schema valid, cites sources, judge score ok
        metrics.increment("cascade.small_ok")
        return draft.text

    metrics.increment("cascade.escalated")
    strong = large_model.generate(build_prompt(question, context), max_tokens=600)
    return strong.text if passes_checks(strong, context) else SAFE_FALLBACK
```

The cascade only saves money if most requests stop at the small model and the check is cheap and reliable. Measure the escalation rate; if it's high, you're paying for both calls.

**A quick trade-off table for interviews**

| If the requirement says... | Lean towards |
| --- | --- |
| Real-time, user is typing | Small model, short output, streaming, aggressive caching |
| High stakes (money, health, hiring) | Strong model, verification, human review, accept higher cost and latency |
| Huge volume, simple task | Small or fine-tuned model, batching, routing |
| Fast-changing knowledge | Retrieval over fine-tuning |
| Strict data residency or privacy | Self-hosted or region-pinned models, minimal logging |

> [!tip] Put numbers on the table, labelled as assumptions
> "Assume 1 million requests a day and around 2,000 input tokens each" lets you reason about cost out loud. Interviewers care that you can do the multiplication and spot the dominant term, not that you know today's price list.

## Common mistakes

- **Optimising before measuring** → baseline quality, latency and cost first, then change one thing at a time.
- **Upgrading the model to fix a retrieval problem** → check whether the right context is even in the prompt.
- **Ignoring p95 latency** → averages hide the slow tail that users actually remember.
- **Cost-cutting without evals** → every optimisation must pass the same quality gate.
- **Cascades with a weak check** → if the check can't tell good from bad, you either ship bad answers or escalate everything.
- **Single provider, no fallback** → put calls behind an interface, and have a degraded mode.

## Interview angle

Trade-offs come up inside every design question, often as a twist: "Now it needs to be ten times cheaper," "Latency must be under a second," or "Traffic grows 100x."

A strong answer names which constraint dominates, lists the levers in order of effort (prompt trimming and caching before fine-tuning), says how quality is protected (eval gate), and estimates impact roughly.

Follow-up interviewers like: **"Would you fine-tune or use RAG for this?"** RAG when knowledge changes or must be cited; fine-tuning when you need a consistent style, format or narrow skill at high volume, or a smaller model to match a larger one on one task. Often both: retrieval for facts, a tuned model for behaviour.
