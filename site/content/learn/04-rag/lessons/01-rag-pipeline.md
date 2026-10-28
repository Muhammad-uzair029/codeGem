---
title: The RAG pipeline, end to end
summary: Follow a document from ingestion to a grounded, cited answer, and see why each stage of a retrieval-augmented generation (RAG) pipeline exists.
minutes: 11
practice: [rag-pipe-1, rag-pipe-2, rag-pipe-3, rag-pipe-4]
flow:
  title: The RAG pipeline
  steps:
    - label: Ingest
      detail: Pull documents from their sources (docs, wikis, tickets, PDFs), extract clean text, and attach metadata such as source URL, owner, date, and permissions.
    - label: Chunk
      detail: Split each document into passages small enough to embed and specific enough to be useful, keeping headings and metadata with each chunk.
    - label: Embed
      detail: Turn every chunk into a vector with an embedding model. Record the model name so query and documents always match.
    - label: Store
      detail: Write vectors, text, and metadata to a vector store (pgvector, Qdrant, and so on), plus a keyword index if you use hybrid search.
    - label: Retrieve
      detail: At question time, embed the query, search for the top k chunks (with filters such as tenant and permissions), and optionally rerank them.
    - label: Generate
      detail: Put the retrieved chunks into the prompt with instructions to answer only from them and cite sources, then call the LLM.
selfCheck:
  - q: Which stages run once per document rather than once per question?
    options:
      - Retrieve and generate
      - Ingest, chunk, embed, and store
      - Only generate
    answer: 1
    why: The offline (indexing) half prepares the knowledge base ahead of time. The online half (retrieve, generate) runs on every user question.
  - q: What is the main reason to use RAG instead of fine-tuning to teach a model your company docs?
    options:
      - RAG makes the model smarter at reasoning
      - RAG keeps knowledge up to date and citable without retraining
      - Fine-tuning cannot change model behaviour
    answer: 1
    why: With RAG you update the index, not the model, and every answer can point to the passage it came from. Fine-tuning is better for teaching style or format than for adding changing facts.
---

## Core concepts

An LLM only knows what was in its training data, which is frozen at a cutoff date and doesn't include your private documents. **Retrieval-augmented generation (RAG)** fixes that by looking up relevant text first and handing it to the model along with the question.

> [!note] Analogy
> A closed-book exam vs an open-book exam. Without RAG the model answers from memory and sometimes makes things up confidently. With RAG it gets to flip to the right pages first, and you can check which pages it used.

RAG has two halves:

- **Indexing (offline):** ingest → chunk → embed → store. Runs when documents are added or changed.
- **Answering (online):** retrieve → generate. Runs on every question.

Why teams reach for RAG:

- **Fresh knowledge.** Update a doc, re-index it, and the next answer reflects it. No retraining.
- **Private data.** The model sees your docs only at question time, and only the ones the user may access.
- **Citations.** Each answer can link to its sources, which builds trust and makes errors easy to spot.
- **Fewer hallucinations**, though not zero. The model can still ignore or misread the context.

RAG vs fine-tuning, in one line: **RAG adds knowledge, fine-tuning shapes behaviour** (tone, format, a specialised task). They are often combined.

## How it works in real systems

A compact version of the online half, using Postgres + pgvector for retrieval. `embed` and `llm` stand in for your embedding model and LLM client of choice:

```python
def answer(question: str, user) -> dict:
    q_vec = embed(question)                       # same model used at ingest
    chunks = db.execute(
        """SELECT id, content, source_url FROM chunks
           WHERE tenant_id = %s AND acl && %s     -- permission filter
           ORDER BY embedding <=> %s LIMIT 6""",
        (user.tenant_id, user.groups, q_vec),
    ).fetchall()

    context = "\n\n".join(
        f"[{i + 1}] ({c.source_url})\n{c.content}" for i, c in enumerate(chunks)
    )
    prompt = (
        "Answer using ONLY the sources below. Cite them like [1]. "
        "If the answer is not in the sources, say you don't know.\n\n"
        f"Sources:\n{context}\n\nQuestion: {question}"
    )
    return {"answer": llm(prompt), "sources": [c.source_url for c in chunks]}
```

What production pipelines add around this skeleton:

- **Clean ingestion.** Strip navigation, footers, and boilerplate. Handle PDFs and tables carefully, because bad text extraction poisons everything downstream.
- **Incremental indexing.** Track a content hash or `updated_at` per document so you only re-chunk and re-embed what changed, and delete chunks when the source is deleted.
- **Permission filtering at retrieval time.** Never retrieve chunks the user can't see and rely on the prompt to hide them. Once text is in the prompt, it can leak.
- **Hybrid search and reranking** to improve what gets retrieved (lesson 3).
- **A "no answer" path.** If retrieval scores are weak, it is better to say "I couldn't find that" than to let the model guess.
- **Logging** of the query, retrieved chunk IDs, scores, and final answer, so you can debug bad answers later (lesson 5).

> [!tip] Keep the prompt honest
> Instruct the model to answer only from the sources and to say when they don't contain the answer. Then test that it actually does, with questions your docs can't answer.

## Common mistakes

- Treating RAG as "just add a vector DB" → most quality comes from ingestion, chunking, and retrieval tuning. Budget time for them.
- Skipping permission filters in retrieval → filter by tenant and access rights in the query itself, before anything reaches the prompt.
- Stuffing as many chunks as fit into the context window → more context adds noise, cost, and latency. Retrieve broadly, rerank, and send a focused handful.
- Never deleting stale chunks → track source IDs and remove or replace chunks when documents change or disappear.
- No citations → return source links with every answer so users and developers can verify it.
- Not evaluating → build a small set of real questions with known answers and measure retrieval and answer quality before and after every change.

## Interview angle

Usually: "Explain how RAG works" or "Design a chatbot over our internal docs." A strong answer:

- Names both halves and every stage: ingest, chunk, embed, store; retrieve, generate.
- Explains why RAG instead of fine-tuning: freshness, private data, citations.
- Brings up production concerns unprompted: permissions, incremental re-indexing, hybrid search and reranking, a "don't know" path, evaluation.

Follow-up interviewers like: *"How do you stop the bot from showing a user content from documents they don't have access to?"* Strong answer: store access-control metadata on every chunk at ingest and filter on it inside the retrieval query; keep it in sync when permissions change; never rely on the LLM to withhold text it has already been given.
