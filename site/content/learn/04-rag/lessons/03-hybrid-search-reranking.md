---
title: Hybrid search and reranking
summary: Combine keyword and vector search so you catch both exact terms and paraphrases, merge the results with reciprocal rank fusion, and sharpen the final order with a cross-encoder reranker.
minutes: 12
practice: [rag-hybrid-1, rag-hybrid-2, rag-hybrid-3, rag-hybrid-4]
flow:
  title: Hybrid retrieval with reranking
  steps:
    - label: Keyword search
      detail: Run the query against a full-text index (BM25 or Postgres full-text search) and keep the top 50 or so. Strong on exact terms, codes, and names.
    - label: Vector search
      detail: Embed the query and take the top 50 or so nearest chunks. Strong on paraphrases and meaning.
    - label: Fuse
      detail: Merge both lists with reciprocal rank fusion (RRF), which rewards chunks that rank well in either list or both.
    - label: Rerank
      detail: Score the top 20 to 50 fused candidates with a cross-encoder that reads the query and each chunk together.
    - label: Send the best few
      detail: Keep the top 3 to 8 reranked chunks and put them in the prompt.
selfCheck:
  - q: Why does reciprocal rank fusion use ranks instead of raw scores?
    options:
      - Ranks are faster to compute
      - BM25 scores and vector similarities are on different scales, so adding them directly is meaningless
      - Raw scores are not available from search engines
    answer: 1
    why: A BM25 score of 12 and a cosine similarity of 0.82 can't be compared. Ranks put both lists on the same footing without any normalisation.
  - q: Why are cross-encoders used for reranking rather than for the first search?
    options:
      - They are less accurate than embeddings
      - They must run the model on every query-document pair, which is too slow over a whole corpus
      - They only work with keyword results
    answer: 1
    why: A cross-encoder can't precompute document vectors; it scores each pair at query time. That is affordable for 50 candidates, not for millions of chunks.
---

## Core concepts

Vector search and keyword search fail in opposite ways:

- **Vector search** understands that "reset my login" ≈ "change password", but it can miss exact strings: `ERR-4021`, `SKU 88-1032`, a person's surname, a new product name.
- **Keyword search** (for example **BM25**, the classic relevance formula used by Elasticsearch, OpenSearch, and Lucene) nails exact terms but misses paraphrases and synonyms.

**Hybrid search** runs both and merges the results, so you get the best of each.

### Merging: reciprocal rank fusion (RRF)

The two searches score on different scales, so you can't just add the scores. RRF ignores scores and uses **positions**:

```
RRF_score(doc) = sum over each result list of  1 / (k + rank_in_that_list)
```

- `rank` starts at 1. `k` is a smoothing constant; 60 is the value from the original paper and a common default.
- A chunk ranked #1 in both lists beats one ranked #1 in only one list. A chunk that appears in just one list still gets credit.
- No tuning or score normalisation needed, which is why it's a popular default. The alternative, a weighted blend of normalised scores (often called `alpha`), can do better when tuned but needs labelled data to tune.

### Reranking: a second, smarter opinion

First-stage retrieval uses a **bi-encoder**: the query and documents are embedded *separately*, so document vectors can be computed ahead of time. Fast, but the model never sees the query and the document together.

A **cross-encoder** reads the query and one document *together* and outputs a relevance score. It catches details like "the question asks about *international* refunds and this chunk is about domestic ones". Much more accurate, but you must run it once per pair at query time.

> [!note] Analogy
> Retrieval is a recruiter skimming 1,000 CVs for keywords and pulling 50. Reranking is the hiring manager reading those 50 carefully against the job description. You'd never ask the hiring manager to read all 1,000.

So the standard shape is: **retrieve wide (cheap), rerank narrow (accurate), send few (focused).** Rerankers can be open-source cross-encoder models you host or hosted reranking APIs; an LLM can also act as a reranker at higher cost.

## How it works in real systems

Hybrid search with RRF entirely in Postgres (full-text search + pgvector). Assumes a `tsv tsvector` column with a GIN index:

```sql
WITH keyword AS (
  SELECT id, row_number() OVER (ORDER BY ts_rank_cd(tsv, q) DESC) AS rnk
  FROM chunks, websearch_to_tsquery('english', $1) AS q
  WHERE tsv @@ q
  ORDER BY rnk LIMIT 50
),
semantic AS (            -- inner LIMIT lets the HNSW index do the work
  SELECT id, row_number() OVER (ORDER BY dist) AS rnk
  FROM (SELECT id, embedding <=> $2 AS dist
        FROM chunks ORDER BY embedding <=> $2 LIMIT 50) nn
)
SELECT id,
       COALESCE(1.0 / (60 + k.rnk), 0) + COALESCE(1.0 / (60 + s.rnk), 0) AS rrf
FROM keyword k FULL OUTER JOIN semantic s USING (id)
ORDER BY rrf DESC
LIMIT 30;
```

Then rerank the fused candidates with a cross-encoder, here an open-source one via `sentence-transformers`:

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

def rerank(query: str, chunks: list[dict], top_n: int = 5) -> list[dict]:
    scores = reranker.predict([(query, c["content"]) for c in chunks])
    ranked = sorted(zip(chunks, scores), key=lambda pair: pair[1], reverse=True)
    return [c for c, _ in ranked[:top_n]]
```

Practical notes:

- **Candidate counts are tuning knobs.** Bigger first-stage lists improve recall; bigger rerank sets cost latency. Measure both.
- **Reranker latency** grows with the number of pairs and chunk length. Batch the pairs, run on a GPU if self-hosting, and cap chunk length.
- **Reranker scores can drive a "no good answer" cutoff,** since they're more meaningful than raw vector similarities. Calibrate the threshold on your data.
- Dedicated engines (Weaviate, Qdrant, Elasticsearch/OpenSearch, Pinecone with sparse-dense vectors) offer built-in hybrid search; the idea is the same.

## Common mistakes

- Adding BM25 scores and cosine similarities directly → use RRF, or normalise both before a weighted blend.
- Reranking the whole corpus, or only the final 5 → rerank a moderate candidate set (tens of chunks); reranking 5 can't recover a chunk that retrieval missed.
- Applying permission filters only after reranking → filter in both first-stage searches so forbidden chunks never become candidates.
- Assuming hybrid always helps → measure on your query set. On some corpora the keyword side adds noise, and weighting should change.
- Forgetting language config in full-text search → the `'english'` config stems English words; other languages need their own config, or use `'simple'`.

## Interview angle

Asked as "How would you improve retrieval quality?" or "What is hybrid search?" A strong answer:

- Explains why vector and keyword search fail differently (paraphrase vs exact term).
- Describes RRF with its formula and why ranks beat raw scores.
- Explains bi-encoder vs cross-encoder and the retrieve-wide, rerank-narrow pattern.
- Mentions latency budgets and measuring with recall@k or nDCG before and after.

Follow-up interviewers like: *"Reranking added 300 ms. How do you get it back?"* Strong answer: rerank fewer candidates, truncate chunks, use a smaller reranker model, batch on a GPU, cache results for repeated queries, or skip reranking when the first-stage top result is clearly dominant.
