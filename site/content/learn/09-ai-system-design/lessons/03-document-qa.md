---
title: "Worked design: document Q&A"
summary: Design a system that answers questions over a company's private documents with citations, permissions and freshness.
minutes: 12
practice: [sd-docqa-1, sd-docqa-2, sd-docqa-3]
flow:
  title: Ingest once, answer many times
  steps:
    - label: Ingest
      detail: Connectors pull documents from drives, wikis and ticket systems, along with their access permissions and last-modified dates.
    - label: Parse and chunk
      detail: Extract text (including tables and PDFs), split into sections that keep headings, and attach metadata such as source, owner and permissions.
    - label: Index
      detail: Store embeddings in a vector index and keep a keyword index too, so both meaning and exact terms can be matched.
    - label: Query
      detail: The user asks a question. Optionally rewrite it into a clearer search query using the chat history.
    - label: Retrieve and filter
      detail: Run hybrid search, keep only chunks the user is allowed to see, then rerank the top candidates.
    - label: Answer with citations
      detail: The model answers only from the selected chunks and cites each claim, or says the documents don't cover it.
    - label: Feedback
      detail: Log which chunks were used and the user's rating. Unanswered questions show gaps in the documents.
  loop:
    from: 7
    to: 2
    label: Improve chunking and coverage
selfCheck:
  - q: Where should permission filtering happen in a document Q&A system?
    options:
      - In the prompt, by asking the model not to reveal restricted content
      - At retrieval time, before any chunk reaches the model
      - After the answer is generated
    answer: 1
    why: Anything in the context can leak into the answer. Filter by the user's permissions before retrieval results are passed to the model.
  - q: Why combine keyword search with vector search?
    options:
      - Vector search can't handle long documents
      - Keyword search catches exact terms like product codes and names that embeddings may blur
      - Keyword search is always more accurate
    answer: 1
    why: Embeddings match meaning; keyword search matches exact strings. Hybrid search covers both kinds of questions.
  - q: What's the best response when retrieved chunks don't contain the answer?
    options:
      - Let the model answer from its general knowledge
      - Say the documents don't cover it and show the closest sources
      - Retry with a bigger model
    answer: 1
    why: Users trust document Q&A because it is grounded. Answering from general knowledge silently breaks that trust.
---

## Core concepts

Document Q&A is **RAG** (retrieval-augmented generation): find the relevant passages first, then ask the model to answer using only them. The analogy is an open-book exam. The model is the student; your retrieval system decides which pages of the book are open on the desk. If the right page isn't there, even a brilliant student gets it wrong.

**Requirements to clarify**

- Corpus: how many documents, which formats (PDF, slides, wiki, spreadsheets), how often they change?
- Users and permissions: does everyone see everything, or must answers respect document access rights?
- Answer style: short answers with citations, or long reports?
- Freshness: is a day-old index fine, or must new docs be searchable within minutes?
- Languages.

**Success metrics**

- *Retrieval recall*: for a question, is the right passage among the retrieved chunks?
- *Answer correctness* and *faithfulness* (every claim is supported by a cited chunk).
- *Abstention quality*: says "not covered" when it really isn't.
- Latency to first token, cost per question.

**Baseline**: the existing enterprise search. If people can find the answer with search in ten seconds, your system needs to be clearly better.

## How it works in real systems

**Architecture** follows two pipelines (see the flow):

- **Offline ingestion**: connectors → parsing → chunking → embeddings + keyword index. Runs on a schedule or on change events.
- **Online query**: rewrite → hybrid retrieve → permission filter → rerank → generate with citations.

**Data decisions that matter most**

- **Parsing** is where many systems quietly fail. Tables, scanned PDFs and slides need proper extraction (OCR for scans). Garbage in, garbage retrieved.
- **Chunking**: split by document structure (headings, sections) rather than fixed character counts, and include the document title and heading path in each chunk so it makes sense alone.
- **Metadata**: source URL, owner, last-modified date, access list. You'll filter and cite with it.
- **Deletions**: when a document is deleted or access is revoked, the index must update too. Stale permissions are a security bug.

A query path with permissions enforced in code:

```python
def answer(question: str, user: User) -> Answer:
    query = rewrite_query(question, user.chat_history)      # small model
    candidates = hybrid_search(query, top_k=50)              # vector + keyword
    allowed = [c for c in candidates if user.can_read(c.doc_id)]
    top = rerank(query, allowed)[:8]                          # cross-encoder or LLM

    if not top or top[0].score < MIN_RELEVANCE:
        return Answer.not_covered(suggestions=allowed[:3])

    prompt = build_prompt(question, top)  # numbered sources, "cite as [n]"
    draft = llm_generate(prompt)
    if not citations_valid(draft, top):
        return Answer.not_covered(suggestions=top[:3])
    return Answer(text=draft.text, sources=[c.url for c in top])
```

Better still, push the permission filter into the search query itself (most vector stores support metadata filters), so restricted chunks are never fetched at all. The post-filter above is the minimum.

**Model choices.** An embedding model for indexing (changing it later means re-embedding everything, so choose carefully), a reranker for precision, and a generator good at following "only use these sources" instructions. Long-context models can take more chunks, but stuffing the context costs more and can bury the key passage. Retrieval quality still matters.

**Evals.** Build a set of question → expected source → expected answer triples with document owners. Measure retrieval and generation separately: if recall is low, no prompt will save you. Track faithfulness with an LLM judge checked against human labels.

**Failure modes**

- Right document, wrong chunk → better chunking, reranking, include headings.
- Outdated document wins over the current one → boost by recency, show dates in citations, archive old versions.
- Permission leak → filter at retrieval, sync access lists, test with users of different roles.
- Prompt injection hidden inside a document ("ignore previous instructions...") → treat document text as data, not instructions; limit what the model can do.
- Contradictory sources → show both and say they disagree, rather than picking silently.

## Common mistakes

- **Asking the model to respect permissions** → enforce access in retrieval code; the model can't keep secrets it was shown.
- **Fixed-size chunks with no context** → chunk by structure and prepend title and heading path.
- **Only evaluating final answers** → evaluate retrieval recall separately so you know which stage to fix.
- **Ignoring deletions and updates** → make ingestion incremental and handle removals and access changes.
- **Falling back to general knowledge** → abstain and show the closest sources instead.

## Interview angle

Asked as "Design Q&A over our internal wiki," "Build a chat-with-your-PDFs feature," or "How do you stop RAG from hallucinating?"

A strong answer separates ingestion from query, takes parsing and chunking seriously, enforces permissions at retrieval, uses hybrid search plus reranking, requires citations, and evaluates retrieval and generation separately.

Follow-up interviewers like: **"Users say answers are often outdated. How do you debug it?"** Check whether the current document is indexed at all, whether it is retrieved, and whether it loses in ranking to an older version. Then fix the right stage: ingestion lag, missing recency signals, or old versions that should be archived.
