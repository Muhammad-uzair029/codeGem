---
title: "Chunking strategies: fixed, recursive, semantic"
summary: Learn how to split documents into retrievable pieces, compare fixed-size, recursive, and semantic chunking, and choose sizes and overlap with evidence instead of guesses.
minutes: 10
practice: [rag-chunk-1, rag-chunk-2, rag-chunk-3]
flow:
  title: Recursive chunking
  steps:
    - label: Try the biggest separator
      detail: Split the text on the coarsest boundary first, such as blank lines between paragraphs (or headings in Markdown).
    - label: Check each piece
      detail: Any piece at or under the size limit is kept as it is.
    - label: Split oversized pieces finer
      detail: Pieces still too big are split again with the next separator, such as single newlines, then sentences, then spaces.
    - label: Merge small neighbours
      detail: Adjacent small pieces are joined back together until they approach the size limit, with optional overlap between chunks.
    - label: Attach context
      detail: Add the document title, section heading, and source metadata to each chunk before embedding.
  loop:
    from: 3
    to: 2
    label: Repeat until every piece fits
selfCheck:
  - q: What is the main weakness of fixed-size chunking?
    options:
      - It is slow to compute
      - It can cut sentences and ideas in half at arbitrary points
      - It produces chunks of different sizes
    answer: 1
    why: Fixed-size chunking counts characters or tokens and cuts, regardless of meaning. Overlap softens it but doesn't fix it.
  - q: Why add the section heading to each chunk?
    options:
      - It makes chunks shorter
      - A chunk like "It takes 3 days" is meaningless without knowing which section it came from
      - Embedding models require headings
    answer: 1
    why: Chunks are retrieved alone. Adding the title and heading restores the context the chunk lost when it was cut out of the document.
---

## Core concepts

**Chunking** means splitting documents into smaller pieces before embedding them. You need it because:

- Embedding models have an input limit, and text past it is ignored.
- One vector for a 40-page document blurs every topic together, so it matches nothing well.
- You want to put only the relevant paragraphs into the prompt, not whole documents.

The tension: **small chunks are precise but lose context; big chunks keep context but dilute the match and waste prompt space.**

> [!note] Analogy
> Cutting a newspaper into clippings for a scrapbook. Cut single sentences and you lose what they refer to. Keep whole pages and you can't find anything. Good clippings follow the article's own structure.

### The three main strategies

**1. Fixed-size**

- Cut every N tokens (or characters), usually with some **overlap** (for example the last 10–20% of one chunk repeated at the start of the next) so ideas at boundaries appear whole in at least one chunk.
- Pros: trivial, predictable sizes. Cons: ignores structure and cuts mid-sentence.

**2. Recursive (structure-aware)**

- Try to split on big natural boundaries first (sections, paragraphs), and only fall back to smaller ones (sentences, then words) for pieces that are still too big. See the flow above.
- Pros: respects the document's shape, cheap, and a strong default. This is what LangChain's `RecursiveCharacterTextSplitter` does.
- Variant: **document-aware splitting** that uses Markdown headings, HTML tags, or code syntax (functions, classes) as boundaries.

**3. Semantic**

- Embed each sentence, then start a new chunk wherever the meaning shifts, i.e. where similarity between neighbouring sentences drops sharply.
- Pros: chunks follow topics, not character counts. Cons: costs an embedding call per sentence at ingest, adds thresholds to tune, and doesn't always beat recursive chunking in evaluations. Use it when your evaluation shows it helps.

### Size and overlap

There is no universal best size. A few hundred tokens per chunk with modest overlap is a common starting point, but the right answer depends on your documents and questions. FAQ answers like small chunks; legal clauses or procedures need bigger ones. **Pick 2–3 candidates and measure retrieval quality on real questions.**

## How it works in real systems

A minimal recursive splitter, to show the idea (in production you'd likely use a library and count tokens, not characters):

```python
SEPARATORS = ["\n\n", "\n", ". ", " "]

def split(text: str, max_chars: int = 1200, seps=SEPARATORS) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    sep, rest = seps[0], seps[1:]
    parts = text.split(sep) if sep in text else [text]
    chunks, current = [], ""
    for part in parts:
        candidate = f"{current}{sep}{part}" if current else part
        if len(candidate) <= max_chars:
            current = candidate                    # keep merging small pieces
            continue
        if current:
            chunks.append(current)
        if len(part) > max_chars and rest:
            chunks.extend(split(part, max_chars, rest))   # go finer
            current = ""
        else:
            current = part
    if current:
        chunks.append(current)
    return chunks
```

Techniques that matter as much as the splitter:

- **Contextual headers.** Prepend `"Doc: Refund policy > Section: International orders"` to each chunk before embedding. Cheap and often a big win.
- **Keep tables and code blocks whole.** Splitting a table row away from its header row makes both useless.
- **Small-to-big retrieval (parent document retrieval).** Embed small chunks for precise matching, but return the larger parent section to the LLM for context.
- **Store chunk metadata:** document ID, position, heading path, and source URL, for citations, deletes, and fetching neighbouring chunks.

## Common mistakes

- Picking a chunk size from a tutorial and never testing it → compare a few sizes on a labelled question set, measuring recall@k.
- Measuring size in characters when the limit is in tokens → count tokens with the embedding model's tokenizer.
- Losing structure during PDF or HTML extraction → fix extraction first. No chunking strategy rescues garbled text.
- Splitting tables, lists, or code mid-way → treat them as atomic blocks, or repeat the header row in each piece.
- Chunks with no context ("as mentioned above...") → prepend title and heading, or use small-to-big retrieval.
- Assuming semantic chunking is automatically better → it costs more at ingest; adopt it only if your evaluation shows gains.

## Interview angle

Asked as "How would you chunk these documents?" or "Fixed vs semantic chunking?" A strong answer:

- Explains the precision vs context trade-off.
- Describes fixed, recursive, and semantic chunking and when each fits.
- Mentions overlap, token-based sizing, contextual headers, and keeping tables and code intact.
- Says chunk size is a hyperparameter chosen by evaluation, not by intuition.

Follow-up interviewers like: *"Answers about step 7 of a long procedure keep missing steps 5 and 6. What would you change?"* Strong answer: the procedure is split across chunks; use structure-aware splitting that keeps the procedure together, small-to-big retrieval that returns the whole section, or fetch neighbouring chunks of the best hit.
