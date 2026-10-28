---
title: Context windows, token limits and cost
summary: What fits in a request, what happens when it doesn't, and how to estimate what each call costs.
minutes: 8
practice: [llm-context-1, llm-context-2, llm-context-3]
selfCheck:
  - q: In most APIs, what counts toward the context window?
    options:
      - Only the user's latest message
      - The system prompt, all messages, tool definitions and the generated output
      - Only the generated output
    answer: 1
    why: Everything the model reads plus everything it writes has to fit in the same window.
  - q: A chat app resends full history each turn. What happens to cost per turn as the chat grows?
    options:
      - It stays flat
      - It grows, because every turn pays for all earlier turns again
      - It shrinks, because the model gets faster
    answer: 1
    why: Each request includes the whole history as input tokens, so turn 20 costs far more than turn 1.
  - q: Which is usually priced higher per token?
    options:
      - Input tokens
      - Output tokens
      - They are always identical
    answer: 1
    why: Output tokens are produced one at a time and are typically priced several times higher than input tokens.
---

## Core concepts

The **context window** is the model's working memory for a single request, measured in tokens. Think of a desk: everything the model can use has to be on the desk at once. The system prompt, the conversation history, retrieved documents, tool definitions, *and the answer it is writing* all share that space.

Two limits matter:

- **Context window**: the total tokens (input plus output) the model can handle in one request.
- **Max output tokens**: a separate cap on how long the answer can be. It is usually much smaller than the context window. You also set your own `max_tokens` per request.

If the input is too large, the API rejects the request. If the answer hits `max_tokens`, it is cut off mid-sentence, and the response tells you why it stopped.

**Cost** is almost always per token, priced separately for input and output:

```
cost = input_tokens × input_price + output_tokens × output_price
```

Output tokens usually cost several times more than input tokens. Prices are quoted per million tokens and change often, so keep them in config, not in code.

> [!warning] Big windows aren't free
> A model may accept a very long context, but filling it costs money on every call, increases latency, and quality can drop. Models tend to use information at the start and end of a long context better than information buried in the middle.

## How it works in real systems

Every response includes a `usage` object with the real token counts. Log it on every call. That is how you find the endpoint that quietly costs ten times more than the rest.

```python
from dataclasses import dataclass

@dataclass
class Price:
    input_per_mtok: float   # loaded from config, not hard-coded
    output_per_mtok: float

def request_cost(usage, price: Price) -> float:
    return (usage.input_tokens * price.input_per_mtok
            + usage.output_tokens * price.output_per_mtok) / 1_000_000

# Anthropic SDK: response.usage.input_tokens / output_tokens
# OpenAI SDK:    response.usage.prompt_tokens / completion_tokens
cost = request_cost(response.usage, PRICES[model_name])
log.info("llm_call", model=model_name, cost_usd=round(cost, 6))
```

Handling long conversations in production:

1. **Budget the window.** Reserve room for the answer first (your `max_tokens`), then the system prompt, then fill what's left with history or documents.
2. **Trim or summarize old turns.** Keep the last N turns verbatim and replace older ones with a running summary.
3. **Retrieve, don't dump.** Instead of pasting a whole manual, fetch the few most relevant chunks (that is RAG, covered later).
4. **Check the stop reason.** Anthropic returns `stop_reason: "max_tokens"`, OpenAI returns `finish_reason: "length"`. Treat it as truncated output, not a finished answer.

## Common mistakes

- Sending the full chat history forever → cap it, summarize older turns, or retrieve only what's relevant.
- Forgetting that output shares the window → leave room for the answer, or a near-full prompt leaves no space to reply.
- Parsing a truncated JSON answer and crashing → check the stop reason before parsing.
- Hard-coding prices in code → keep them in config and track real `usage` per feature.
- Assuming "it fits" means "it works well" → long, noisy context can lower answer quality; put key instructions and facts where the model will notice them.

## Interview angle

Typical questions: "How would you estimate the monthly cost of this LLM feature?" or "Users say the bot forgets things in long chats. Why?"

A strong cost answer: average input and output tokens per request × requests per month × per-token prices, with output priced higher, plus headroom for retries. Mention measuring real `usage` instead of guessing.

A strong "forgetting" answer: finite window, history truncated or summarized, information in the middle used less reliably; fix with summarization, retrieval of past turns, and storing key facts explicitly.

Follow-up interviewers like: *"Your cost doubled overnight with no traffic change. Where do you look?"* Check per-request `usage`: a prompt change, growing history, a retry loop, or longer outputs.
