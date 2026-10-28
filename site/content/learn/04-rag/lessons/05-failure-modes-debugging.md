---
title: RAG failure modes and how to debug them
summary: Learn the common ways RAG answers go wrong, how to tell a retrieval failure from a generation failure, and how to measure and fix each one systematically.
minutes: 11
practice: [rag-debug-1, rag-debug-2, rag-debug-3, rag-debug-4]
flow:
  title: Debugging a bad RAG answer
  steps:
    - label: Reproduce and log
      detail: Pull the trace for the bad answer, including the original query, the rewritten queries, retrieved chunk IDs, scores, the final prompt, and the output.
    - label: Is the answer in the corpus?
      detail: Search the source documents directly. If the fact isn't indexed (missing, stale, or extraction failed), fix ingestion.
    - label: Was it retrieved?
      detail: Check whether the right chunk appears in the top k. If not, it's a retrieval problem, such as chunking, the query, hybrid weights, filters, or k.
    - label: Did it reach the prompt?
      detail: Check that reranking, truncation, or token limits didn't drop it before the prompt was built.
    - label: Did the model use it?
      detail: If the right chunk was in the prompt and the answer is still wrong, it's a generation problem, such as prompt instructions, conflicting chunks, or position in a long context.
    - label: Add to the eval set
      detail: Turn the case into a test question with the expected source and answer, so the fix is measured and can't regress.
selfCheck:
  - q: The correct chunk was in the prompt, but the model still answered wrongly. What kind of failure is this?
    options:
      - Retrieval failure
      - Generation failure
      - Ingestion failure
    answer: 1
    why: Retrieval did its job. The model ignored, misread, or contradicted the context, so look at the prompt, conflicting chunks, and context length.
  - q: Which metric tells you whether the right chunk was found at all?
    options:
      - Recall@k
      - Answer length
      - Tokens per second
    answer: 0
    why: Recall@k is the share of questions whose relevant chunk appears in the top k results. It isolates retrieval quality from generation quality.
---

## Core concepts

When a RAG system gives a bad answer, the instinct is to tweak the prompt. Usually that's the wrong place. A RAG answer passes through several stages, and **each stage has its own failure modes**:

| Stage | What goes wrong | Typical symptom |
| --- | --- | --- |
| Ingestion | Doc never indexed, stale version, broken PDF or table extraction | "I don't know" for things that are documented |
| Chunking | Key fact split across chunks, chunk without context | Half-answers, missing steps |
| Query | Vague or follow-up question, vocabulary mismatch | Irrelevant sources retrieved |
| Retrieval | Exact terms missed by vectors, k too small, over-strict filters | Right doc exists but never shows up |
| Ranking / packing | Reranker drops the right chunk, context truncated | Right chunk retrieved but not in the prompt |
| Generation | Model ignores context, blends conflicting chunks, hallucinates | Confident answer that contradicts the sources |

> [!note] Analogy
> Debugging RAG is like debugging a wrong delivery. Was the item ever in the warehouse (ingestion)? Did the picker grab it (retrieval)? Did it make it into the box (prompt)? Did the courier hand over the right box (generation)? You check in order and you don't blame the courier until you've checked the box.

### Separate retrieval from generation

The most important debugging move is answering one question: **was the right information in the prompt?**

- **No** → retrieval-side problem (ingestion, chunking, query, search, ranking). Prompt changes won't help.
- **Yes** → generation-side problem (instructions, conflicting or noisy context, model capability).

### Measure, don't eyeball

Build an **evaluation set**: real questions with the expected source chunk (and ideally a reference answer). Then track:

- **Retrieval:** recall@k (was a relevant chunk in the top k?), MRR or nDCG (how high was it ranked?).
- **Generation:** faithfulness or groundedness (is every claim supported by the retrieved context?), answer correctness against the reference, and whether it correctly says "I don't know" when the answer isn't there.

Generation metrics are often scored by an LLM judge. That's useful, but spot-check the judge against human labels.

### Well-known generation pitfalls

- **Lost in the middle:** research has found that models use information at the start and end of a long context more reliably than information buried in the middle. Send fewer, better-ranked chunks, with the best ones at the edges.
- **Conflicting sources:** an old and a new version of a policy both get retrieved. Filter by date or version, or delete stale docs at ingest.
- **Answering from memory:** the model ignores the context and uses training knowledge. Tighten instructions, require citations, and test with questions where the docs disagree with common knowledge.

## How it works in real systems

Log a trace for every request so any bad answer can be replayed:

```ts
type RagTrace = {
  requestId: string;
  question: string;
  rewrittenQueries: string[];
  retrieved: { chunkId: string; score: number; source: string }[];
  reranked: { chunkId: string; score: number }[];
  promptTokens: number;
  answer: string;
  citedChunkIds: string[];
  latencyMs: { rewrite: number; retrieve: number; rerank: number; generate: number };
};
```

A tiny retrieval evaluation you can run in CI, before and after any change to chunking, embeddings, or search:

```python
def recall_at_k(eval_set: list[dict], k: int = 5) -> float:
    hits = 0
    for case in eval_set:     # {"question": ..., "relevant_ids": {...}}
        results = retrieve(case["question"], k=k)
        if any(r.chunk_id in case["relevant_ids"] for r in results):
            hits += 1
    return hits / len(eval_set)

baseline = recall_at_k(EVAL_SET)
print(f"recall@5 = {baseline:.2%}")
assert baseline >= 0.85, "retrieval regressed"   # threshold set from your own data
```

Fix cheat sheet:

- Not in the corpus → fix connectors and extraction, add incremental re-indexing, alert on failed documents.
- In the corpus, not retrieved → hybrid search for exact terms, better chunking with headers, query condensing or rewriting, larger k, check filters and the ANN recall settings.
- Retrieved, not in the prompt → rerank a bigger candidate set, check truncation and token budgets.
- In the prompt, answer still wrong → clearer instructions, fewer and better-ordered chunks, remove stale duplicates, require citations, consider a stronger model.

## Common mistakes

- Tweaking the prompt first → check whether the right chunk was retrieved before touching generation.
- No traces → log queries, rewrites, chunk IDs, scores, and prompts for every request (with care for sensitive data).
- Judging changes by trying three questions by hand → keep an evaluation set and compare metrics before and after every change.
- Optimising only for answer quality → track retrieval metrics separately so you know which stage improved or regressed.
- Never testing unanswerable questions → include questions the docs can't answer and check the system says so.
- Trusting an LLM judge blindly → validate it against a sample of human ratings.

## Interview angle

Asked as "Your RAG bot gives wrong answers. How do you debug it?" Interviewers look for a systematic method. A strong answer:

- Splits the problem: is the info in the corpus, was it retrieved, did it reach the prompt, did the model use it?
- Names metrics for each side: recall@k, MRR/nDCG for retrieval; faithfulness and correctness for generation.
- Mentions tracing every request and building an evaluation set from real failures.
- Knows specific failure modes: chunk boundaries, vocabulary mismatch, stale or conflicting docs, lost in the middle, over-filtering.

Follow-up interviewers like: *"How do you build the evaluation set if you have no labelled data?"* Strong answer: start from real user questions in logs, have domain experts label relevant sources for a few dozen to a few hundred of them, add failures as they're reported, and optionally use an LLM to generate candidate questions from chunks, then review them by hand so the set reflects real usage.
