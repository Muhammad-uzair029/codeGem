---
title: "Sampling: temperature, top-p and max tokens"
summary: The knobs that control how the next token is picked, and sensible settings for different jobs.
minutes: 7
practice: [llm-sampling-1, llm-sampling-2, llm-sampling-3]
flow:
  title: How one token gets picked
  steps:
    - label: Raw scores
      detail: The model outputs a score (logit) for every token in the vocabulary.
    - label: Apply temperature
      detail: Scores are divided by the temperature. Low values sharpen the distribution toward the top choice; high values flatten it.
    - label: Convert to probabilities
      detail: A softmax turns the scores into probabilities that add up to 1.
    - label: Apply top-p
      detail: Keep only the most likely tokens whose probabilities add up to p, and drop the long tail.
    - label: Draw a token
      detail: Pick randomly from what is left, weighted by probability.
selfCheck:
  - q: You need the same classification label for the same input as often as possible. What temperature makes sense?
    options:
      - Low, close to 0
      - High, around 1.5
      - It doesn't matter
    answer: 0
    why: Low temperature concentrates probability on the top token, making output more consistent.
  - q: What does top-p = 0.9 do?
    options:
      - Keeps the top 90% of tokens by count
      - Samples only from the smallest set of tokens whose probabilities add up to 0.9
      - Makes the answer 90% shorter
    answer: 1
    why: Top-p (nucleus sampling) cuts the unlikely tail based on cumulative probability, not a fixed count.
  - q: Does temperature 0 guarantee identical output every time?
    options:
      - Yes, always
      - No, it is close to deterministic but not guaranteed
    answer: 1
    why: Server-side batching and floating-point effects can still cause small differences. Don't build on exact repeatability.
---

## Core concepts

At every step the model gives a probability for each possible next token. **Sampling** is how one is chosen. You control it with a few parameters.

- **Temperature** controls how adventurous the pick is. Picture a ranked list of candidates. At low temperature the favourite almost always wins. At high temperature, outsiders get a real chance. Low means focused and repeatable; high means varied and creative, and eventually incoherent.
- **Top-p** (nucleus sampling) trims the list first. With `top_p = 0.9`, the model keeps only the most likely tokens that together cover 90% of the probability, then samples among them. It stops very unlikely tokens from ever being picked.
- **Max tokens** is a hard cap on the output length. It doesn't make the model concise; it just stops it. Ask for brevity in the prompt and use `max_tokens` as a safety limit.
- **Stop sequences** end generation when a given string appears. They're useful for templated outputs.

Some APIs also expose **top-k** (keep only the k most likely tokens). Supported parameters and their ranges differ by provider, so check the docs for the model you use.

| Job | Temperature guidance |
|---|---|
| Extraction, classification, routing | low (0 to 0.3) |
| Q&A over provided docs, code | low to moderate |
| Brainstorming, marketing copy | moderate to high |

## How it works in real systems

```python
import os
from anthropic import Anthropic

client = Anthropic()

resp = client.messages.create(
    model=os.environ["LLM_MODEL"],
    max_tokens=300,          # required by this API; a cap, not a target
    temperature=0.0,         # extraction: we want consistency
    stop_sequences=["</label>"],
    messages=[{"role": "user", "content": "Classify the sentiment of: 'Arrived late, but works great.' "
               "Answer as <label>positive|negative|mixed</label>"}],
)

if resp.stop_reason == "max_tokens":
    raise RuntimeError("Output truncated; raise max_tokens or ask for less")
print(resp.content[0].text)
```

Practical habits:

- **Tune one knob at a time.** Several providers recommend adjusting temperature *or* top-p, not both. Start with temperature and leave top-p at its default.
- **Reasoning models may differ.** Some models with built-in reasoning ignore or reject temperature and top-p. Check before you pass them.
- **Don't fix bad prompts with temperature.** If answers are wrong at temperature 0, the prompt or the context is the problem.
- **Use variety on purpose.** Generating several samples at higher temperature and picking the best (or majority vote) is a real technique for hard problems.

## Common mistakes

- Setting a high temperature for JSON or code → keep it low; random token picks break syntax.
- Using `max_tokens` to make answers short → ask for length in the prompt; `max_tokens` just truncates.
- Expecting temperature 0 to make tests byte-identical → assert on structure and meaning, not exact strings.
- Copying sampling settings between providers or models → ranges and defaults differ; read the model's docs.

## Interview angle

Typical question: "What's the difference between temperature and top-p, and what would you use for a support bot that extracts order numbers?"

A strong answer explains temperature as reshaping the whole distribution, top-p as cutting the low-probability tail, picks low temperature for extraction, notes that `max_tokens` is a cap, and mentions that temperature 0 is not a determinism guarantee.

Follow-up interviewers like: *"When would you deliberately use high temperature in production?"* Generating diverse candidates (ideas, test cases, multiple drafts) that you then filter, rank or vote on.
