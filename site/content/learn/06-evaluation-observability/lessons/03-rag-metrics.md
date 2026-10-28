---
title: RAG metrics - faithfulness, relevance, precision, recall
summary: Measure retrieval and generation separately, so you know whether a bad answer came from bad search or a bad model response.
minutes: 11
practice: [eval-rag-1, eval-rag-2, eval-rag-3]
flow:
  title: Where each RAG metric looks
  steps:
    - label: Question
      detail: The user's input. Response relevancy compares the answer back to this.
    - label: Retrieve chunks
      detail: The retriever returns ranked chunks. Context precision asks whether the relevant ones are ranked near the top.
    - label: Compare to reference
      detail: Context recall asks whether the retrieved chunks contain everything the reference (ideal) answer needs.
    - label: Generate answer
      detail: The model writes an answer from the chunks.
    - label: Check grounding
      detail: Faithfulness splits the answer into claims and checks each is supported by the retrieved chunks.
    - label: Diagnose
      detail: Low recall or precision points to retrieval; low faithfulness or relevancy points to the prompt or model.
selfCheck:
  - q: An answer is correct in the real world but includes a fact that isn't in the retrieved context. Which metric drops?
    options:
      - Context recall
      - Faithfulness
      - Context precision
    answer: 1
    why: Faithfulness measures whether claims are supported by the retrieved context, not whether they're true in general.
  - q: Context recall needs which extra input?
    options:
      - A reference (ground-truth) answer or the set of relevant chunks
      - The model's temperature
      - User feedback ratings
    answer: 0
    why: Recall asks "did we retrieve everything needed?", which requires knowing what was needed, i.e. a reference.
  - q: Retrieval returns the right chunk, but at position 9 of 10, below irrelevant ones. Which metric captures this?
    options:
      - Context precision
      - Faithfulness
      - Response relevancy
    answer: 0
    why: Context precision rewards ranking relevant chunks higher. Recall would still be fine because the chunk was retrieved.
---

## Core concepts

A RAG (retrieval-augmented generation) system has two halves that fail differently: **retrieval** (find the right chunks) and **generation** (write a good answer from them). One "is the answer good?" score can't tell you which half broke. So we measure each.

The definitions below follow how the open-source library **Ragas** popularized them. Other tools (TruLens, DeepEval, LangSmith evaluators) have similar metrics with slightly different names and formulas.

**Generation metrics**

- **Faithfulness** (groundedness): are the answer's claims supported by the retrieved context? Ragas splits the answer into individual claims and computes *supported claims / total claims*, from 0 to 1. Low faithfulness means the model is making things up or using outside knowledge. Note: an answer can be true but unfaithful, if the fact wasn't in the context.
- **Response relevancy** (answer relevancy): does the answer address the question? Ragas generates questions that the answer would fit, and measures how similar they are to the original question using embeddings. It penalizes off-topic or incomplete answers. It does **not** check correctness.

**Retrieval metrics**

- **Context precision**: of what was retrieved, is the relevant material ranked near the top? It's a ranking-aware precision: relevant chunks at positions 1–2 score higher than the same chunks at 8–9. Low precision means noise in the context, which wastes tokens and can distract the model.
- **Context recall**: did retrieval find *everything needed* to answer? Ragas splits the **reference answer** into claims and checks how many can be attributed to the retrieved context. Low recall means the answer couldn't possibly be complete, however good the model is.

Analogy: a student writing an exam answer with an open book. *Recall*: did they find all the relevant pages? *Precision*: were the relevant pages on top of the pile, or buried under unrelated ones? *Faithfulness*: did they only write what the pages say? *Relevancy*: did they answer the question that was asked?

| Metric | Needs a reference answer? | Low score usually means |
|---|---|---|
| Faithfulness | No | Hallucination; tighten prompt ("only use the context") |
| Response relevancy | No | Off-topic or evasive answers |
| Context precision | Depends on the variant (reference or answer) | Too much noise; add reranking, better chunking |
| Context recall | Yes | Missing info; improve chunking, embeddings, hybrid search, top-k |

## How it works in real systems

With Ragas, each sample holds the question, retrieved contexts, the response, and (for some metrics) a reference. This uses the Ragas 0.2-style API; class names have changed between versions, so check the docs for your installed version.

```python
from ragas import evaluate, EvaluationDataset
from ragas.metrics import Faithfulness, ResponseRelevancy, LLMContextPrecisionWithReference, LLMContextRecall

samples = []
for ex in eval_set:                                   # your curated questions + reference answers
    chunks = retriever.search(ex["question"], k=5)
    answer = generate(ex["question"], chunks)
    samples.append({
        "user_input": ex["question"],
        "retrieved_contexts": [c.text for c in chunks],
        "response": answer,
        "reference": ex["reference_answer"],
    })

result = evaluate(
    dataset=EvaluationDataset.from_list(samples),
    metrics=[Faithfulness(), ResponseRelevancy(), LLMContextPrecisionWithReference(), LLMContextRecall()],
    llm=evaluator_llm, embeddings=evaluator_embeddings,   # wrappers around your judge model
)
print(result)            # per-metric averages; result.to_pandas() for per-sample rows
```

How teams use these numbers:

- **Diagnose before fixing.** Low recall: work on chunking, embeddings, hybrid (keyword + vector) search, or larger top-k. Low precision: add a reranker or reduce top-k. Low faithfulness with good recall: fix the prompt or the model.
- **Read the per-sample rows**, not just averages. The worst 10 samples usually reveal the real bug.
- **Remember these are LLM-judged.** They inherit judge biases and noise; spot-check them against human labels.
- **Pure retrieval metrics** (hit rate, recall@k, MRR) are cheap if you've labeled which chunk ids are relevant for each question, and need no LLM at all.

> [!note] Faithful is not the same as correct
> If the retrieved document is outdated, an answer can be perfectly faithful and still wrong. Pair faithfulness with a correctness check against references.

## Common mistakes

- One overall "quality" score for RAG → measure retrieval and generation separately.
- Treating faithfulness as correctness → faithfulness only means "supported by the context".
- Expecting context recall without references → write reference answers (or label relevant chunks) for your eval set.
- Fixing the prompt when recall is low → no prompt can use information that wasn't retrieved.
- Trusting metric averages blindly → inspect low-scoring samples and calibrate against humans.
- Comparing scores across Ragas versions or judge models → keep the evaluator fixed when comparing pipeline versions.

## Interview angle

Common question: *"How do you evaluate a RAG system?"* A strong answer splits retrieval from generation and defines each metric precisely: faithfulness (claims supported by context), response relevancy (addresses the question), context precision (relevant chunks ranked high), context recall (everything needed was retrieved, requires a reference). Then explain how each low score maps to a specific fix.

Follow-up: *"Faithfulness is high but users say answers are wrong. What's happening?"* The retrieved documents may be wrong or stale, or retrieval found the wrong document and the model faithfully summarized it. Check context relevance and recall, and the freshness of the source data.
