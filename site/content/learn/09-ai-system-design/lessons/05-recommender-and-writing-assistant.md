---
title: "Worked designs: a recommendation engine and an AI writing assistant"
summary: Two contrasting designs, one ranking millions of items in milliseconds and one generating text inside an editor as you type.
minutes: 14
practice: [sd-rec-1, sd-rec-2, sd-write-1, sd-write-2]
flow:
  title: Recommendation request, funnel style
  steps:
    - label: Request
      detail: A user opens the home feed. Load their recent activity and profile from a fast feature store.
    - label: Candidate generation
      detail: Several cheap sources each return hundreds of items, such as embedding nearest neighbours, items similar to recent views, trending and new items.
    - label: Filter
      detail: Remove items already seen or bought, out of stock, blocked, or not allowed in the user's region.
    - label: Rank
      detail: A heavier model scores each remaining candidate for likely engagement or purchase using user, item and context features.
    - label: Re-rank for the page
      detail: Apply business rules and diversity so the feed isn't ten copies of the same thing, and mix in some exploration.
    - label: Serve and log
      detail: Return the list, and log what was shown and what the user did. Impressions without clicks are data too.
    - label: Retrain
      detail: Periodically retrain embeddings and the ranker on fresh interaction logs, then A/B test before rollout.
  loop:
    from: 7
    to: 2
    label: New behaviour updates the models
selfCheck:
  - q: Why do recommendation systems split into candidate generation and ranking?
    options:
      - It's an old convention with no real benefit
      - Scoring every item with a heavy model is too slow, so a cheap stage narrows the set first
      - Ranking models can't handle new items
    answer: 1
    why: The funnel lets you search a huge catalogue cheaply, then spend expensive computation only on a few hundred candidates.
  - q: For inline autocomplete in a writing assistant, what matters most?
    options:
      - Using the largest model available
      - Very low latency, so suggestions appear before the user types past them
      - Long, multi-paragraph suggestions
    answer: 1
    why: A suggestion that arrives late is useless. Inline completion favours small, fast models and short outputs; bigger models suit explicit "rewrite this" commands.
  - q: What is a good online metric for a writing assistant's suggestions?
    options:
      - Number of suggestions shown
      - Acceptance rate, adjusted for how much accepted text is kept afterwards
      - Average tokens generated
    answer: 1
    why: Showing many suggestions is easy. Acceptance plus retention shows whether suggestions actually helped.
---

## Core concepts

These two designs sit at opposite ends of AI system design, which is why interviewers like them.

- A **recommendation engine** is mostly about **ranking at scale**. Huge catalogue, strict latency, learning from behaviour. LLMs are optional helpers here, not the core.
- A **writing assistant** is about **generation in the loop of a human**. Latency is felt keystroke by keystroke, and the user is the final judge of every output.

**Recommendation analogy**: a bookshop assistant doesn't read every book in the shop for you. They grab a stack from a few likely shelves (candidate generation), then pick the best few from the stack for you (ranking).

**Writing assistant analogy**: a good editor sitting next to you. Quick nudges while you type, deeper rewrites when you ask, and never changes your text without you seeing it.

## How it works in real systems

### Design A: recommendation engine

**Requirements.** Catalogue size, number of users, where recommendations appear (home feed, "similar items," email), latency budget for the page, and the business goal (clicks, purchases, watch time, long-term retention).

**Success metrics.** Offline: ranking metrics on held-out interactions (recall@k for candidates, NDCG for the ranker, both measure whether the right items appear near the top). Online: A/B-tested click-through, conversion, and longer-term retention. Watch for metrics that optimise short-term clicks at the cost of trust (clickbait).

**Architecture**: see the funnel in the flow above. Common building blocks:

- *Two-tower model*: one network embeds users, another embeds items, trained so users sit near items they engage with. Item embeddings are precomputed and searched with approximate nearest neighbour (ANN) indexes.
- *Ranker*: a gradient-boosted tree or neural model with rich features (recency, price, user history, context like device and time).
- *Feature store*: the same features served online and used in training, to avoid training/serving skew.

**Where LLMs help.** Generating item descriptions or tags for cold-start items, embedding item text, explaining recommendations ("because you liked..."), or conversational shopping. Running an LLM per item per request is usually far too slow and costly.

**Failure modes.** Cold start (new users and items have no history: use content features, popularity, onboarding questions), feedback loops and popularity bias (the system only learns about what it already shows: add exploration), filter bubbles (add diversity in re-ranking), and data leakage in offline evaluation (train on the past, test on the future).

### Design B: AI writing assistant

**Requirements.** Inline autocomplete, explicit commands ("shorten," "make formal," "fix grammar"), or both? Which editor and platforms? Privacy rules for user text (enterprise customers often require no training on their data and specific data retention)? Languages?

**Architecture.**

1. Editor client captures the cursor context (text before and after), with debouncing so you don't call the model on every keystroke.
2. Gateway applies auth, rate limits, and cancels stale requests when the user keeps typing.
3. Router: **inline completion** goes to a small, fast model with short outputs; **commands** go to a stronger model and stream back.
4. Output shown as a **suggestion or diff**, never applied silently.
5. Telemetry: shown, accepted, edited, rejected.

```ts
let controller: AbortController | null = null;

const requestSuggestion = debounce(async (before: string, after: string) => {
  controller?.abort();                       // drop the outdated request
  controller = new AbortController();
  try {
    const res = await fetch("/api/complete", {
      method: "POST",
      body: JSON.stringify({ before: before.slice(-2000), after: after.slice(0, 500) }),
      signal: controller.signal,
    });
    if (res.ok) showGhostText((await res.json()).suggestion);
  } catch (e) {
    if ((e as Error).name !== "AbortError") throw e;
  }
}, 150);
```

(`debounce` and `showGhostText` are your own helpers; the slice lengths are illustrative.)

**Data and models.** Context is the document itself plus optional style settings. For commands, include the selected text and a short instruction. Personalisation can come from a user's style guide or past accepted edits, with consent.

**Evals.** Offline: a set of passages with reference rewrites, graded for meaning preserved, instruction followed, and fluency (LLM judge calibrated with human ratings). Online: acceptance rate, how much accepted text survives later edits, use of "undo," and latency percentiles.

**Failure modes.** Meaning drift (a "shorten" that changes a number or name: diff the facts and highlight changes), hallucinated facts or citations in generated text, homogenised voice, leaking private text into logs, and suggestions that arrive too late to be useful.

> [!note] Same framework, different weights
> Both designs use the same answer structure. The recommender spends its time on scale, data pipelines and feedback loops. The writing assistant spends it on latency, UX and trust. Say which dimension dominates and why.

## Common mistakes

- **Using an LLM to score every catalogue item** → use a retrieval-then-rank funnel; use LLMs for content understanding and explanations.
- **Judging a recommender only offline** → offline metrics guide you; A/B tests decide.
- **Ignoring feedback loops** → add exploration and diversity, and log impressions, not just clicks.
- **One big model for every writing feature** → route inline completion to small fast models and commands to stronger ones.
- **Applying AI edits silently** → show suggestions and diffs; the user accepts.
- **Counting suggestions shown as success** → measure acceptance and retention of accepted text.

## Interview angle

Recommenders are asked as "Design the home feed for a video or shopping app." Writing assistants as "Design Grammarly-style suggestions" or "Add AI rewrite to our editor."

Strong recommender answers cover the funnel, features, cold start, feedback loops, offline vs online evaluation, and where LLMs fit. Strong writing-assistant answers cover the latency budget, cancellation and debouncing, routing by feature, suggestion UX, privacy, and acceptance-based metrics.

Follow-up interviewers like: **"Your new ranker wins offline but loses the A/B test. Why might that be?"** Offline data comes from what the old system showed (selection bias), the offline metric may not match the business goal, there may be training/serving skew in features, or the new model may increase short-term clicks but hurt satisfaction.
