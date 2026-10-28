---
title: Tracing and monitoring with LangSmith
summary: A trace records every step inside a request, so you can see why an answer was bad, and turn real traffic into eval datasets and experiments.
minutes: 10
practice: [eval-trace-1, eval-trace-2, eval-trace-3]
flow:
  title: From production trace to experiment
  steps:
    - label: Trace requests
      detail: Each request is logged as a trace, a tree of runs (LLM calls, retriever calls, tool calls) with inputs, outputs, latency and tokens.
    - label: Monitor
      detail: Dashboards and alerts track error rate, latency, cost and feedback scores over time.
    - label: Find bad traces
      detail: Filter by negative user feedback, errors, or low online-evaluator scores.
    - label: Add to a dataset
      detail: Save the inputs (and a corrected output) as examples in a dataset.
    - label: Run an experiment
      detail: Run a new version of the app over the dataset with evaluators; the scored results are an experiment.
    - label: Compare and ship
      detail: Compare experiments side by side; ship the version that improves without regressions.
  loop:
    from: 6
    to: 1
    label: Ship, keep tracing
selfCheck:
  - q: In LangSmith, what is the relationship between a trace and a run?
    options:
      - They are the same thing
      - A trace is a tree of runs; each run is one step such as an LLM call or tool call
      - A run contains many traces
    answer: 1
    why: A trace covers one end-to-end request; it's made of nested runs, one per step.
  - q: What is a LangSmith experiment?
    options:
      - A feature flag
      - The results of running one version of your app over a dataset, with evaluator scores
      - A production deployment
    answer: 1
    why: Experiments let you compare app versions on the same dataset.
---

## Core concepts

When an LLM app gives a bad answer, the question is *which step went wrong?* Was the right document retrieved? What exact prompt did the model see? Did a tool error get swallowed? Logs with just the final answer can't tell you. **Tracing** records every step.

Analogy: a flight recorder. You don't read it every day, but when something goes wrong it shows exactly what happened, in order.

**LangSmith** is LangChain's platform for tracing, evaluation, and monitoring. It works with or without the LangChain libraries. Its key concepts:

- **Run**: one unit of work: an LLM call, a retriever call, a tool call, or your own function. It records inputs, outputs, errors, latency, and (for LLM runs) token usage.
- **Trace**: the tree of runs for one end-to-end request. The root run is your top-level handler; children are the steps inside it.
- **Project**: a container where traces are grouped (e.g. per app and environment).
- **Feedback**: scores attached to runs, from users (thumbs up/down), humans in annotation queues, or automated evaluators.
- **Dataset**: a set of examples (inputs and optional reference outputs) for evaluation.
- **Experiment**: the result of running your app over a dataset with evaluators. You compare experiments to see if a change helped.

Other tools cover similar ground (Langfuse, Arize Phoenix, Braintrust, Weights & Biases Weave, and OpenTelemetry-based setups). The concepts transfer: traces made of spans or runs, datasets, experiments.

## How it works in real systems

Tracing a plain Python app. With `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` set in the environment, decorated functions become runs and nest automatically:

```python
from langsmith import traceable
from langsmith.wrappers import wrap_openai
from openai import OpenAI

client = wrap_openai(OpenAI())          # LLM calls are logged as child runs

@traceable(run_type="retriever")
def retrieve(question: str) -> list[str]:
    return vector_store.search(question, k=4)

@traceable                              # the root run of the trace
def answer(question: str) -> str:
    docs = retrieve(question)
    resp = client.chat.completions.create(model=MODEL, messages=[
        {"role": "system", "content": "Answer only from these docs:\n" + "\n".join(docs)},
        {"role": "user", "content": question}])
    return resp.choices[0].message.content
```

Running an experiment over a dataset with a custom evaluator:

```python
from langsmith import Client, evaluate

ls = Client()
ds = ls.create_dataset(dataset_name="support-qa")
ls.create_examples(dataset_id=ds.id,
    inputs=[{"question": "How long do refunds take?"}],
    outputs=[{"answer": "5-7 business days"}])

def mentions_reference(outputs: dict, reference_outputs: dict) -> bool:
    return reference_outputs["answer"].lower() in outputs["answer"].lower()

evaluate(lambda inputs: {"answer": answer(inputs["question"])},
         data="support-qa", evaluators=[mentions_reference],
         experiment_prefix="prompt-v2")
```

What to monitor in production:

- **Latency** (p50/p95), **error rate**, **token usage and cost** per request and per feature.
- **Feedback**: user thumbs, plus online evaluators (LLM judges or code checks run on a sample of live traces).
- **Drift**: changes in input topics or lengths that your dataset doesn't cover.

> [!warning] Traces contain user data
> Prompts and outputs often include personal or confidential information. Decide what to redact before sending, set retention policies, and restrict who can view projects.

## Common mistakes

- Logging only the final answer → trace every step so you can find which one failed.
- Tracing in dev but not production → production is where the surprising inputs are; sample if volume is high.
- Never turning traces into datasets → bad production traces are the best eval examples you'll get.
- Comparing experiments run on different dataset versions → keep the dataset fixed when comparing app versions.
- Sending raw PII to a third-party service without review → redact, mask, or self-host according to policy.
- Collecting thumbs-down feedback and never reading it → review negative feedback on a schedule.

## Interview angle

Typical question: *"A user reports a bad answer from your RAG bot. How do you debug it?"* A strong answer: find the trace (by request id or user feedback), check the retriever run (were the right chunks returned?), check the exact prompt the model saw, check tool runs for errors, then add the case to the eval dataset with a correct reference so the fix is tested forever. Name the concepts: traces, runs, datasets, experiments, feedback.

Follow-up: *"How do you trace a multi-agent system?"* One trace per user request, with child runs per agent and tool, tagged with agent names and metadata (user id, prompt version) so you can filter and compare.
