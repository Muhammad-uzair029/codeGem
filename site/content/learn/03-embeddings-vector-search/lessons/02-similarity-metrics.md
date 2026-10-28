---
title: Cosine similarity, dot product, and distance metrics
summary: Learn what cosine, dot product, and Euclidean distance actually measure, when they give the same ranking, and how to pick the right one for your model.
minutes: 8
practice: [vec-metric-1, vec-metric-2, vec-metric-3]
selfCheck:
  - q: For vectors normalized to length 1, which statement is true?
    options:
      - Cosine similarity and dot product give the same value
      - Euclidean distance becomes meaningless
      - Dot product is always zero
    answer: 0
    why: Cosine similarity is the dot product divided by both lengths. If both lengths are 1, the division does nothing.
  - q: In pgvector, what does the <=> operator return?
    options:
      - Cosine similarity (higher is better)
      - Cosine distance, which is 1 minus cosine similarity (lower is better)
      - Euclidean distance
    answer: 1
    why: pgvector operators return distances so that ORDER BY ... ASC puts the best match first. Similarity is 1 - (a <=> b).
  - q: When does the dot product rank results differently from cosine similarity?
    options:
      - Never
      - When vectors have different lengths (are not normalized)
      - Only when vectors have more than 1,000 dimensions
    answer: 1
    why: Dot product grows with vector length as well as direction. Cosine ignores length. If lengths differ, longer vectors get a boost under dot product.
---

## Core concepts

Once text is a vector, "how similar are these two?" becomes "how close are these two points?" There are three common ways to measure that.

**Cosine similarity**: the angle between two vectors, ignoring their length.

- Range from -1 to 1. 1 means the same direction, 0 means unrelated (perpendicular), -1 means opposite.
- Analogy: two people pointing. Cosine asks "are they pointing the same way?", not "how long are their arms?"
- Formula: `cos(a, b) = (a · b) / (|a| × |b|)`

**Dot product (inner product)**: multiply matching numbers and add them up.

- Depends on direction *and* length. Longer vectors produce bigger scores.
- Cheapest to compute: no square roots, no division.

**Euclidean (L2) distance**: straight-line distance between the two points.

- 0 means identical. Bigger means farther apart.
- Sensitive to length as well as direction.

There is also **L1 (Manhattan) distance**, the sum of absolute differences, which is used less often for text embeddings.

### The shortcut that matters in practice

If every vector is **normalized** (scaled to length 1), all three give the **same ranking**:

- Cosine similarity = dot product.
- Squared Euclidean distance = `2 - 2 × cosine`, so smaller distance always means higher cosine.

Many embedding models already output normalized vectors, and many libraries can normalize for you. When that's true, pick the dot product for speed and you lose nothing.

### Similarity vs distance

A **similarity** is higher-is-better. A **distance** is lower-is-better. Databases usually work in distances so `ORDER BY distance ASC LIMIT k` gives the top k. Mixing the two up is a classic bug that returns the *worst* matches first.

## How it works in real systems

The three metrics in a few lines of TypeScript:

```ts
const dot = (a: number[], b: number[]) =>
  a.reduce((sum, ai, i) => sum + ai * b[i], 0);

const norm = (a: number[]) => Math.sqrt(dot(a, a));

const cosine = (a: number[], b: number[]) => dot(a, b) / (norm(a) * norm(b));

const euclidean = (a: number[], b: number[]) =>
  Math.sqrt(a.reduce((sum, ai, i) => sum + (ai - b[i]) ** 2, 0));

const normalize = (a: number[]) => {
  const n = norm(a);
  return a.map((x) => x / n);
};
```

In pgvector each metric has an operator, and each returns a **distance**:

| Operator | Meaning | Best match | Index operator class |
| --- | --- | --- | --- |
| `<->` | Euclidean (L2) distance | smallest | `vector_l2_ops` |
| `<#>` | **negative** inner product | smallest (most negative) | `vector_ip_ops` |
| `<=>` | cosine distance (1 − cosine similarity) | smallest | `vector_cosine_ops` |

```sql
-- cosine similarity as a readable score
SELECT id, content, 1 - (embedding <=> $1) AS cosine_similarity
FROM documents
ORDER BY embedding <=> $1
LIMIT 5;

-- inner product: pgvector returns it negated, so flip the sign to display it
SELECT id, (embedding <#> $1) * -1 AS inner_product
FROM documents
ORDER BY embedding <#> $1
LIMIT 5;
```

How to choose:

1. **Check the model's documentation.** Use the metric it was trained for. That is the most important rule.
2. If the vectors are normalized, cosine, dot product, and L2 give the same order. Choose the dot product for speed, or cosine for readability.
3. If vectors are *not* normalized and length carries meaning (some recommendation models learn "popularity" into length), use the dot product on purpose.
4. Use the same metric for the index and the query. In pgvector, an index built with `vector_cosine_ops` only speeds up queries that order by `<=>`.

## Common mistakes

- Sorting a distance in descending order (or a similarity ascending) → you get the worst matches. Remember: pgvector operators are distances, sort ascending.
- Forgetting that `<#>` is the *negative* inner product → multiply by -1 when you show it as a score.
- Building the index with one operator class and querying with another operator → the planner can't use the index and quietly falls back to a full scan. Match them.
- Using raw dot product on unnormalized vectors from a model meant for cosine → long documents can win just because their vectors are longer. Normalize, or use cosine.
- Picking a fixed "relevance threshold" like 0.8 from a blog post → score ranges differ by model. Measure on labelled examples from your own data.

## Interview angle

Common phrasings: "Cosine vs dot product vs Euclidean, which and why?" or "Why does my vector DB ask for a metric when I create the index?" A strong answer:

- Defines each in one line: angle, angle plus length, straight-line distance.
- States the normalization shortcut: for unit vectors all three produce the same ranking, and dot product is cheapest.
- Says the right choice is the metric the embedding model was trained with.
- Notes the metric is baked into the index, so changing it means rebuilding.

Follow-up interviewers like: *"Why do databases return distances instead of similarities?"* Because ANN indexes and `ORDER BY ... LIMIT` are built around "smallest first". A distance makes the best match the minimum, which is also why pgvector negates the inner product.
