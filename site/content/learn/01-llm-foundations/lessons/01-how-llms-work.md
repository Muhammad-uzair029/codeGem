---
title: How LLMs work (without the math)
summary: Tokens, embeddings and attention explained as a pipeline that predicts one token at a time.
minutes: 9
practice: [llm-tokens-1, llm-tokens-2, llm-tokens-3]
flow:
  title: From text to next token
  steps:
    - label: Tokenize
      detail: Your text is split into tokens, sub-word pieces like "un", "believ", "able". In English a token averages roughly 4 characters.
    - label: Embed
      detail: Each token ID is looked up in a table and turned into a vector, a long list of numbers that captures meaning.
    - label: Attention layers
      detail: Dozens of stacked layers let every token "look at" the earlier tokens and mix in the context it needs.
    - label: Score the vocabulary
      detail: The final layer gives a probability for every token in the vocabulary as the next token.
    - label: Sample one token
      detail: One token is picked using the sampling settings (temperature, top-p), then appended to the text.
  loop:
    from: 5
    to: 3
    label: Repeat until a stop token or max tokens
selfCheck:
  - q: What does an LLM produce in a single forward pass?
    options:
      - A whole paragraph
      - A probability for every possible next token
      - A summary of the prompt
    answer: 1
    why: Each pass scores the whole vocabulary for the next token only. Longer answers come from repeating that loop.
  - q: Why can an LLM struggle to count the letters in a word?
    options:
      - It sees tokens, not individual characters
      - It has no memory at all
      - Letters are removed during embedding
    answer: 0
    why: A word like "strawberry" may be one or two tokens, so the model never directly sees each letter.
  - q: What is attention for?
    options:
      - Compressing the prompt to save cost
      - Letting each token use information from other tokens in the context
      - Checking facts against the internet
    answer: 1
    why: Attention is how the model decides which earlier tokens matter for the current position, e.g. what "it" refers to.
---

## Core concepts

A large language model (LLM) is a **next-token predictor**. Give it some text and it answers one question: "what token most likely comes next?" Everything else, chat, code, summaries, is that one trick repeated many times.

Think of it as an extremely well-read autocomplete. Your phone keyboard guesses the next word from the last two or three. An LLM guesses the next token from *everything* in its context, using patterns learned from a huge amount of text.

The pipeline has four ideas worth knowing:

- **Tokens.** Models don't read characters or whole words. A *tokenizer* splits text into sub-word pieces from a fixed vocabulary (tens of thousands to a few hundred thousand entries). Common words are often one token; rare words, code symbols and many non-English languages take more. Rule of thumb for English: about 4 characters, or three quarters of a word, per token.
- **Embeddings.** Each token ID maps to a vector, a list of numbers. Tokens with similar meaning end up with similar vectors. This is how "car" and "vehicle" end up close together even though the letters differ.
- **Attention.** The core of the *transformer* architecture. At every layer, each token builds a weighted mix of the tokens before it. In "The trophy didn't fit in the suitcase because it was too big", attention is how the model links "it" to "trophy".
- **Generation loop.** After the last layer, the model outputs a probability for every token in the vocabulary. One is picked (see the sampling lesson), appended, and the whole thing runs again. A 500-token answer means roughly 500 passes.

> [!note] Training vs inference
> *Training* sets the model's weights by having it predict the next token over a huge text corpus, then fine-tuning it to follow instructions. *Inference* is what you do through an API: the weights are frozen, and the model only reads your context. It does not learn from your requests.

## How it works in real systems

You meet tokens every day as an engineer, because **limits and billing are counted in tokens**, not characters. Count them before you send:

```python
import tiktoken  # OpenAI's open-source tokenizer library

enc = tiktoken.get_encoding("cl100k_base")

for text in ["hello world", "unbelievable", "Straße", "def f(x): return x**2"]:
    ids = enc.encode(text)
    pieces = [enc.decode([i]) for i in ids]
    print(f"{len(ids):>2} tokens  {pieces}")
```

Each provider uses its own tokenizer, so the same text gives different counts on different models. For an exact count, use the provider's token-counting endpoint or the `usage` field returned with every response.

Things that follow directly from the pipeline:

- **Output is slower than input.** The prompt is processed in parallel in one pass. The answer is produced one token at a time. That is why long answers take longer than long prompts, and why streaming exists.
- **Longer context costs more compute.** Attention compares tokens with each other, so work grows faster than linearly with length. Servers keep a *KV cache* (stored attention results for tokens already processed) so they don't redo work for each new token.
- **No hidden memory.** A chat app "remembers" because it resends the whole conversation every turn. The model itself is stateless between requests.

## Common mistakes

- Treating the model as a database that looks facts up → it generates plausible text from learned patterns; ground it with real data when facts matter.
- Estimating limits in words or characters → count tokens with the right tokenizer or read `usage` from the response.
- Assuming the model learns from your past API calls → it doesn't; anything it needs to know must be in the current request.
- Asking for character-level tasks (counting letters, reversing strings) and trusting the result → do that in code, or have the model call a tool.

## Interview angle

Common phrasing: "Explain how an LLM generates text to a junior engineer" or "What is a token and why should I care?"

A strong answer covers: tokenization into sub-words, embeddings as vectors, attention letting tokens use context, the one-token-at-a-time loop, and the practical consequences (billing and limits in tokens, output latency, statelessness).

Follow-up interviewers like: *"Why is generating 1,000 tokens slower than reading 1,000 tokens?"* Because input tokens are processed in parallel, while output tokens depend on each other and must be produced one after another.
