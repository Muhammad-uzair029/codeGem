---
title: pgvector setup, HNSW vs IVFFlat, and tuning
summary: Store and search embeddings inside Postgres with pgvector, choose between HNSW and IVFFlat indexes, and tune the knobs that trade recall for speed.
minutes: 13
practice: [vec-pg-1, vec-pg-2, vec-pg-3, vec-pg-4, vec-pg-5]
flow:
  title: Taking pgvector to production
  steps:
    - label: Enable extension
      detail: Run CREATE EXTENSION vector once per database. Managed Postgres providers usually ship pgvector; check the version they offer.
    - label: Add a vector column
      detail: Use vector(n) where n is your model's dimension, for example vector(384). Every row must have exactly n numbers.
    - label: Load data
      detail: Bulk-insert embeddings (COPY is fastest). Especially for IVFFlat, load data before building the index.
    - label: Build the ANN index
      detail: HNSW or IVFFlat, with the operator class that matches your query operator, e.g. vector_cosine_ops for <=>.
    - label: Tune at query time
      detail: Raise hnsw.ef_search or ivfflat.probes until recall is good enough, then stop. Higher values cost latency.
    - label: Verify with EXPLAIN
      detail: Confirm the plan uses the index and measure recall against exact search on a sample of real queries.
  loop:
    from: 6
    to: 5
    label: Re-tune until recall and latency both meet the target
selfCheck:
  - q: Which index can you build on an empty table and keep accurate as data grows?
    options:
      - IVFFlat
      - HNSW
      - Neither
    answer: 1
    why: IVFFlat learns its cluster centres from existing rows, so building it on an empty or tiny table gives poor clusters. HNSW has no training step.
  - q: You raise hnsw.ef_search from 40 to 200. What happens?
    options:
      - Recall usually goes up and queries get slower
      - The index is rebuilt
      - Recall goes down but queries get faster
    answer: 0
    why: ef_search is the size of the candidate list kept during a search. A bigger list explores more of the graph, finding more true neighbours at the cost of time. No rebuild is needed.
  - q: Your query orders by embedding <-> $1 but the index uses vector_cosine_ops. What happens?
    options:
      - The query is rejected
      - Postgres converts the index automatically
      - The index is not used and the query does a sequential scan
    answer: 2
    why: An index only serves the operator its operator class supports. <-> is L2 distance; vector_cosine_ops supports <=>.
---

## Core concepts

**pgvector** is a Postgres extension that adds a `vector` column type, distance operators, and approximate nearest neighbour (ANN) indexes. The big win: your embeddings live in the same database as the rest of your data, so you get transactions, joins, backups, row-level security, and ordinary `WHERE` filters for free.

Without an index, pgvector does **exact** search by scanning every row. That's perfectly accurate and fine up to tens of thousands of rows. Beyond that you add an ANN index. pgvector offers two.

**HNSW (Hierarchical Navigable Small World)**

- Builds a layered graph where each vector links to its near neighbours. Search starts at the sparse top layer and greedily walks down toward the query, like taking the motorway, then main roads, then side streets.
- Better speed/recall trade-off for queries. Slower to build and uses more memory.
- No training step: you can create it on an empty table and it stays good as you insert.

**IVFFlat (inverted file, flat)**

- Splits vectors into `lists` clusters (using k-means on existing rows). At query time it only searches the `probes` clusters whose centres are closest to the query. Like checking only the few nearest library shelves instead of the whole building.
- Faster to build and smaller in memory.
- Needs data first: the clusters come from the rows present at build time. If your data shifts a lot later, recall drops until you rebuild.

Rule of thumb: **start with HNSW**. Choose IVFFlat when build time or memory is the real constraint and your data is mostly static.

## How it works in real systems

Setup and table:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id         bigserial PRIMARY KEY,
  tenant_id  bigint NOT NULL,
  content    text NOT NULL,
  embedding  vector(384) NOT NULL   -- must match your model's dimension
);

-- HNSW for cosine distance; m and ef_construction shown at their defaults
CREATE INDEX documents_embedding_hnsw
  ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Alternative: IVFFlat. Build AFTER loading data.
-- CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 1000);
```

Query: the index is only used for `ORDER BY <operator> ... LIMIT`, and the operator must match the operator class.

```sql
BEGIN;
SET LOCAL hnsw.ef_search = 100;          -- default 40; scoped to this transaction
SELECT id, content, 1 - (embedding <=> $1) AS score
FROM documents
WHERE tenant_id = $2
ORDER BY embedding <=> $1
LIMIT 10;
COMMIT;
```

From Python, the `pgvector` package registers the type with psycopg so you can pass NumPy arrays directly:

```python
import psycopg
from pgvector.psycopg import register_vector

with psycopg.connect(DATABASE_URL) as conn:
    register_vector(conn)
    rows = conn.execute(
        "SELECT id, content FROM documents ORDER BY embedding <=> %s LIMIT 5",
        (query_vec,),  # a numpy array from your embedding model
    ).fetchall()
```

### The tuning knobs

| Knob | Index | When set | Effect of raising it |
| --- | --- | --- | --- |
| `m` (default 16) | HNSW | build | More links per node: better recall, bigger index, slower build |
| `ef_construction` (default 64) | HNSW | build | Better graph quality, slower build |
| `hnsw.ef_search` (default 40) | HNSW | query | Better recall, slower queries |
| `lists` | IVFFlat | build | More, smaller clusters: faster per probe, needs more probes |
| `ivfflat.probes` (default 1) | IVFFlat | query | Better recall, slower queries |

The pgvector docs suggest starting IVFFlat with `lists = rows / 1000` up to about 1M rows and `sqrt(rows)` above that, and `probes = sqrt(lists)`.

Other practical tips:

- **Build speed.** HNSW builds are much faster when the graph fits in `maintenance_work_mem`; raise it for the session doing the build. Parallel builds use `max_parallel_maintenance_workers`. Use `CREATE INDEX CONCURRENTLY` on a live table.
- **Dimension limits.** Indexes on the `vector` type support up to 2,000 dimensions. For larger models, `halfvec` (half precision, pgvector 0.7.0+) indexes up to 4,000 dimensions and halves storage.
- **Filters and ANN.** With an HNSW index, the `WHERE` clause is applied *after* the index returns its candidates. If only 10% of rows match `tenant_id = 42` and `ef_search` is 40, you may get about 4 rows back instead of 10. Fixes: raise `ef_search`, use iterative index scans (`SET hnsw.iterative_scan = relaxed_order;`, pgvector 0.8.0+), add a partial index per large tenant, or partition by tenant.
- **Measure recall.** Run a sample of real queries with exact search (for example inside a transaction with `SET LOCAL enable_indexscan = off`) and compare with the indexed results. Tune until recall@10 meets your target.

## Common mistakes

- Building IVFFlat on an empty or nearly empty table → load representative data first, and rebuild after large changes in the data distribution.
- Mismatched operator and operator class → if you query with `<=>`, index with `vector_cosine_ops`. Check with `EXPLAIN ANALYZE`.
- Writing the query so the index can't help (no `LIMIT`, ordering by an expression like `1 - (embedding <=> $1) DESC`) → always `ORDER BY embedding <=> $1 LIMIT k`; compute the display score in the select list.
- Assuming a `WHERE` filter still returns k rows → selective filters starve ANN results. Use iterative scans, partial indexes, or partitioning.
- Cranking `m`, `ef_construction`, and `ef_search` to the max "for quality" → measure recall first; past a point you pay latency and memory for almost nothing.
- Ignoring memory → HNSW performs best when the index fits in RAM. Watch index size as rows and dimensions grow.

## Interview angle

Typical questions: "HNSW or IVFFlat, and why?" or "Our pgvector queries are slow, or returning too few results. What do you check?" A strong answer:

- Explains both structures in one sentence each (layered graph vs clustered buckets).
- Gives the trade-off: HNSW has better query speed/recall and no training step; IVFFlat builds faster with less memory but needs data first.
- Names the real knobs: `m`, `ef_construction`, `hnsw.ef_search`, `lists`, `ivfflat.probes`.
- Mentions verifying index use with `EXPLAIN` and measuring recall against exact search.

Follow-up interviewers like: *"A multi-tenant app's searches return 3 results when the user asked for 10. Why?"* The post-filtering problem: the ANN index returned its top candidates, and the tenant filter removed most of them. Discuss iterative scans, higher `ef_search`, partial indexes, or partitioning by tenant.
