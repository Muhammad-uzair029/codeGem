---
title: Chain-of-thought and step-by-step reasoning
summary: Letting the model work through a problem before answering improves hard tasks, at a cost in tokens and latency.
minutes: 7
practice: [prompt-cot-1, prompt-cot-2, prompt-cot-3]
selfCheck:
  - q: Why does asking a model to reason before answering often help?
    options:
      - It switches the model to a bigger version
      - Each generated step becomes context the next tokens can build on
      - It lowers the cost of the request
    answer: 1
    why: The model only "thinks" by writing tokens. Intermediate steps give later tokens more to work with.
  - q: Which task benefits least from chain-of-thought?
    options:
      - A multi-step pricing calculation
      - Classifying a short message as spam or not spam
      - Debugging why a function returns the wrong value
    answer: 1
    why: Simple lookups and classifications rarely need reasoning; it just adds tokens and latency.
  - q: How should your app handle the model's reasoning text?
    options:
      - Always show it to users as the answer
      - Separate it from the final answer, e.g. with tags, and usually show only the answer
      - Parse the reasoning as JSON
    answer: 1
    why: Keep reasoning and answer in separate sections so code can extract the answer reliably.
---

## Core concepts

An LLM can only "think" by writing. It has no scratchpad besides the tokens it produces. If you ask for the answer immediately, the model has to get there in a single jump. If you let it write out the steps first, each step becomes context for the next one.

It's like mental arithmetic. Ask someone "what's 17 × 24?" and demand an instant answer: errors are likely. Let them write "17 × 20 = 340, 17 × 4 = 68, total 408" and they're right.

That's **chain-of-thought (CoT)** prompting: asking the model to reason step by step before giving its final answer.

Ways to get it:

- **Simple instruction**: "Think through this step by step before answering."
- **Guided steps**: spell out the steps you want: "First list the relevant facts, then check each rule, then decide."
- **Structured sections**: ask for reasoning inside `<thinking>` tags and the final result inside `<answer>` tags, so code can pull out just the answer.
- **Built-in reasoning models**: many current models have a reasoning or "thinking" mode, often enabled with an API parameter. They reason internally before answering, so you usually don't need to prompt for steps, and over-prescribing the steps can even hurt.

When CoT helps: maths, multi-step logic, planning, code debugging, applying many rules to one case. When it doesn't: simple extraction, classification, short rewrites. There it adds cost and latency for no gain.

> [!note] Reasoning text is not a guaranteed explanation
> The written steps are useful, but they aren't a reliable record of how the model actually reached its answer. Verify the answer itself, not just whether the reasoning looks convincing.

## How it works in real systems

```python
import re

SYSTEM = """You review expense claims against the policy in <policy>.
First reason inside <thinking> tags: list each rule that applies and check it.
Then give your decision inside <answer> tags as exactly APPROVE or REJECT."""

def review_claim(policy: str, claim: str) -> tuple[str, str]:
    reply = llm(                                     # your provider call
        system=SYSTEM,
        user=f"<policy>\n{policy}\n</policy>\n<claim>\n{claim}\n</claim>",
        max_tokens=1500,                             # leave room for the reasoning
    )
    match = re.search(r"<answer>\s*(APPROVE|REJECT)\s*</answer>", reply)
    if not match:
        raise ValueError("No valid decision in model output")
    thinking = re.search(r"<thinking>(.*?)</thinking>", reply, re.S)
    return match.group(1), (thinking.group(1).strip() if thinking else "")
```

The decision is extracted strictly; the reasoning is kept for logs and debugging, not shown to the employee.

Related techniques:

- **Self-consistency**: sample several reasoning paths at moderate temperature and take the majority answer. More accurate on hard problems, but multiplies cost.
- **Prompt chaining**: split a big task into separate calls (extract facts → analyse → write reply). Each step is easier to test and debug than one giant prompt.

## Common mistakes

- Adding "think step by step" to every prompt → use it where tasks need multiple steps; measure the quality gain against extra tokens and latency.
- Setting a small `max_tokens` with CoT → the reasoning eats the budget and the answer gets truncated; raise the limit.
- Parsing the answer out of free text → put it in tags or a final JSON field and extract strictly.
- Prescribing rigid steps to a built-in reasoning model → give the goal and constraints; let it plan, then evaluate.
- Trusting an answer because the reasoning looks good → check the result against known answers in evals.

## Interview angle

Typical question: "What is chain-of-thought prompting and when would you use it?"

A strong answer explains *why* it works (reasoning tokens become context), names suitable tasks (multi-step logic, maths, rule application), names the costs (tokens, latency), shows how to separate reasoning from the answer for parsing, and mentions built-in reasoning models as the modern alternative.

Follow-up interviewers like: *"Your latency budget is 1 second but CoT improves accuracy a lot. What do you do?"* Use a small reasoning budget, split the task so only the hard part reasons, run reasoning offline or asynchronously, or use the CoT outputs to fine-tune a faster model.
