---
title: "Structured output: JSON and XML tags"
summary: Get output your code can parse reliably, and use tags to keep instructions and data apart.
minutes: 8
practice: [prompt-struct-1, prompt-struct-2, prompt-struct-3]
flow:
  title: Reliable structured output
  steps:
    - label: Define a schema
      detail: Describe the exact fields and types once, e.g. with Zod or Pydantic.
    - label: Request it
      detail: Use the provider's schema-constrained output mode if available, or describe the schema in the prompt.
    - label: Parse
      detail: Parse the text as JSON. Check the stop reason first so you don't parse truncated output.
    - label: Validate
      detail: Validate against the schema - types, required fields, allowed values.
    - label: Retry or fail safely
      detail: On failure, retry once with the validation error in the prompt, then fall back.
  loop:
    from: 5
    to: 2
    label: Retry with the error message
selfCheck:
  - q: Why wrap a pasted document in tags like <document>...</document>?
    options:
      - Tags make the model faster
      - They clearly separate data from instructions
      - The API requires XML
    answer: 1
    why: Tags show where instructions end and data begins, which reduces confusion and helps against injected instructions inside the data.
  - q: Your provider supports schema-constrained JSON output. Do you still need validation in code?
    options:
      - No, never
      - Yes - check business rules, truncation and refusals the schema can't cover
    answer: 1
    why: A schema guarantees shape, not correctness. Values can still be wrong, and responses can still be cut off or refused.
  - q: In a JSON answer that includes reasoning and a final verdict, which field order is better?
    options:
      - Verdict first, then reasoning
      - Reasoning first, then verdict
    answer: 1
    why: The model writes in order. Reasoning first lets the verdict build on it; verdict first means the reasoning just justifies a guess.
---

## Core concepts

When code consumes the model's output, "mostly right" isn't good enough. A missing quote breaks `JSON.parse` and your feature goes down. **Structured output** means getting answers in a predictable, machine-readable shape.

Two tools, two jobs:

- **JSON** for *output* your code parses. Define the fields, types and allowed values.
- **XML-style tags** for *organising the prompt*. Wrap each part in a named tag: `<instructions>`, `<document>`, `<examples>`. It's like labelled folders on a desk: the model can tell which part is the rule and which part is the material. Tags are also handy in output when you want sections, e.g. `<analysis>` and `<answer>`.

Ways to get reliable JSON, from weakest to strongest:

1. **Ask in the prompt**, with the schema and an example. Works often, fails sometimes.
2. **JSON mode**: the provider guarantees valid JSON, but not your specific fields.
3. **Schema-constrained output / structured outputs**: you pass a JSON Schema, and the provider constrains generation to match it. Many major providers now offer this; check what your model supports.
4. **Tool (function) calling**: you define a "tool" whose input schema is the shape you want; the model's tool call arguments are your structured data.

Whatever you use, **validate in code**. A schema guarantees shape, not truth.

## How it works in real systems

```ts
import { z } from "zod";

const Ticket = z.object({
  category: z.enum(["billing", "bug", "feature_request", "other"]),
  urgency: z.number().int().min(1).max(5),
  summary: z.string().max(200),
});
type Ticket = z.infer<typeof Ticket>;

export async function extractTicket(email: string, attempts = 2): Promise<Ticket> {
  let feedback = "";
  for (let i = 0; i < attempts; i++) {
    const text = await llm({                         // your provider call
      system: "Extract a support ticket. Reply with JSON only: " +
              '{"category": ..., "urgency": 1-5, "summary": "..."}',
      user: `<email>\n${email}\n</email>${feedback}`,
    });
    try {
      return Ticket.parse(JSON.parse(text));
    } catch (err) {
      feedback = `\n\nYour last reply was invalid: ${String(err)}. Return corrected JSON only.`;
    }
  }
  throw new Error("Could not extract a valid ticket");
}
```

In Python the same pattern uses Pydantic: `Ticket.model_validate_json(text)`.

Production tips:

- **Check the stop reason before parsing.** Truncated JSON is the most common "random" parse failure.
- **Keep schemas small and flat.** Deeply nested, optional-heavy schemas raise error rates.
- **Use enums** for categories instead of free text.
- **Allow an explicit "unknown"** value so the model isn't forced to invent one.
- **Escape or tag user content.** Put untrusted text inside a tag and tell the model that text is data, not instructions.

## Common mistakes

- `JSON.parse` on raw output with no validation → validate with a schema and handle failure.
- Asking for JSON *and* friendly prose in the same reply → ask for JSON only, or use separate tags and extract the one you need.
- Required fields the input may not contain → make them nullable or add an "unknown" option so the model doesn't fabricate.
- Putting the verdict before the reasoning in the schema → order fields so reasoning comes first if you need both.
- Mixing instructions and pasted data without separators → wrap data in tags and refer to them by name.

## Interview angle

Typical question: "How do you get reliable JSON out of an LLM?"

A strong answer lists the options (prompt + example, JSON mode, schema-constrained output, tool calling), insists on schema validation in code, handles truncation via the stop reason, retries with the error message, and fails safely. Mentioning tags to separate untrusted data shows security awareness.

Follow-up interviewers like: *"Schema-constrained output guarantees valid JSON. So what can still go wrong?"* Wrong values, made-up data for required fields, refusals, truncation at the token limit, and schema features the provider doesn't support.
