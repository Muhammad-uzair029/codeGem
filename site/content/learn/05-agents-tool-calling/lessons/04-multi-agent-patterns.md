---
title: Multi-agent patterns
summary: Supervisor, sequential, and parallel are the three shapes behind most multi-agent systems, and each has a clear cost.
minutes: 9
practice: [agent-multi-1, agent-multi-2, agent-multi-3]
flow:
  title: Supervisor pattern
  steps:
    - label: Request arrives
      detail: The user asks for something that spans skills, e.g. "Compare our Q3 churn to competitors and draft an email."
    - label: Supervisor plans
      detail: A coordinating agent decides which specialist should act next and with what instruction.
    - label: Specialist works
      detail: A worker agent (data analyst, researcher, writer) runs with its own prompt and a small set of tools.
    - label: Report back
      detail: The worker returns a result to the supervisor, not to the user.
    - label: Supervisor decides
      detail: It routes to another worker, asks for a fix, or decides the job is done.
    - label: Final response
      detail: The supervisor assembles the pieces into one answer.
  loop:
    from: 5
    to: 2
    label: More work needed
selfCheck:
  - q: You need to summarize 50 independent documents quickly. Which pattern fits best?
    options:
      - Sequential
      - Parallel fan-out, then aggregate
      - Supervisor with one worker
    answer: 1
    why: The documents don't depend on each other, so run them concurrently and merge the results.
  - q: What is a main downside of the supervisor pattern?
    options:
      - It can't use tools
      - Extra LLM calls and latency for routing, and the supervisor becomes a single point of failure
      - It only works with one model provider
    answer: 1
    why: Every routing decision is another model call, and a confused supervisor derails the whole run.
---

## Core concepts

A **multi-agent system** splits a job across several LLM-driven workers, each with its own prompt, tools, and focus. Why bother? A single agent with 30 tools and a giant prompt gets confused. Specialists with narrow prompts and 3–5 tools each tend to choose better.

Three patterns cover most real designs.

**1. Sequential (pipeline).** Agent A's output is agent B's input, like an assembly line: research → draft → edit. Simple, predictable, easy to debug. Downside: slow (no concurrency) and errors flow downstream.

**2. Parallel (fan-out / fan-in).** Several agents work at the same time on independent pieces, then an aggregator merges results. Example: review a pull request for security, performance, and style at once. Fast, but you need a good merge step and must handle one branch failing.

**3. Supervisor (orchestrator–worker).** A coordinating agent decides at runtime which worker acts next, reads their results, and decides when to stop. Like a project manager. Flexible for tasks you can't plan in advance, but every routing decision costs an LLM call, and the supervisor is a single point of failure. A **hierarchical** variant nests supervisors (a manager of managers).

Other names you'll hear: **handoffs** (one agent passes control and context directly to another, common in customer-support routing) and **debate / critic** setups (one agent drafts, another critiques).

> [!warning] More agents is not automatically better
> Each agent adds latency, cost, and another place for things to go wrong. Many "multi-agent" problems are solved better by one agent with good tools, or by a fixed workflow. Add agents when a single one measurably fails.

## How it works in real systems

The parallel pattern is often just concurrent LLM calls plus a merge. No framework needed:

```python
import asyncio

REVIEWERS = {
    "security": "You review code for security issues only. List concrete findings.",
    "performance": "You review code for performance issues only.",
    "style": "You review code for readability and naming only.",
}

async def review(diff: str) -> str:
    async def one(name: str, system: str):
        try:
            return name, await call_model(system=system, user=diff, timeout=60)
        except Exception as e:                      # one branch failing shouldn't kill all
            return name, f"[{name} review failed: {e}]"

    results = await asyncio.gather(*(one(n, s) for n, s in REVIEWERS.items()))
    findings = "\n\n".join(f"## {n}\n{r}" for n, r in results)
    return await call_model(system="Merge these reviews. Remove duplicates, rank by severity.",
                            user=findings)
```

Design choices that matter in production:

- **What context does each agent see?** Passing the full history to every agent is expensive and noisy. Pass a focused brief and only the inputs it needs.
- **Structured hand-offs**: have workers return JSON (or a schema) rather than free text, so the next step can rely on fields.
- **Shared limits**: apply step and cost budgets to the whole run, not per agent, or a supervisor can spawn work forever.
- **Tracing**: you need a trace that shows which agent did what, or debugging becomes guesswork.

In LangGraph these patterns are graphs (parallel branches, a router node). In CrewAI, `Process.sequential` and `Process.hierarchical` map to pipeline and supervisor.

## Common mistakes

- Splitting into agents by job title rather than by real need → start with one agent and split only where it fails.
- Workers chatting freely with each other → route through a supervisor or a fixed graph so control flow is visible.
- Free-text hand-offs → use structured outputs between agents.
- No failure handling in parallel branches → catch per branch and let the aggregator note what's missing.
- Per-agent budgets only → enforce a global budget for the whole run.

## Interview angle

Often framed as design: *"Build a system that researches a company and writes a sales brief."* A strong answer picks a pattern and justifies it: parallel research on independent sources (news, financials, product), then a sequential write and fact-check step. Mention a global budget, structured outputs between steps, partial-failure handling, and tracing. Point out that a supervisor adds flexibility at the cost of extra calls.

Follow-up: *"How would you know the multi-agent version is better than a single agent?"* Build an eval set and compare quality, cost, and latency on the same tasks. If it isn't measurably better, keep the simpler system.
