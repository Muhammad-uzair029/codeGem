---
title: System prompts and few-shot examples
summary: Give the model a clear role, rules and a couple of worked examples, and its behaviour gets far more predictable.
minutes: 8
practice: [prompt-system-1, prompt-system-2, prompt-system-3]
selfCheck:
  - q: What belongs in a system prompt?
    options:
      - The user's current question only
      - Stable instructions - role, rules, output format, tone
      - Random examples to add variety
    answer: 1
    why: The system prompt holds the instructions that apply to every turn. The user's specific request goes in the user message.
  - q: What is few-shot prompting?
    options:
      - Calling the model a few times and averaging
      - Including a few input-output examples that show the desired behaviour
      - Limiting the answer to a few tokens
    answer: 1
    why: Examples show the model the pattern you want, which often works better than describing it.
  - q: All your few-shot examples have the label "positive". What risk does that create?
    options:
      - None
      - The model leans toward answering "positive"
      - The request will be rejected
    answer: 1
    why: Models copy patterns in examples, including accidental ones. Balance and vary your examples.
---

## Core concepts

A prompt is a brief for a very capable contractor who has zero context about your company. The clearer the brief, the better the work.

Most chat APIs split the brief into roles:

- **System prompt**: standing instructions that apply to the whole conversation. Who the model is, what it should and shouldn't do, the output format, the tone. Think "job description plus house rules".
- **User messages**: the actual request for this turn.
- **Assistant messages**: the model's previous replies (you can also write these yourself to show examples).

A good system prompt usually covers:

1. **Role and goal**: "You are a support assistant for an invoicing app. Your goal is to resolve billing questions."
2. **Context**: who the users are, what the product does.
3. **Rules**: what to do, what not to do, and *why*. Reasons help the model handle cases you didn't list.
4. **Output format**: length, structure, language.
5. **What to do when unsure**: ask a clarifying question, or say you don't know.

**Few-shot prompting** means adding a few examples of input and ideal output. It's the difference between telling a new hire "write it in our house style" and handing them three past examples. Examples are the most reliable way to pin down format and tone.

- **Zero-shot**: instructions only.
- **One-shot / few-shot**: instructions plus one or several examples.

> [!tip] Be specific, not shouty
> "Reply in at most 3 sentences, no bullet points" beats "BE CONCISE!!!". Clear, specific instructions work better than capital letters and threats.

## How it works in real systems

```python
SYSTEM = """You are a support triage assistant for Acme Invoicing.
Classify each customer message into one category: billing, bug, feature_request, other.
Rules:
- Reply with the category only, lowercase, no punctuation.
- If a message mentions both a bug and billing, choose billing (billing issues are time-sensitive).
- If you can't tell, reply: other"""

FEW_SHOT = [
    {"role": "user", "content": "I was charged twice this month"},
    {"role": "assistant", "content": "billing"},
    {"role": "user", "content": "Export to PDF button does nothing"},
    {"role": "assistant", "content": "bug"},
    {"role": "user", "content": "Would love a dark mode"},
    {"role": "assistant", "content": "feature_request"},
]

def classify(text: str) -> str:
    messages = FEW_SHOT + [{"role": "user", "content": text}]
    reply = llm(system=SYSTEM, messages=messages, temperature=0)  # your provider call
    label = reply.strip().lower()
    return label if label in {"billing", "bug", "feature_request", "other"} else "other"
```

Notice the pieces: a role, a closed set of labels, a tie-breaking rule *with its reason*, a fallback, balanced examples covering each label, and code that validates the output instead of trusting it.

Where to put examples: as fake user/assistant turns (as above), or inside the system prompt wrapped in tags like `<example>`. Both work; pick one and be consistent.

## Common mistakes

- Vague instructions like "be helpful" → state the task, audience, format and limits explicitly.
- Rules with no reasons → add a short "because"; the model generalises better to unlisted cases.
- Examples that are all similar → vary length, topic and label, and include an edge case.
- Putting secrets or access rules only in the system prompt → users can often extract or override prompts; enforce permissions in code.
- Piling on rules after every bug → periodically rewrite the prompt so it stays coherent, and re-run your evals.

## Interview angle

Typical question: "How would you write a prompt for a classification feature?" or "What's the difference between system and user messages?"

A strong answer mentions role, context, explicit rules with reasons, a defined output format and fallback, balanced few-shot examples, low temperature, and validating the output in code. Bonus: treating the system prompt as not a security boundary.

Follow-up interviewers like: *"When would you stop adding few-shot examples and do something else?"* When examples get long or numerous enough to hurt cost and latency, or quality stops improving. Then consider retrieving the most similar examples per request, or fine-tuning.
