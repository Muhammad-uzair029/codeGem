---
title: Choosing a model
summary: Large vs small, closed vs open-weight, and a simple process for picking the cheapest model that is good enough.
minutes: 8
practice: [llm-models-1, llm-models-2, llm-models-3]
flow:
  title: Picking a model for a feature
  steps:
    - label: Define the task
      detail: Write down inputs, expected outputs, latency budget, cost budget and data constraints.
    - label: Build a small eval set
      detail: Collect 30 to 100 real examples with known good answers.
    - label: Try the strongest model
      detail: Confirm the task is solvable at all before optimising.
    - label: Step down in size
      detail: Run the same eval on smaller or cheaper models and compare quality, latency and cost.
    - label: Pick and route
      detail: Choose the cheapest model that passes, or route easy requests to a small model and hard ones to a large one.
selfCheck:
  - q: What does "open-weight" mean?
    options:
      - The training data and code are all public
      - The model's weights can be downloaded and run on your own hardware
      - The model is free to call through any API
    answer: 1
    why: Open-weight means you can download the weights. The licence may still restrict use, and the training data is often not public.
  - q: A high-volume feature classifies support tickets into 8 categories. Where should you start testing?
    options:
      - Only the largest model available
      - Small, fast models, after confirming the task works with a strong one
      - Fine-tuning a model from scratch
    answer: 1
    why: Simple classification at volume is a classic small-model job. Prove it works, then go as small as quality allows.
  - q: Which is a real reason to pick an open-weight model you host yourself?
    options:
      - It's always more accurate
      - Data must never leave your infrastructure
      - It requires no operations work
    answer: 1
    why: Self-hosting gives you control over data and deployment, at the cost of running GPUs and serving infrastructure yourself.
---

## Core concepts

There is no "best model", only the best model **for a task, a budget and a latency target**. Picking one is like hiring: you don't hire a principal engineer to rename variables, and you don't hand a junior the database migration.

**Large vs small**

- **Large models**: better at multi-step reasoning, ambiguous instructions, long documents and hard code. Slower and more expensive per token.
- **Small models**: fast and cheap, often good enough for classification, extraction, short summaries, routing and reformatting. Weaker when the task needs judgement or many steps.
- **Reasoning models** (models that "think" before answering): better on maths, planning and tricky logic, but they spend extra tokens and time thinking. Overkill for simple lookups.

**Closed vs open-weight**

- **Closed (hosted API)**: you call a provider's API. No infrastructure to run, usually the strongest models, fast access to new versions. Trade-offs: data leaves your systems (check the provider's retention and training terms), and you depend on their pricing, rate limits and deprecation schedule.
- **Open-weight**: you download the weights and run them yourself or through a host. You get control over data, deployment, and fine-tuning. Trade-offs: you run GPUs, scaling and upgrades, and the licence may still limit commercial use. "Open-weight" is not the same as "open source": the training data and code often aren't released.

> [!tip] Model names go stale fast
> Today's top model will be replaced within months. Design your code so the model ID is configuration, and keep an eval set so switching is a measured decision, not a gamble.

## How it works in real systems

Mature teams treat the model as a swappable dependency and often use more than one.

```ts
// Model choice lives in config, so it can change without a deploy.
type Tier = "small" | "large";

const MODELS: Record<Tier, string> = {
  small: process.env.LLM_SMALL_MODEL!,
  large: process.env.LLM_LARGE_MODEL!,
};

// Route by task difficulty: cheap model first, escalate when needed.
export function pickModel(task: { kind: string; inputTokens: number }): string {
  const simple = task.kind === "classify" || task.kind === "extract";
  // Long inputs go to the stronger model even for simple tasks.
  if (simple && task.inputTokens < 20_000) return MODELS.small;
  return MODELS.large;
}
```

Common patterns:

- **Routing**: a cheap rule or classifier sends easy requests to a small model and hard ones to a large model.
- **Cascade**: try the small model first; if validation fails or confidence is low, retry with the large model.
- **Distillation / fine-tuning**: once a large model works, use its outputs to fine-tune a small model for that one narrow task.

What to compare in your eval, beyond accuracy: latency (time to first token and total), cost per successful answer (include retries), consistency of output format, context window size, rate limits, and data/compliance requirements.

## Common mistakes

- Picking the model from a public leaderboard → test on your own examples; leaderboards measure someone else's task.
- Using the largest model everywhere "to be safe" → measure; small models often pass for simple tasks at a fraction of the cost and latency.
- Hard-coding a model ID in many places → keep it in config behind one function so you can swap and A/B test.
- Choosing self-hosting only to save money → include GPU, ops and engineering time; at low volume, hosted APIs are usually cheaper.
- Ignoring deprecations → providers retire models; keep an eval set ready to validate the replacement.

## Interview angle

Typical question: "How would you choose a model for feature X?" or "When would you self-host an open-weight model?"

A strong answer is a process, not a brand name: define requirements (quality, latency, cost, privacy), build a small eval set, test from strong to small, pick the cheapest model that passes, and consider routing. For self-hosting, cite data residency, fine-tuning control, predictable cost at high volume, or offline use, and be honest about the ops burden.

Follow-up interviewers like: *"Your provider deprecates the model you use in 60 days. What do you do?"* Run your eval set on candidate replacements, compare quality, cost and latency, adjust prompts where needed, and roll out behind a flag.
