---
title: The ReAct pattern and agent loops
summary: An agent is a model in a loop that thinks, acts with a tool, observes the result, and decides what to do next.
minutes: 9
practice: [agent-react-1, agent-react-2, agent-react-3]
flow:
  title: The ReAct loop
  steps:
    - label: Goal
      detail: The agent receives a task, e.g. "Find why last night's deploy failed and summarize it."
    - label: Reason
      detail: The model decides what it needs next ("I should read the CI logs first").
    - label: Act
      detail: It emits a tool call, such as fetch_ci_logs(run_id).
    - label: Observe
      detail: Your code runs the tool and appends the output as an observation.
    - label: Check stop
      detail: If the model answers without a tool call, or a limit is hit (steps, tokens, time), the loop ends.
    - label: Answer
      detail: The agent returns its final result, ideally with the evidence it used.
  loop:
    from: 5
    to: 2
    label: Not done yet, reason again
selfCheck:
  - q: What does ReAct combine?
    options:
      - Retrieval and caching
      - Reasoning steps interleaved with actions (tool calls) and their observations
      - React.js components and an LLM
    answer: 1
    why: ReAct (Reason + Act) interleaves reasoning traces with tool actions and feeds observations back in.
  - q: What is the main difference between a workflow and an agent?
    options:
      - Workflows use LLMs, agents don't
      - In a workflow your code fixes the steps; in an agent the model chooses the next step
      - Agents are always multi-model
    answer: 1
    why: Workflows follow predefined paths. Agents let the model decide which tool to call next and when to stop.
---

## Core concepts

**ReAct** stands for *Reason + Act*. It comes from a 2022 research paper (Yao et al.) that showed models do better on multi-step tasks when they alternate between:

1. **Thought**: reasoning about what to do next.
2. **Action**: calling a tool.
3. **Observation**: reading the tool's result.

…and repeat until they can answer.

Analogy: a detective. They form a hunch (thought), check a clue (action), learn something (observation), update the hunch, and keep going until they can name the culprit.

In the original paper the model wrote `Thought:` / `Action:` / `Observation:` as plain text and the program parsed it. Today, native tool calling replaces the parsing, but the **loop is the same**. When people say "agent", they usually mean exactly this loop.

**Workflow vs agent** is a useful distinction:

- A **workflow** is a fixed pipeline your code controls: classify → retrieve → answer. Predictable, cheap, easy to test.
- An **agent** lets the model pick the next step. Flexible, but less predictable, slower, and harder to test.

Start with a workflow. Reach for an agent only when the steps genuinely can't be known in advance (open-ended research, debugging, multi-tool tasks).

## How it works in real systems

A bare-bones agent loop is small. The important parts are the **stop conditions** and the **history** you keep.

```ts
type Step = { tool?: string; args?: unknown; observation?: string };

async function runAgent(goal: string, maxSteps = 8): Promise<string> {
  const messages: Message[] = [{ role: "user", content: goal }];
  for (let step = 0; step < maxSteps; step++) {
    const reply = await callModel(messages, TOOLS);   // your provider wrapper
    messages.push(reply.message);
    if (reply.toolCalls.length === 0) return reply.text;   // model says it's done
    for (const call of reply.toolCalls) {
      const observation = await runTool(call.name, call.args); // validated + authorized
      messages.push(toolResultMessage(call.id, observation));
    }
  }
  return "Stopped: step limit reached. Partial findings: " + summarize(messages);
}
```

What real agents add on top:

- **A good system prompt**: role, available tools, when to stop, and what a final answer should contain.
- **Context management**: long loops grow the message list. Trim or summarize old observations so you don't overflow the context window or pay for the same tokens every step.
- **Planning**: some agents write a short plan first, then execute it (plan-and-execute). This reduces wandering on long tasks.
- **Logging every step** so you can replay why the agent did what it did (see the observability module).

> [!tip] Cost grows with every step
> Each loop iteration resends the whole conversation. Ten steps with a growing history can cost far more than ten times a single call. Prompt caching and trimming old observations help.

## Common mistakes

- Using an agent where a fixed workflow would do → if you can draw the steps on a whiteboard, code them.
- No stop condition besides "the model says done" → always add a step limit and a budget.
- Letting observations grow without bound → truncate large tool outputs and summarize old steps.
- Giving the agent 40 tools → fewer, well-described tools make better choices; group or route if you need many.
- Not recording the trajectory → store each thought, call, and observation for debugging and evals.

## Interview angle

Expect: *"What is an agent, and how is it different from a chain?"* A strong answer: an agent is an LLM in a loop that chooses actions (tool calls) based on observations, until it decides to stop or hits a limit. A chain or workflow has steps fixed by code. Mention ReAct by name, explain thought/action/observation, and add the trade-off: agents buy flexibility at the cost of latency, cost, and predictability.

Follow-up: *"How would you stop an agent from looping forever?"* Mention max steps, token or money budgets, wall-clock timeouts, detecting repeated identical tool calls, and returning a partial result rather than failing silently.
