---
title: Hallucinations and how to reduce them
summary: Why models state false things confidently, and the layered defences that make answers trustworthy.
minutes: 8
practice: [llm-halluc-1, llm-halluc-2, llm-halluc-3]
flow:
  title: A grounded answer pipeline
  steps:
    - label: Retrieve sources
      detail: Fetch the relevant documents or records for the question from your own data.
    - label: Prompt with sources
      detail: Put the sources in the prompt and instruct the model to answer only from them, or say it doesn't know.
    - label: Generate with citations
      detail: Ask the model to cite which source supports each claim.
    - label: Verify
      detail: Check citations exist and quotes match; validate structured fields in code.
    - label: Answer or fall back
      detail: Return the answer, or "I couldn't find that" and a path to a human.
selfCheck:
  - q: What is the root cause of hallucinations?
    options:
      - Bugs in the API
      - The model generates likely-sounding text, not verified facts
      - High temperature only
    answer: 1
    why: The model is trained to produce plausible continuations. Plausible and true often overlap, but not always.
  - q: Does setting temperature to 0 eliminate hallucinations?
    options:
      - Yes
      - No, it only makes the most likely answer repeat; that answer can still be wrong
    answer: 1
    why: Low temperature reduces randomness, but if the most likely continuation is false, you get a consistent false answer.
  - q: Which single change usually helps most for questions about your company's own policies?
    options:
      - Using a bigger model
      - Supplying the relevant policy text in the prompt and requiring answers from it
      - Asking the model to "be accurate"
    answer: 1
    why: The model can't know your private policies. Grounding it in the actual text is the main fix.
---

## Core concepts

A **hallucination** is when the model states something false or unsupported, often fluently and confidently: a made-up citation, a non-existent API method, a wrong date.

Why it happens, in plain terms:

- **It predicts plausible text, not truth.** The model learned what answers *look like*. When it doesn't know, the most likely-looking continuation is still a confident answer, not "I don't know".
- **Knowledge gaps.** It knows nothing after its training cutoff and nothing about your private data, but it will still try to answer.
- **Pressure from the prompt.** "List 10 sources" when only 3 exist invites 7 inventions. Leading questions ("Why is X true?") push it to justify X.
- **Lossy memory.** Rare facts seen only a few times in training are recalled poorly, like a half-remembered phone number.

Think of a very confident new hire who never says "I'm not sure". The fix isn't to hope they improve; it's to give them the documents, ask them to show their sources, and check their work.

> [!warning] You can reduce hallucinations, not eliminate them
> Design the product assuming some answers will be wrong: show sources, allow feedback, and keep a human in the loop for high-stakes actions.

## How it works in real systems

Defences work in layers:

1. **Ground the model.** Put the facts in the prompt (retrieved documents, database rows, API results). This is the biggest lever.
2. **Permit "I don't know".** Explicitly allow and request it when the sources don't contain the answer.
3. **Require citations or quotes.** Then check them in code.
4. **Use tools for facts and maths.** Let the model call a calculator, search or database instead of recalling.
5. **Verify.** Validate structured output, check citations, or use a second model call to check claims against sources.

```python
import re

SYSTEM = """Answer using ONLY the documents below.
Cite the document id for each claim like [doc-2].
If the documents don't contain the answer, reply exactly: NOT_FOUND"""

def answer(question: str, docs: list[dict]) -> str:
    context = "\n".join(f'<doc id="{d["id"]}">{d["text"]}</doc>' for d in docs)
    reply = llm(system=SYSTEM, user=f"{context}\n\nQuestion: {question}")

    if reply.strip() == "NOT_FOUND":
        return "I couldn't find that in our docs. Want me to connect you with support?"

    cited = set(re.findall(r"\[(doc-\d+)\]", reply))
    known = {d["id"] for d in docs}
    if not cited or not cited <= known:        # no citations, or invented ones
        raise ValueError("Answer is not grounded in provided docs")
    return reply
```

Here `llm` stands for your provider call. The check is cheap and catches the most embarrassing failure: citations to documents that don't exist.

## Common mistakes

- Prompting "don't hallucinate" and calling it done → give sources, allow NOT_FOUND, and verify in code.
- Asking for facts the model can't know (recent events, private data) → retrieve them and put them in context.
- Asking for a fixed number of items ("give 10 references") → ask for "up to N, only ones you can support".
- Trusting generated code that calls unfamiliar library methods → run it, type-check it, and test it.
- Measuring quality by reading a few answers → build an eval set with known answers and track a groundedness or accuracy score over time.

## Interview angle

Typical question: "Our support bot invents refund policies. How do you fix it?"

A strong answer explains the cause (plausible text, no access to the real policy), then layers fixes: retrieval of the actual policy, an instruction to answer only from sources and say when it can't, citations checked in code, low temperature for consistency, an eval set of real questions, and an escalation path to a human. It ends with how you'd measure improvement.

Follow-up interviewers like: *"How would you detect hallucinations automatically at scale?"* Check citations against sources, use an LLM-as-judge to compare claims with the retrieved text, sample for human review, and track user feedback signals.
