---
title: Why LLM apps need evals
summary: LLM outputs vary and are rarely simply right or wrong, so you measure quality across many examples instead of asserting one exact answer.
minutes: 8
practice: [eval-why-1, eval-why-2, eval-why-3]
flow:
  title: The eval-driven development loop
  steps:
    - label: Define "good"
      detail: Write down what a good answer looks like for your use case (correct, grounded, right tone, right format).
    - label: Collect examples
      detail: Gather realistic inputs, ideally from real usage, with expected outputs or grading criteria.
    - label: Run the app
      detail: Run the current prompt, model and code over every example.
    - label: Score
      detail: Grade outputs with code checks, an LLM judge, or human review, and compute aggregate scores.
    - label: Analyze failures
      detail: Read the failing cases, group them into failure types, and pick the biggest one.
    - label: Change one thing
      detail: Edit the prompt, retrieval, model or tools to target that failure.
  loop:
    from: 6
    to: 3
    label: Re-run and compare
selfCheck:
  - q: Why can't a classic unit test like assertEqual(output, expected) cover most LLM features?
    options:
      - LLMs can't be called from test frameworks
      - Many different outputs can be correct, and outputs can vary run to run
      - Unit tests are too slow
    answer: 1
    why: There are many valid phrasings of a good answer, and sampling adds variation. You need graders that judge quality, not exact strings.
  - q: What is an eval, in one line?
    options:
      - A benchmark leaderboard score for a model
      - A repeatable measurement of your app's output quality over a set of examples
      - A load test
    answer: 1
    why: An eval runs your system over a dataset and scores the outputs, so you can compare versions.
---

## Core concepts

In normal software, a function given the same input returns the same output, and you can say exactly what's correct. LLM features break both assumptions:

- **Non-deterministic**: the same prompt can produce different outputs (sampling, provider changes).
- **Fuzzy correctness**: "Summarize this ticket" has thousands of acceptable answers and some subtly bad ones.
- **Changes ripple**: tweak a prompt to fix one case and three others quietly get worse.

An **eval** (evaluation) is a repeatable measurement: run your app over a set of examples and score the outputs. Instead of "this test passed", you get "92% of answers were grounded, up from 85%".

Analogy: unit tests are like checking a calculator: 2 + 2 must be 4. Evals are like grading essays: you need a rubric, many samples, and you care about the average and the worst cases.

**Evals vs unit tests**

| | Unit tests | Evals |
|---|---|---|
| Output | Deterministic | Varies |
| Check | Exact assertion | Score or pass rate against criteria |
| Result | Pass / fail | Metrics, tracked over time |
| Size | One case per behavior | Dozens to thousands of examples |
| Cost | Free, milliseconds | Model calls, minutes, money |

You still need unit tests for the deterministic parts (parsing, tool code, prompt assembly). Evals cover the model's behavior.

**Model benchmarks are not your evals.** A model that scores well on a public benchmark may still do badly on *your* documents, users, and format rules. Only an eval built from your own use case tells you that.

## How it works in real systems

The simplest useful eval is a script: a list of cases, your app, and some graders. Start with **code-based checks** wherever possible; they're cheap and reliable.

```python
import json

cases = [
    {"input": "Refund policy for damaged items?", "must_include": ["30 days"], "max_words": 120},
    {"input": "Cancel my subscription", "must_include": ["Settings"], "max_words": 120},
]

def grade(case, output: str) -> dict:
    return {
        "has_facts": all(s.lower() in output.lower() for s in case["must_include"]),
        "short_enough": len(output.split()) <= case["max_words"],
        "no_apology_spam": output.lower().count("sorry") <= 1,
    }

results = [grade(c, my_app(c["input"])) for c in cases]
for metric in results[0]:
    rate = sum(r[metric] for r in results) / len(results)
    print(f"{metric}: {rate:.0%}")
```

Kinds of graders, from cheapest to most expensive:

1. **Code checks**: valid JSON, matches a schema, contains a required fact, length, no banned words, correct tool called.
2. **Reference comparison**: compare to an expected answer (exact match for classification, similarity or judge for free text).
3. **LLM-as-judge**: another model scores the output against a rubric (next lesson).
4. **Human review**: the gold standard, slow and expensive, used to calibrate the others.

**Offline vs online evals.** Offline evals run on a fixed dataset before you ship. Online evals score real production traffic (sampled) after you ship, and catch problems your dataset didn't anticipate. You need both.

> [!tip] Start small, start now
> Twenty real examples with a simple grader beat a perfect framework you never build. Grow the dataset from production failures.

## Common mistakes

- "Vibe checking" a few prompts by hand before shipping → write the cases down and re-run them every change.
- Choosing a model based on public benchmarks alone → evaluate on your own data.
- Only measuring the average → also look at the worst failures; one harmful answer can matter more than the mean.
- Using an LLM judge for things code can check → use code for format, length, schema, and exact facts.
- Replacing unit tests with evals → keep unit tests for deterministic code; evals are for model behavior.
- Running each case once when outputs vary → run important cases a few times or at low temperature, and watch variance.

## Interview angle

Asked as: *"How do you test an LLM application?"* A strong answer separates layers: unit tests for deterministic code, offline evals on a curated dataset with code checks, LLM judges and human review, and online monitoring of production. Emphasize that you define success criteria first, look at real failures, and track metrics across versions.

Follow-up: *"How many examples do you need?"* Enough to cover your main use cases and known failure types; teams often start with a few dozen and grow to hundreds. Small datasets can't detect small differences, so treat a 1–2 point change on 50 examples as noise.
