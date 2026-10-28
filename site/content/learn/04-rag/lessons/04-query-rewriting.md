---
title: Query rewriting and multi-query retrieval
summary: Fix vague, conversational, or compound questions before they hit the index by rewriting them, generating several variants, or decomposing them into sub-questions.
minutes: 9
practice: [rag-query-1, rag-query-2, rag-query-3]
flow:
  title: Multi-query retrieval
  steps:
    - label: Condense
      detail: Rewrite the latest chat message into a standalone question using the conversation history ("what about for Germany?" becomes "What is the refund window for orders shipped to Germany?").
    - label: Expand
      detail: Ask an LLM for 3 to 5 alternative phrasings or sub-questions of the standalone question.
    - label: Retrieve in parallel
      detail: Run retrieval (vector, keyword, or hybrid) for each variant at the same time.
    - label: Fuse and dedupe
      detail: Merge the result lists with reciprocal rank fusion and remove duplicate chunks.
    - label: Rerank and answer
      detail: Rerank the merged candidates against the ORIGINAL standalone question, then generate the answer.
selfCheck:
  - q: A user's second message is "and how long does that take?" What should happen before retrieval?
    options:
      - Search for "and how long does that take?" as is
      - Rewrite it into a standalone question using the chat history
      - Ignore the message
    answer: 1
    why: The raw follow-up has no searchable content. Condensing it with the conversation history gives retrieval something meaningful to match.
  - q: What does HyDE (Hypothetical Document Embeddings) embed?
    options:
      - The user's question, repeated three times
      - An LLM-written hypothetical answer to the question
      - Only the keywords from the question
    answer: 1
    why: HyDE asks the LLM to write a plausible answer passage and embeds that, because an answer-shaped text often sits closer to real answer passages than the short question does.
---

## Core concepts

Retrieval can only be as good as the query you give it. Real user queries are often:

- **Conversational:** "what about the second one?" means nothing without the chat history.
- **Vague or short:** "pricing" could mean plans, invoices, or discounts.
- **Worded differently from the docs:** users say "kick someone off the team", docs say "remove a member".
- **Compound:** "Compare the refund rules for EU and US customers" needs two separate lookups.

**Query transformation** uses an LLM (usually a small, fast one) to fix the query *before* retrieval. The main techniques:

1. **Condensing (standalone question):** rewrite the latest message using chat history so it stands alone. Basically mandatory for chat-style RAG.
2. **Rewriting:** clean up the query into the language of the docs (expand acronyms, add the likely terms).
3. **Multi-query:** generate several phrasings, retrieve for each, and fuse the results. Like asking three librarians who each interpret the question slightly differently.
4. **Decomposition:** split a compound question into sub-questions, retrieve for each, and answer with all the evidence.
5. **HyDE (Hypothetical Document Embeddings):** have the LLM write a fake answer, then embed *that* for search. Answers look more like answer passages than questions do.
6. **Step-back prompting:** also ask a broader question ("what are the refund rules?") to fetch background context alongside the specific one.

The trade-off is always the same: **better recall for the cost of an extra LLM call (latency and money), plus a risk the rewrite drifts from what the user meant.**

## How it works in real systems

Multi-query retrieval with fusion. `llm_json`, `retrieve`, and `rerank` are your own helpers:

```python
import asyncio

REWRITE_PROMPT = """Rewrite the user's question as {n} different search queries
that could find the answer in company documentation. Keep the original meaning.
Return a JSON list of strings.

Question: {q}"""

async def multi_query_retrieve(question: str, n: int = 3, k: int = 20):
    variants = await llm_json(REWRITE_PROMPT.format(n=n, q=question))
    queries = [question, *variants]              # always keep the original
    results = await asyncio.gather(*(retrieve(q, k=k) for q in queries))

    scores: dict[str, float] = {}
    by_id = {}
    for ranked in results:                       # reciprocal rank fusion
        for rank, chunk in enumerate(ranked, start=1):
            scores[chunk.id] = scores.get(chunk.id, 0) + 1 / (60 + rank)
            by_id[chunk.id] = chunk
    fused = sorted(by_id.values(), key=lambda c: scores[c.id], reverse=True)
    return rerank(question, fused[:30])          # judge against the original
```

Design choices in production:

- **Always include the original query** in the set, so a bad rewrite can't remove good results.
- **Run variants in parallel** so latency is one round of retrieval, not n.
- **Use a small, fast model** for rewriting and set a tight timeout; fall back to the original query on failure.
- **Log the rewrites.** When an answer is wrong, the rewritten query is often the culprit.
- **Make it conditional.** Skip expansion for clear, specific queries (or when the first retrieval already scores well) to save latency.

## Common mistakes

- Searching with the raw follow-up message in a chat → condense with history first.
- Replacing the user's query with the rewrite → keep the original as one of the queries, and rerank against it.
- Letting the rewriter answer the question or add facts → instruct it to only rephrase, and test for drift.
- Running every technique on every query → each adds latency and cost. Add them one at a time and keep the ones your evaluation proves useful.
- Forgetting filters on the variant searches → every variant must carry the same tenant and permission filters.

## Interview angle

Asked as "Users ask vague or follow-up questions and retrieval fails. What do you do?" A strong answer:

- Separates the problems: missing context (condense), vocabulary mismatch (rewrite, HyDE, multi-query), compound questions (decompose).
- Explains multi-query retrieval with fusion and why to keep the original query.
- Talks about cost and latency: small model, parallel retrieval, conditional use, fallback.
- Measures recall before and after on a question set.

Follow-up interviewers like: *"When would HyDE hurt?"* When the LLM knows nothing about the domain and writes a confidently wrong hypothetical answer, the search then pulls passages about the wrong thing. It also adds a full generation step of latency.
