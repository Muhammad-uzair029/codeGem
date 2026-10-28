# Learn + Interview prep content format

All learning and practice content lives here as plain files. Pages are
generated from them at build time, so editing content never means editing
page code. Run `node scripts/validate-content.mjs` (from `site/`) after any
change; the build runs it too.

```
content/
├── learn/
│   └── 01-llm-foundations/
│       ├── module.yaml
│       └── lessons/
│           ├── 01-how-llms-work.md
│           └── 02-context-windows.md
└── practice/
    └── 01-llm-foundations.yaml
```

Folder and file names: `NN-kebab-slug`. The number sets the order.

## `module.yaml`

```yaml
title: LLM foundations
summary: One or two plain sentences on what you'll be able to do after this module.
icon: brain        # one of: brain, prompt, vector, rag, agent, eval, server, shield, design, team
level: beginner    # beginner | intermediate | advanced
```

## Lesson (`lessons/NN-slug.md`)

YAML frontmatter, then a markdown body.

```yaml
---
title: How LLMs work (without the math)
summary: One sentence, shown on cards.
minutes: 8                     # honest reading time
practice: [llm-tokens-1, llm-tokens-2]   # ids from this module's practice file
flow:                          # OPTIONAL — rendered as an animated, clickable diagram
  title: From text to next token
  steps:
    - label: Tokenize
      detail: Text is split into tokens (sub-word pieces). ~4 chars per token in English.
    - label: Embed
      detail: Each token becomes a vector of numbers.
  loop:                        # OPTIONAL — draws a looping arrow back
    from: 4                    # 1-based step index
    to: 1
    label: Repeat for every new token
selfCheck:                     # 2–3 quick multiple-choice checks shown at the end
  - q: Why does a longer prompt cost more?
    options: [Billing is per request, Billing is per token, Longer prompts use a bigger model]
    answer: 1                  # 0-based index into options
    why: Providers bill input and output tokens; more text means more tokens.
---
```

Body sections, always in this order, exactly these `##` headings:

1. `## Core concepts` — the idea in plain language. Short paragraphs, bullets, an analogy where it helps.
2. `## How it works in real systems` — concrete, production-flavoured. Code snippets in ```ts and/or ```python fences (short: ≤ 25 lines each, runnable-looking, no fake APIs).
3. `## Common mistakes` — bullet list; each bullet = mistake → what to do instead.
4. `## Interview angle` — how this is usually asked, what a strong answer covers, one follow-up interviewers like.

Optional callouts anywhere in the body:

```
> [!tip] Short title
> Text.
```
Kinds: `tip`, `warning`, `note`.

## Practice file (`practice/NN-slug.yaml`)

```yaml
module: 01-llm-foundations
questions:
  - id: llm-tokens-1          # unique across ALL modules; prefix with a module short-name
    lesson: 01-how-llms-work  # lesson file slug (without .md)
    type: mcq                 # mcq | open | design
    level: junior             # junior | mid | senior
    question: What is a token?
    options: [A word, A sub-word piece of text, A character, A sentence]
    answer: 1
    explanation: Why the answer is right and why the tempting wrong one is wrong.
  - id: llm-tokens-2
    lesson: 01-how-llms-work
    type: open                # free-text answer, self-graded
    level: mid
    question: A user says the model "forgot" the start of a long chat. Explain why and how you'd fix it.
    keyPoints:                # 3–6 points a strong answer hits; user ticks what they covered
      - Context window is finite; old turns get truncated
      - Summarize or compress older turns
      - Retrieve relevant history instead of sending all of it
    modelAnswer: |
      A concise answer an interviewer would be happy with (markdown allowed).
    followUps:
      - How would you decide what to keep?
```

`design` questions use the same fields as `open` (keyPoints + modelAnswer) and
are for system-design prompts; their modelAnswer may be longer and structured
with headings.

## Writing rules

- Plain language first, jargon second (define it the first time).
- Accurate and current. No invented APIs, flags, or numbers. Don't quote
  prices or model names that date quickly; describe the trade-off instead.
- Vendor-neutral where possible; name tools when the lesson is about them.
- Each module: 4–6 lessons, 12–18 practice questions (mix: ~50% mcq,
  ~35% open, ~15% design; at least 3 senior-level), every lesson linked
  to ≥ 2 questions.
