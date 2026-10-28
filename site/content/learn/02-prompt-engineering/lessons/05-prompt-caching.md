---
title: Prompt caching and cutting token cost
summary: Reuse the processed prefix of your prompts to cut cost and latency, plus other ways to spend fewer tokens.
minutes: 8
practice: [prompt-cache-1, prompt-cache-2, prompt-cache-3]
flow:
  title: A request with prompt caching
  steps:
    - label: Build the prompt
      detail: Stable content first (tools, system prompt, reference docs), changing content last (the user's question).
    - label: Check the cache
      detail: The provider looks for a recently cached prefix that matches yours exactly.
    - label: Cache hit
      detail: The matching prefix is reused. Those tokens are billed at a reduced rate and processed faster.
    - label: Cache miss
      detail: The full prompt is processed and the prefix is stored for a short time (minutes, by default).
    - label: Generate
      detail: The model processes the uncached part and generates the answer as usual.
    - label: Read usage
      detail: The response reports cached vs uncached input tokens. Track your hit rate.
selfCheck:
  - q: What does a prompt cache reuse?
    options:
      - The model's previous answers
      - The processed form of an identical prompt prefix
      - Any prompt that is semantically similar
    answer: 1
    why: Prompt caching matches an exact prefix. One changed character before the cached point means a miss from there on.
  - q: Where should a timestamp like "Current time 10:42:07" go?
    options:
      - At the very top of the system prompt
      - After the stable content, near the end of the prompt
    answer: 1
    why: A value that changes every request at the top breaks the prefix match for everything after it.
  - q: Does prompt caching change the model's answer?
    options:
      - Yes, cached answers are reused
      - No, it only saves recomputing the prompt; output is generated fresh
    answer: 1
    why: Only input processing is reused. Generation still happens on every request.
---

## Core concepts

Many apps send the same big chunk of text on every request: a long system prompt, tool definitions, a product manual, few-shot examples. Only the last part, the user's question, changes. Processing that same prefix again and again is wasted work.

**Prompt caching** lets the provider keep the processed prefix around for a short while. The next request that starts with the *exact same* prefix skips that work. You pay less for those tokens and get the first token back faster.

Analogy: a chef preps the sauce base once in the morning and finishes each order to taste. The base is the cached prefix; the order is the user's question.

The key rules:

- **Exact prefix match.** Caching works from the start of the prompt up to a cache point. Change one character early on and everything after it misses.
- **Stable first, dynamic last.** Order your prompt: tools → system prompt → reference docs → examples → conversation → the new question.
- **Short lifetime.** Cache entries expire after a few minutes of no use (the default is short; some providers offer longer options at a different price). Caching pays off when the same prefix is reused frequently.
- **Minimum size.** Very short prefixes aren't cached; providers set a minimum length that varies by model.
- **It's an input saving.** Output is generated fresh every time.

How providers expose it differs. OpenAI applies caching automatically to long enough prompts. Anthropic uses explicit `cache_control` markers on content blocks, and writing to the cache can cost slightly more than a normal input token, while reading costs much less. Google's Gemini API offers both implicit and explicit context caching. Check current docs for exact rules and pricing.

## How it works in real systems

```python
import os
from anthropic import Anthropic

client = Anthropic()
MANUAL = open("product_manual.md").read()   # large, identical on every request

def ask(question: str):
    resp = client.messages.create(
        model=os.environ["LLM_MODEL"],
        max_tokens=800,
        system=[
            {"type": "text", "text": "You answer questions using the product manual."},
            {"type": "text", "text": MANUAL,
             "cache_control": {"type": "ephemeral"}},   # cache everything up to here
        ],
        messages=[{"role": "user", "content": question}],  # changes every call
    )
    u = resp.usage
    print("cache write:", u.cache_creation_input_tokens,
          "cache read:", u.cache_read_input_tokens, "uncached:", u.input_tokens)
    return resp.content[0].text
```

With OpenAI there's no marker to add; read `usage.prompt_tokens_details.cached_tokens` to see how much was served from cache.

Other ways to cut tokens, often worth more than caching:

- **Send less.** Retrieve relevant chunks instead of whole documents; trim or summarize chat history.
- **Shorter outputs.** Output tokens usually cost more; ask for concise answers and set a sensible `max_tokens`.
- **Smaller model** for easy tasks (see the model choice lesson).
- **Batch APIs.** Several providers offer discounted asynchronous batch processing for work that doesn't need an instant answer.
- **Cache answers yourself** for identical repeated questions, in your own key-value store, where correctness allows.

## Common mistakes

- Putting dynamic values (dates, user names, request IDs) at the top of the system prompt → move them after the stable content.
- Reordering or re-serialising tools and examples between requests → keep their order and formatting byte-for-byte stable.
- Assuming caching is working → log cached-token counts and track hit rate.
- Expecting savings on rare requests → a cache that expires before reuse costs (writes) more than it saves.
- Confusing prompt caching with response caching → prompt caching reuses input processing; caching whole answers is a separate layer you build.

## Interview angle

Typical question: "Our LLM feature sends a 20-page document with every request. How would you reduce cost and latency?"

A strong answer considers sending less first (retrieval, trimming), then prompt caching with the stable content first and the question last, notes exact-prefix matching and short TTLs, explains how to verify with usage fields, and adds output-length control, model right-sizing and batch APIs where latency allows.

Follow-up interviewers like: *"Your cache hit rate is near zero. What's wrong?"* Something early in the prompt changes per request (timestamp, user ID, unstable tool ordering or JSON key order), the prefix is below the minimum size, or requests are too infrequent for the cache to survive between them.
