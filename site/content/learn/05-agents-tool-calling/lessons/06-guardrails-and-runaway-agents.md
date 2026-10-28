---
title: Guardrails, retries, and stopping runaway agents
summary: Agents need hard limits, safe retries, permission checks, and a human in the loop for anything risky.
minutes: 10
practice: [agent-guard-1, agent-guard-2, agent-guard-3]
flow:
  title: A guarded tool call
  steps:
    - label: Model proposes call
      detail: The agent emits a tool call with arguments.
    - label: Check budgets
      detail: Step count, token or cost budget, and wall-clock time are checked before doing anything.
    - label: Validate + authorize
      detail: Arguments are validated against the schema and the user's permissions; bad input returns an error result.
    - label: Risky? Ask a human
      detail: Irreversible or high-impact actions (send email, delete data, pay) pause for human approval.
    - label: Execute with retry
      detail: The tool runs with a timeout; transient failures retry with backoff, a limited number of times.
    - label: Return result
      detail: The output (or error) goes back to the model and the step counter increases.
  loop:
    from: 6
    to: 1
    label: Next step, if budgets allow
selfCheck:
  - q: Which action should most clearly require human approval?
    options:
      - Searching internal docs
      - Issuing a customer refund
      - Reading a public web page
    answer: 1
    why: Refunds move money and are hard to reverse. Read-only actions are usually safe to automate.
  - q: Why should retries use exponential backoff and a cap?
    options:
      - To make responses look more natural
      - To avoid hammering a failing service and to stop endless retry loops
      - Because the model requires it
    answer: 1
    why: Backoff gives the service time to recover; a cap guarantees the loop ends.
  - q: The agent called the same tool with identical arguments five times in a row. What should happen?
    options:
      - Nothing, let it continue
      - Detect the repetition and stop or force a different strategy
      - Increase the step limit
    answer: 1
    why: Repeated identical calls signal a stuck loop. Detect it and break out instead of burning budget.
---

## Core concepts

An agent is a program whose control flow is chosen by a model. Models make mistakes, misread instructions, and can be manipulated by text they read (**prompt injection**). So you wrap the loop in **guardrails**: checks in *your code* that the model can't talk its way past.

Analogy: a new intern with a company card. Smart and eager, but you set a spending limit, require sign-off for big purchases, and check in if they're still "researching" after three hours.

The main guardrails:

- **Max steps**: a hard cap on loop iterations. LangGraph, for example, raises an error when its `recursion_limit` is exceeded.
- **Budgets**: limit total tokens or estimated cost per run, per user, per day.
- **Timeouts**: per tool call and for the whole run.
- **Loop detection**: stop if the same call with the same arguments repeats.
- **Least privilege**: give each agent only the tools and scopes it needs. A support bot doesn't need `DELETE`.
- **Human approval (human-in-the-loop)**: pause before irreversible or high-impact actions and show a person exactly what will happen.
- **Input and output checks**: validate arguments against schemas; screen outputs for leaked secrets, PII, or policy violations.

**Retries** need care too. Retry *transient* errors (timeouts, rate limits, 5xx) with exponential backoff and a cap. Don't blindly retry non-idempotent actions (charging a card twice is worse than failing once); use idempotency keys where the API supports them.

> [!warning] The prompt is not a guardrail
> "Never delete production data" in a system prompt is a hint, not a control. Enforce rules in code: tool allow-lists, permission checks, approval gates.

## How it works in real systems

A run guard that enforces steps, cost, time, and repetition across the whole agent run:

```python
import time

class RunGuard:
    def __init__(self, max_steps=10, max_cost_usd=0.50, max_seconds=120):
        self.max_steps, self.max_cost, self.deadline = max_steps, max_cost_usd, time.monotonic() + max_seconds
        self.steps, self.cost, self.seen = 0, 0.0, []

    def check(self, call_name: str, args: dict, step_cost: float) -> None:
        self.steps += 1
        self.cost += step_cost
        sig = (call_name, repr(sorted(args.items())))
        self.seen.append(sig)
        if self.steps > self.max_steps:
            raise StopAgent("step limit reached")
        if self.cost > self.max_cost:
            raise StopAgent("budget exceeded")
        if time.monotonic() > self.deadline:
            raise StopAgent("timeout")
        if self.seen[-3:].count(sig) == 3:
            raise StopAgent(f"stuck: repeated {call_name}")
```

Human approval for risky tools, as a gate in the tool runner:

```python
RISKY = {"send_email", "issue_refund", "delete_record"}

async def run_tool(call, user):
    if call.name not in user.allowed_tools:
        return {"error": f"not permitted: {call.name}"}
    if call.name in RISKY:
        decision = await request_approval(user, call.name, call.args)  # UI, Slack, ticket...
        if not decision.approved:
            return {"error": "rejected by human", "reason": decision.note}
    return await with_retry(TOOLS[call.name], call.args, attempts=3, timeout=20)
```

In LangGraph, `interrupt()` plus a checkpointer can pause a graph, wait for a person, and resume later with their decision, which is useful when approval takes hours.

When a limit trips, **fail gracefully**: return what was found so far and why it stopped, and log the full trajectory for review.

## Common mistakes

- Relying on the system prompt for safety → enforce limits and permissions in code.
- Per-call limits only → also cap the whole run (steps, cost, time).
- Retrying everything → retry only transient errors, with backoff, a cap, and idempotency keys for writes.
- Approval prompts that say "Allow tool call?" → show the concrete action and arguments ("Refund $40 to order 4411").
- Giving the agent admin credentials "for now" → scope tokens to the minimum and to the current user.
- Silent failure when a limit hits → return a partial result and a clear reason.

## Interview angle

Asked as: *"How do you make an agent safe to run in production?"* A strong answer layers controls: hard limits (steps, budget, timeouts), loop detection, least-privilege tools, argument validation, human approval for irreversible actions, safe retries with idempotency, and full tracing. Mention prompt injection through tool results as a reason not to trust the model with high-impact actions.

Follow-up: *"Which actions would you let run without approval?"* Read-only, reversible, low-cost actions scoped to the current user. Anything that spends money, sends messages externally, or deletes data gets a gate, at least until evals and logs show it's reliable.
