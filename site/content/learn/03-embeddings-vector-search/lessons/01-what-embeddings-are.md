---
title: What embeddings are and how similarity search works
summary: Embeddings turn text into lists of numbers so that "similar meaning" becomes "nearby points", which lets you search by meaning instead of exact words.
minutes: 9
practice: [vec-basics-1, vec-basics-2, vec-basics-3, vec-basics-4]
flow:
  title: Semantic search, end to end
  steps:
    - label: Embed documents
      detail: Run every document (or chunk) through an embedding model once, at write time. Each becomes a fixed-length vector.
    - label: Store vectors
      detail: Save each vector next to its id, text, and metadata in a vector store (pgvector, Qdrant, Pinecone, and so on).
    - label: Embed the query
      detail: At search time, run the user's query through the SAME embedding model to get a query vector.
    - label: Find nearest neighbours
      detail: Compare the query vector with stored vectors using a similarity metric and keep the top k closest.
    - label: Return results
      detail: Map the winning vector ids back to the original text and metadata and return them, best match first.
selfCheck:
  - q: Why must the query be embedded with the same model as the documents?
    options:
      - "It's faster"
      - Different models produce vectors in different spaces, so distances between them are meaningless
      - Vector databases reject vectors from other models
    answer: 1
    why: Each model learns its own coordinate system. Comparing a vector from model A with one from model B is like comparing GPS coordinates with street numbers.
  - q: What does it mean when two embeddings are "close"?
    options:
      - The texts share many exact words
      - The texts have the same length
      - The model considers the texts similar in meaning
    answer: 2
    why: Embeddings capture meaning learned from training data. "Car won't start" and "engine fails to turn over" can be close with zero words in common.
---

## Core concepts

An **embedding** is a list of numbers (a *vector*) that represents a piece of content. An embedding model reads a sentence, paragraph, image, or code snippet and outputs something like `[0.012, -0.341, 0.087, ...]`, usually a few hundred to a few thousand numbers long. The length is the **dimension**, and it is fixed for a given model.

The useful property: **content with similar meaning ends up with similar vectors.** The model learned this during training, by seeing which texts tend to appear in similar contexts.

> [!note] Analogy
> Think of a huge library where books are shelved by *topic*, not title. Cooking books sit near other cooking books; baking sits between cooking and chemistry. An embedding is a book's shelf coordinate. To find books like yours, you walk to its coordinate and look around.

That turns "search by meaning" into a geometry problem:

- **Keyword search** asks: which documents contain these words?
- **Semantic (vector) search** asks: which documents have vectors closest to the query's vector?

So a query like "how do I get my money back" can match a doc titled "Refund policy" even though they share no words.

Key vocabulary:

- **Vector space**: the coordinate system a model's vectors live in. Each model has its own.
- **Nearest neighbour search**: finding the k stored vectors closest to a query vector.
- **Exact (brute force) search**: compare against every vector. Perfect results, slow at scale.
- **Approximate nearest neighbour (ANN)**: use an index (such as HNSW or IVF) to check only a promising subset. Much faster, and it occasionally misses a true neighbour. The fraction of true neighbours it finds is called **recall**.

What embeddings are *not* good at:

- Exact matches such as product codes, error IDs, or names they never saw in training.
- Negation and fine logic. "Flights that are not to Paris" often lands close to "flights to Paris".
- Anything longer than the model's input limit. Text beyond it is truncated, so you split long documents into chunks first.

## How it works in real systems

Ingest runs once per document (and again when it changes). Querying runs on every request. Here is a minimal version using the open-source `sentence-transformers` library, which runs locally:

```python
from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer("all-MiniLM-L6-v2")  # small model, 384 dimensions

docs = [
    "Refunds are issued within 5 business days.",
    "Our office is closed on public holidays.",
    "You can reset your password from the login page.",
]
# normalize so a dot product equals cosine similarity
doc_vecs = model.encode(docs, normalize_embeddings=True)

query_vec = model.encode(["how do I get my money back"], normalize_embeddings=True)[0]
scores = doc_vecs @ query_vec           # one similarity score per doc
for i in np.argsort(-scores)[:2]:
    print(f"{scores[i]:.3f}  {docs[i]}")
```

This is brute-force search: fine for thousands of vectors, too slow for tens of millions. In production you keep the same shape but move storage and search into a vector store with an ANN index.

Production concerns that show up quickly:

- **Batch embedding calls.** Embedding one text per request wastes time on round trips. Send batches.
- **Store the model name and version with each vector.** When you change models, every vector must be re-embedded. Old and new vectors cannot be mixed.
- **Keep the source text and metadata next to the vector** so you can filter (by tenant, date, language) and show results without a second lookup.
- **Hosted vs local models.** Hosted embedding APIs are easy and strong but add latency, cost per token, and send data to a third party. Local models keep data in-house but you run the hardware.

## Common mistakes

- Embedding queries and documents with different models (or different versions of one model) → pin the model, store its name with every vector, and re-embed everything when you change it.
- Embedding whole long documents → split into chunks that fit the model's input limit; truncated text is silently ignored.
- Expecting vector search to handle exact identifiers like `ERR-4021` → combine it with keyword search (covered in the RAG module).
- Treating a similarity score as a probability or a universal threshold → scores are only comparable within one model; calibrate any cutoff on your own data.
- Ignoring some models' query/document instructions → some embedding models expect a prefix or a separate mode for queries vs passages. Read the model card and follow it.

## Interview angle

Usually asked as "What is an embedding?" or "How does semantic search work?" A strong answer:

- Defines an embedding as a fixed-length vector where semantic similarity becomes geometric closeness.
- Walks the pipeline: embed docs at write time, embed the query at read time with the same model, nearest neighbour search, return top k.
- Mentions exact vs approximate search and the recall/latency trade-off.
- Names a limitation (exact identifiers, negation) and the fix (hybrid search).

Follow-up interviewers like: *"You need to switch to a better embedding model. What happens to your existing index?"* Strong answer: you must re-embed the whole corpus, ideally into a new index or column built in parallel, then cut over once it is complete and evaluated. You cannot mix vectors from two models.
