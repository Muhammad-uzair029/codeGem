---
title: Running AI projects from idea to production
summary: Scope tightly, prototype against an eval set, and treat the move to production as its own project with clear gates.
minutes: 11
practice: [lead-projects-1, lead-projects-2, lead-projects-3, lead-projects-4]
flow:
  title: The life of an AI project
  steps:
    - label: Scope the problem
      detail: Write down the user, the task, what "good" looks like, and what happens when the AI is wrong. Agree on one measurable goal.
    - label: Build a small eval set
      detail: Collect real examples with expected outcomes before writing much code. This is how everyone will judge progress.
    - label: Time-boxed prototype
      detail: Try the simplest approach (often one prompt plus retrieval) for a fixed number of days and score it on the eval set.
    - label: Go or no-go
      detail: Compare results with the goal. Continue, change approach, narrow the scope, or stop. Stopping early is a valid outcome.
    - label: Pilot
      detail: Release to a small group of real users with a human safety net, and collect feedback and failure cases.
    - label: Harden for production
      detail: Add monitoring, fallbacks, cost controls, security review, rate limits and an on-call owner.
    - label: Launch and monitor
      detail: Roll out gradually, watch quality, cost and complaints, and feed failures back into the eval set.
  loop:
    from: 7
    to: 2
    label: Real failures become eval cases
selfCheck:
  - q: Why build an eval set before the prototype?
    options:
      - It's required by AI vendors
      - It gives the team and stakeholders a shared, objective way to judge progress
      - It replaces the need for user testing
    answer: 1
    why: Without an eval set, "it looks good" becomes the standard, and demos on hand-picked examples mislead everyone.
  - q: A prototype hits a strong score on the eval set after one week. What's the biggest remaining work usually?
    options:
      - Nothing, ship it
      - Production hardening, monitoring, fallbacks and handling real-world inputs
      - Switching to a newer model
    answer: 1
    why: The gap between a working demo and a reliable production feature is where most AI projects spend their time.
  - q: What makes a good time-box outcome?
    options:
      - Only "ship it"
      - A clear decision, which can be continue, change approach, narrow scope, or stop
      - A longer time-box
    answer: 1
    why: The point of a time-box is to buy a decision with limited cost. Stopping a weak idea early is a success.
---

## Core concepts

AI projects fail differently from normal software projects. In normal software, if you build the spec correctly, it works. In AI, you can build everything correctly and the model still gets a meaningful share of cases wrong. So the main risk isn't "can we build it?" but **"is it good enough, and how will we know?"**

Think of it like hiring for a new role. You don't hire on a nice interview story (the demo). You define the job, test candidates on realistic tasks (the eval set), put them on probation with supervision (the pilot), and only then give them full responsibility (production).

Three ideas carry most of the weight:

- **Scope ruthlessly.** "AI that handles all customer email" is a wish. "Draft replies for order-status emails, reviewed by an agent before sending" is a project. Narrow scope makes quality measurable and failures cheap.
- **Evals are the spec.** A set of real inputs with expected outcomes is how you define "done." It also protects you from the most common trap: a great demo on five hand-picked examples.
- **Prototype to learn, not to ship.** Time-box it. The output is a decision, backed by numbers.

**Questions to answer during scoping**

- Who is the user, and what do they do today without AI?
- What does a wrong output cost? (A bad song recommendation versus a wrong dosage.)
- Is a human in the loop? Who reviews, and how fast?
- What data do we have, are we allowed to use it, and is it representative?
- What will we measure, and what number makes this worth it?

## How it works in real systems

**A scoping one-pager** keeps everyone aligned. Keep it short enough that people actually read it:

```text
Problem:      Agents spend too long on order-status emails.
User:         Support agents (they approve every draft).
AI task:      Draft a reply from order data + policy docs.
Goal:         Agents accept drafts with light or no edits in most cases;
              handling time per email drops measurably.
Wrong output: Agent catches it before sending (low risk).
Data:         Last quarter's emails + replies (anonymised), order API.
Eval set:     200 real emails with approved replies, graded by 2 leads.
Time-box:     2 weeks prototype, then go/no-go.
Out of scope: Refunds, complaints, legal questions.
```

**Moving from prototype to production** is a separate phase with its own checklist:

- Observability: trace each request (prompt version, retrieved context, model, output, latency, cost).
- Fallbacks: what happens when the provider is slow or down?
- Cost controls: budgets, alerts, per-user limits.
- Security and privacy review: what data leaves your systems, prompt injection risks, logging of personal data.
- Versioning: prompts and model versions are tracked like code; changes go through the eval gate.
- Ownership: who is on call, who reviews failure samples each week?
- Rollout: feature flag, small percentage first, clear rollback.

**Estimating honestly.** AI work has a long tail. The first 80% of quality can come quickly; the last stretch on hard cases is slow and sometimes not reachable. Plan in phases with decision points instead of one big estimate, and tell stakeholders why.

> [!tip] Show progress as a number
> A weekly line like "eval pass rate went from 62% to 78%; main remaining failures are multi-order emails" builds more trust than any demo. Stakeholders can see the trend, and you can see where to work next.

## Common mistakes

- **Starting with "we should use AI for something"** → start from a specific, costly problem and check whether AI is the best fix.
- **Demo-driven decisions** → decide on eval results over realistic data, not hand-picked examples.
- **No exit criteria** → define go/no-go thresholds before the prototype starts.
- **Treating the prototype as nearly done** → plan a real hardening phase for monitoring, fallbacks, security and cost.
- **Silent prompt and model changes** → version them and run evals before every change.
- **No owner after launch** → assign someone to review failures and keep the eval set growing.

## Interview angle

Asked as "Tell me about an AI project you led," "How do you decide whether an AI feature is worth building?" or "How do you estimate AI work?"

A strong answer shows narrow scoping, eval-first development, a time-boxed prototype with a clear decision, a pilot with a human safety net, and a production checklist. Real numbers and a real failure you learned from make it credible.

Follow-up interviewers like: **"Tell me about an AI project you stopped or should have stopped."** They want to hear that you set exit criteria and respected them, and how you communicated the decision.
