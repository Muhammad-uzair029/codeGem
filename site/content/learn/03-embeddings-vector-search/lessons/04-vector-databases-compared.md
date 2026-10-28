---
title: pgvector vs Pinecone vs Weaviate vs Qdrant
summary: Compare the main ways to store vectors by the trade-offs that actually decide the choice, such as operations burden, filtering, hybrid search, scale, and data locality.
minutes: 10
practice: [vec-db-1, vec-db-2, vec-db-3, vec-db-4]
flow:
  title: Choosing a vector store
  steps:
    - label: Already on Postgres?
      detail: If yes and you expect up to millions of vectors, start with pgvector. One database, real joins, transactions, existing backups.
    - label: Check scale and load
      detail: Estimate vector count, dimensions, query rate, and write rate. Very large or very high-throughput workloads push toward a dedicated engine.
    - label: Check query needs
      detail: Heavy metadata filtering, built-in hybrid search, multi-tenancy, or quantization may favour a dedicated engine.
    - label: Decide who operates it
      detail: Fully managed (Pinecone, or the managed clouds of Weaviate and Qdrant) vs self-hosted open source on your own infrastructure.
    - label: Benchmark on your data
      detail: Load a realistic sample, run real queries with real filters, and measure recall, p95 latency, and cost before committing.
selfCheck:
  - q: What is the strongest reason to pick pgvector over a dedicated vector database?
    options:
      - It is always faster
      - Vectors live next to your relational data, so you get joins, transactions, and one system to run
      - It supports more distance metrics than any other option
    answer: 1
    why: The main advantage is operational simplicity and data locality, not raw speed. Dedicated engines can be faster at very large scale.
  - q: Which of these is self-hostable open-source software?
    options:
      - Pinecone only
      - Qdrant and Weaviate
      - None of them
    answer: 1
    why: Qdrant and Weaviate are open source and can be self-hosted, and each also has a managed cloud. Pinecone is a managed service.
---

## Core concepts

All vector stores do the same core job: store vectors with metadata and return nearest neighbours fast. The differences are about **who runs it, how it filters, what else it does, and how it scales.**

There are two families:

1. **Vector search inside a database you already have.** pgvector for Postgres is the common example. (Elasticsearch/OpenSearch, MongoDB Atlas, and Redis also offer vector search.)
2. **Purpose-built vector databases**, such as Pinecone, Weaviate, Qdrant, and Milvus. Vectors are the main thing they do.

> [!note] Analogy
> Adding pgvector is like adding a good spice rack to the kitchen you already cook in. A dedicated vector DB is a second, specialised kitchen. Better for some dishes at large volume, but now you have two kitchens to clean and keep stocked.

### The contenders, honestly

**pgvector**

- Strengths: one system, SQL, joins with your real tables, ACID transactions (the vector and the row update together), mature Postgres tooling for backups, replication, and access control.
- Weaknesses: you tune Postgres yourself; large HNSW indexes need lots of RAM; filtered ANN needs care (see the previous lesson); scaling writes horizontally is harder than with a system built to shard.

**Pinecone**

- A fully managed, closed-source service. No servers to run, scaling handled for you, namespaces for partitioning data (often per tenant), metadata filtering, and support for sparse-dense vectors for hybrid search.
- Weaknesses: vendor lock-in, data lives with a third party, cost grows with usage, and your relational data stays elsewhere, so you keep two stores in sync.

**Weaviate**

- Open source (written in Go), self-host or managed cloud. Built-in hybrid search that blends BM25 keyword scores with vector scores, optional modules that call embedding models for you at import and query time, and multi-tenancy support.
- Weaknesses: another system to learn and operate; its schema and "collections" model differs from SQL; letting the database call models can hide cost and latency.

**Qdrant**

- Open source (written in Rust), self-host or managed cloud. Strong payload (metadata) filtering applied *during* the HNSW search rather than after it, quantization options (scalar, product, binary) to cut memory, and sparse vectors for hybrid search.
- Weaknesses: another system to run and keep in sync with your primary database; you build more of the surrounding app logic yourself.

### Trade-offs that actually decide it

| Question | Leans pgvector | Leans dedicated engine |
| --- | --- | --- |
| Where is your data today? | Already in Postgres | Spread out, or no relational DB |
| Vector count and query rate | Up to millions, moderate traffic | Hundreds of millions or more, very high throughput |
| Filtering | Simple filters, or ones you can partition | Heavy, highly selective filters on every query |
| Consistency | Must update vector and row atomically | Eventual consistency is fine |
| Operations | Team already runs Postgres well | Want fully managed, or have platform engineers for a new system |
| Data residency | Must stay in your own database | A vendor or a separate cluster is acceptable |

## How it works in real systems

The code shape is nearly identical everywhere. Only the client changes. Here is the same search against pgvector and against Qdrant using its Python client:

```python
# pgvector: plain SQL, can join other tables
rows = conn.execute(
    """SELECT d.id, d.content, u.name
       FROM documents d JOIN users u ON u.id = d.author_id
       WHERE d.tenant_id = %s
       ORDER BY d.embedding <=> %s LIMIT 5""",
    (tenant_id, query_vec),
).fetchall()

# Qdrant: filter applied during the vector search
from qdrant_client import QdrantClient, models
client = QdrantClient(url="http://localhost:6333")
hits = client.query_points(
    collection_name="documents",
    query=query_vec.tolist(),
    query_filter=models.Filter(must=[
        models.FieldCondition(key="tenant_id", match=models.MatchValue(value=tenant_id))
    ]),
    limit=5,
).points
```

Note what the Qdrant version cannot do: join to `users`. You either copy the author name into the payload (and keep it updated) or do a second lookup in your main database. That **dual-write and sync problem** is the hidden cost of any separate vector store: deletes, permission changes, and edits must reach both systems.

A sensible path for most teams:

1. Start with pgvector if you already run Postgres.
2. Measure recall, p95 latency, index memory, and cost as data grows.
3. Move to a dedicated engine only when a measured limit hits (scale, filter performance, operational load), not because a benchmark chart said so.

## Common mistakes

- Choosing a database from vendor benchmarks → benchmark on your own data, dimensions, filters, and recall target. Results vary a lot with configuration.
- Adding a separate vector DB without a sync plan → design how inserts, updates, deletes, and permission changes propagate, and how you repair drift.
- Storing only vectors and IDs in the vector DB, then filtering in app code → push filters into the search so you still get k good results.
- Comparing at different recall levels → "10x faster" means nothing unless both systems reach the same recall@k.
- Assuming managed means zero work → you still own data modelling, re-embedding on model changes, cost control, and evaluation.

## Interview angle

Asked as "Would you use pgvector or a dedicated vector DB?" Interviewers want trade-off reasoning, not a favourite brand. A strong answer:

- Starts from requirements: data size, query rate, filtering, consistency, team skills, compliance.
- Defaults to the simplest option that works (often pgvector when Postgres is already there) and names the signals to migrate.
- Mentions the sync cost of a second datastore.
- Insists on benchmarking at equal recall on real data.

Follow-up interviewers like: *"You picked a dedicated vector DB. A user deletes their account. Walk me through it."* Strong answer: deletes go to both stores (via an outbox or change-data-capture pipeline so they can't silently fail), the vector store deletes by ID or tenant filter, and a periodic reconciliation job catches anything missed.
