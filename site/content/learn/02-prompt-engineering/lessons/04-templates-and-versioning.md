---
title: Prompt templates and versioning in production
summary: Treat prompts like code - templated, versioned, reviewed, tested against evals and rolled out safely.
minutes: 8
practice: [prompt-version-1, prompt-version-2, prompt-version-3]
flow:
  title: Shipping a prompt change
  steps:
    - label: Edit the template
      detail: Change the prompt file in the repo and bump its version.
    - label: Run evals
      detail: Run the eval set against the new version and compare scores with the current one.
    - label: Review
      detail: A teammate reviews the diff and the eval results in a pull request.
    - label: Gradual rollout
      detail: Ship behind a flag to a small share of traffic and compare metrics.
    - label: Monitor and promote
      detail: Watch quality, cost and latency by prompt version, then promote to 100% or roll back.
  loop:
    from: 2
    to: 1
    label: Scores dropped? Revise
selfCheck:
  - q: Why log the prompt version with every LLM call?
    options:
      - It's required by the API
      - So you can tie quality, cost and bugs to the exact prompt that produced them
      - It makes responses faster
    answer: 1
    why: Without the version in logs, you can't tell whether a regression came from a prompt change, a model change or new inputs.
  - q: What is the main check before shipping a prompt change?
    options:
      - It reads well to the author
      - It passes the eval set at least as well as the current version
      - It is shorter than before
    answer: 1
    why: Prompt changes that fix one case often break others. An eval set catches that before users do.
  - q: Where should user input go in a template?
    options:
      - Concatenated directly into the instructions
      - In a clearly marked variable slot, ideally wrapped in tags, separate from instructions
    answer: 1
    why: Separating untrusted input from instructions keeps templates predictable and reduces prompt injection risk.
---

## Core concepts

In a prototype, the prompt is a string in a function. In production, the prompt **is** product logic: one changed sentence can change every answer your feature gives. So treat it like code.

- **Template**: a prompt with named slots that get filled at runtime, e.g. `{{customer_name}}`, `{{document}}`. Instructions stay fixed; only the data changes.
- **Version**: an identifier for each change to a template (`ticket-triage@v7`). Every call records which version it used.
- **Eval set**: a collection of real inputs with expected outputs or grading rules. It is your prompt's test suite.
- **Rollout**: shipping a new version gradually, with the ability to roll back fast.

Analogy: a database migration. You wouldn't edit production tables by hand without a script, a review and a rollback plan. Prompts deserve the same discipline.

A prompt version is really the combination of **template + model + sampling settings**. Changing the model with the same template is still a behaviour change and needs the same evals.

## How it works in real systems

Keep templates in the repo next to the code that uses them, so changes go through pull requests:

```ts
// prompts/ticket-triage.ts
export const ticketTriage = {
  id: "ticket-triage",
  version: 7,
  model: process.env.LLM_SMALL_MODEL!,
  temperature: 0,
  system: `You classify support tickets for Acme Invoicing.
Reply with one of: billing, bug, feature_request, other.`,
  user: (v: { subject: string; body: string }) =>
    `<ticket>\n<subject>${v.subject}</subject>\n<body>${v.body}</body>\n</ticket>`,
} as const;

// usage
const p = ticketTriage;
const reply = await llm({ model: p.model, temperature: p.temperature,
                          system: p.system, user: p.user(ticket) });
logger.info("llm_call", { prompt: `${p.id}@v${p.version}`, model: p.model,
                          usage: reply.usage });
```

The essentials:

- **Version in logs and traces** for every call, alongside model, token usage and latency.
- **Evals in CI**: a prompt change runs the eval set; a drop below the agreed threshold blocks the merge.
- **Gradual rollout**: route a slice of traffic to the new version via a feature flag; compare metrics before promoting.
- **Rollback**: keep the previous version deployable instantly.

Some teams store prompts in a prompt-management tool or config service so non-engineers can edit them without a deploy. That's fine, as long as versioning, evals and rollback still apply.

## Common mistakes

- Prompts scattered as inline strings across the codebase → centralise them as named, versioned templates.
- Editing a prompt in production "just to test" → change it through review and evals like any code.
- Fixing one bad output and shipping → add that case to the eval set and run the whole set; fixes often break other cases.
- Not logging the prompt version → you can't explain regressions; log template version, model and settings on each call.
- Building templates by string concatenation of user input into instructions → use clear slots and tags to separate data.

## Interview angle

Typical question: "How do you manage prompts in production?" or "A prompt change made answers worse last week. How would you have caught it?"

A strong answer covers templates with variable slots, version IDs logged per call, prompts reviewed in pull requests, an eval set run in CI with thresholds, gradual rollout behind flags, and fast rollback. It notes that a model change is also a prompt-behaviour change.

Follow-up interviewers like: *"How do you build the eval set in the first place?"* Start with 30 to 100 real production inputs covering common and edge cases, write expected outputs or grading rules, and keep adding every bug you find.
