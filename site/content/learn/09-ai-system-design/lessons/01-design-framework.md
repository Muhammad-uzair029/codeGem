---
title: A framework for AI system design answers
summary: A step-by-step structure that keeps your answer calm, complete and focused on what interviewers actually score.
minutes: 10
practice: [sd-framework-1, sd-framework-2]
flow:
  title: The answer structure, step by step
  steps:
    - label: Clarify
      detail: Ask who the users are, what job the product does for them, how many requests to expect, and what must never go wrong.
    - label: Define success
      detail: Agree on a quality metric, a latency budget, a cost ceiling and the risk you can tolerate. These numbers drive every later choice.
    - label: Baseline
      detail: Describe the simplest version that could work, often a plain search, a rule, or one prompt. It gives you something to beat.
    - label: Architecture
      detail: Draw the components and the data flow from request to response, including where the model sits and what wraps it.
    - label: Data and models
      detail: Name the data sources, how they are cleaned and kept fresh, and which kind of model fits each step (small, large, embedding, classifier).
    - label: Evals
      detail: Explain the offline test set you would build and the online signals you would watch after launch.
    - label: Failure modes
      detail: List how it breaks (wrong answers, abuse, outages, bias) and what the system does in each case.
    - label: Scale and iterate
      detail: Discuss cost, latency and growth, then what you would improve first with real usage data.
  loop:
    from: 8
    to: 6
    label: Production data feeds new eval cases
selfCheck:
  - q: What should you do in the first few minutes of an AI system design interview?
    options:
      - Pick the model you would use
      - Ask clarifying questions about users, scale and constraints
      - Draw the vector database schema
    answer: 1
    why: Without requirements you can't justify any choice. Interviewers look for whether you scope the problem before you build.
  - q: Why propose a non-AI or single-prompt baseline?
    options:
      - Interviewers dislike LLMs
      - It gives a cheap reference point and shows the AI parts must earn their cost
      - Baselines are always good enough to ship
    answer: 1
    why: A baseline makes the value of each added component measurable and shows you are not adding complexity for its own sake.
  - q: Which part of an AI design answer do candidates most often skip?
    options:
      - The architecture diagram
      - Evals and failure modes
      - Naming a database
    answer: 1
    why: Most candidates draw boxes well. Fewer explain how they would know the system works and what happens when the model is wrong.
---

## Core concepts

A system design question about an AI product sounds open-ended: "Design a chatbot for our support team." The trap is to jump straight to "I'd use a large model with RAG" and start drawing boxes. A better answer follows a fixed route, the way a pilot runs a checklist before take-off. The checklist doesn't make you less creative. It makes sure you don't forget the landing gear.

The eight steps in the diagram above are that checklist:

1. **Clarify.** Who uses it, for what, how often, and what is the worst thing it could do?
2. **Define success.** A quality bar (for example "resolves a ticket without a human"), a latency budget, a cost ceiling.
3. **Baseline.** The simplest thing that might work. Often a keyword search or a single prompt.
4. **Architecture.** Components and data flow.
5. **Data and models.** Where knowledge comes from, and which model fits each step.
6. **Evals.** How you measure quality before and after launch.
7. **Failure modes.** What breaks, and what the system does then.
8. **Scale and iterate.** Cost, latency, growth, and what you would improve next.

What makes AI design different from classic backend design:

- **Outputs are probabilistic.** The same input can produce different outputs, and some will be wrong. So you design for "wrong sometimes", not "correct always".
- **Quality is a metric, not a test that passes.** You need an evaluation set (a fixed collection of inputs with expected outcomes) to know if a change helped.
- **Cost scales with tokens**, not just requests. A long prompt sent a million times is a real budget line.
- **Latency is dominated by the model.** Generation time often dwarfs database time, so streaming and model size matter.

> [!tip] Say the structure out loud
> Open with "I'll clarify requirements, set success metrics, sketch a baseline, then the full design, then evals and failure modes." Interviewers relax when they can see where you're going, and it gives them a natural place to redirect you.

## How it works in real systems

Real AI products almost always share the same skeleton around the model. Learn this shape once and reuse it in every answer:

- **Gateway**: auth, rate limits, request logging.
- **Orchestrator**: your application code. It builds the prompt, calls tools or retrieval, and decides what to do with the result.
- **Context sources**: retrieval over documents, user data, business APIs.
- **Model calls**: one or several, sometimes of different sizes.
- **Guardrails**: input checks (abuse, prompt injection) and output checks (format, policy, grounding).
- **Fallbacks**: a human, a simpler model, or a safe "I don't know".
- **Telemetry**: traces of every step, user feedback, cost per request.

Writing the success criteria down as a small config is a habit worth showing. It turns vague goals into numbers you can check in CI and in dashboards:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class SuccessCriteria:
    min_eval_pass_rate: float   # share of eval cases graded "correct"
    p95_latency_ms: int         # 95th percentile end-to-end
    max_cost_per_request: float # in your currency, from token counts
    max_unsafe_rate: float      # share of outputs flagged by safety checks

def release_gate(results: dict, c: SuccessCriteria) -> list[str]:
    problems = []
    if results["pass_rate"] < c.min_eval_pass_rate:
        problems.append("quality below bar")
    if results["p95_latency_ms"] > c.p95_latency_ms:
        problems.append("too slow")
    if results["avg_cost"] > c.max_cost_per_request:
        problems.append("too expensive")
    if results["unsafe_rate"] > c.max_unsafe_rate:
        problems.append("unsafe outputs")
    return problems  # empty list means ship
```

The actual thresholds come from the business conversation in step 2. In an interview, propose reasonable ones and say they are assumptions to confirm.

**Time budget for a 45-minute interview** (a rough guide, not a rule): about 5 minutes clarifying and setting metrics, 15 on architecture, data and models, 10 on evals and failure modes, and the rest on trade-offs and the interviewer's follow-ups.

## Common mistakes

- **Naming a model first** → start from the user's job and constraints; the model is a component you pick to meet them.
- **No baseline** → state the simple version and explain what the AI parts add over it.
- **"We'll fine-tune"** as the first move → try prompting and retrieval first; fine-tuning is costly to build and maintain and only pays off for specific gaps.
- **Treating evals as an afterthought** → describe the eval set as early as the architecture; it's how you know anything works.
- **Ignoring the unhappy path** → for every component, say what happens when it is slow, down, or wrong.
- **Over-engineering** → five agents talking to each other is rarely the right answer for a v1. Show you can ship something simple and grow it.

## Interview angle

The question is usually phrased as a product: "Design X for company Y." Sometimes it is narrower: "How would you add AI search to our docs?"

A strong answer:

- Spends the first minutes on requirements and states assumptions out loud.
- Defines measurable success (quality, latency, cost, safety).
- Walks a clear request path through the architecture.
- Has a concrete eval plan and a list of failure modes with mitigations.
- Talks about trade-offs with reasons, not buzzwords.

A follow-up interviewers like: **"You have half the budget. What changes?"** Good answers mention a smaller or routed model, caching, shorter prompts, and cutting features that don't move the main metric, while saying how you'd check quality didn't drop.
