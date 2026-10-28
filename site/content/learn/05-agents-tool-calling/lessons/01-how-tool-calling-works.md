---
title: How tool calling works
summary: The model never runs your code. It asks for a tool call, your code runs it, and you send the result back.
minutes: 9
practice: [agent-tools-1, agent-tools-2, agent-tools-3]
flow:
  title: One round of tool calling
  steps:
    - label: Send tools + messages
      detail: Your app sends the conversation plus a list of tool definitions (name, description, JSON Schema for the arguments).
    - label: Model decides
      detail: The model either answers in plain text or returns a structured tool call such as get_weather with {"city":"Lahore"}.
    - label: Your code runs the tool
      detail: You validate the arguments, check permissions, and call the real function or API. The model has no direct access to anything.
    - label: Return the result
      detail: You append the tool result as a message linked to the call id, then call the model again.
    - label: Final answer
      detail: When the model has what it needs, it replies in text instead of asking for another tool.
  loop:
    from: 4
    to: 2
    label: Repeat while the model asks for more tools
selfCheck:
  - q: Who actually executes a tool when a model "calls" it?
    options:
      - The model provider's servers
      - Your application code
      - The model itself, inside its weights
    answer: 1
    why: The model only emits a structured request (name + arguments). Your code decides whether and how to run it.
  - q: What tells the model which arguments a tool accepts?
    options:
      - A JSON Schema in the tool definition
      - The function's source code
      - Examples in the system prompt only
    answer: 0
    why: Each tool definition carries a JSON Schema for its parameters. The model fills in arguments that match it (most of the time, so still validate).
  - q: Why does every tool result carry the id of the call it answers?
    options:
      - It is required for billing
      - So the model can match results to calls, especially when it made several at once
      - To encrypt the result
    answer: 1
    why: Models can request several tool calls in one turn. The id links each result to the call that produced it.
---

## Core concepts

A language model only produces text. **Tool calling** (also called *function calling*) is a convention that lets that text be a structured request your program can act on.

Think of the model as a manager on the phone who can't touch a keyboard. They say: "Look up order 4411 for me." You (your code) do the lookup, read the answer back, and they continue the conversation with that new fact.

The pieces:

- **Tool definition**: a name, a plain-language description, and a JSON Schema for the arguments. The description matters a lot, because it's how the model decides *when* to use the tool.
- **Tool call**: the model's output saying "call `get_order` with `{"order_id": "4411"}`". It comes back as a structured field, not prose you have to parse.
- **Tool result**: a message you add to the conversation with the output, linked to the call by an id.
- **Stop reason**: the response tells you whether the model finished or stopped to wait for a tool.

The model can call **zero, one, or several tools** in one turn. Many providers support parallel tool calls, so your loop must handle a list, not a single call.

> [!note] Same idea, different field names
> OpenAI, Anthropic, Google and open-source servers all do this, but the JSON shapes differ (for example `tool_calls` vs `tool_use` content blocks). Frameworks hide these differences; the concept is identical.

## How it works in real systems

A minimal loop using the OpenAI Python SDK's Chat Completions shape. Note that `arguments` arrives as a JSON **string** you must parse.

```python
import json
from openai import OpenAI

client = OpenAI()
tools = [{
    "type": "function",
    "function": {
        "name": "get_order",
        "description": "Look up an order by id. Use when the user asks about an order's status.",
        "parameters": {"type": "object",
                       "properties": {"order_id": {"type": "string"}},
                       "required": ["order_id"]},
    },
}]
messages = [{"role": "user", "content": "Where is order 4411?"}]

while True:
    resp = client.chat.completions.create(model=MODEL, messages=messages, tools=tools)
    msg = resp.choices[0].message
    messages.append(msg)
    if not msg.tool_calls:
        break                                    # plain answer, we're done
    for call in msg.tool_calls:
        args = json.loads(call.function.arguments)   # may be invalid: validate!
        result = get_order(**args)                   # YOUR code runs here
        messages.append({"role": "tool", "tool_call_id": call.id,
                         "content": json.dumps(result)})
print(msg.content)
```

With Anthropic's Messages API the shape differs: tools use `input_schema`, the response has `stop_reason == "tool_use"` and `tool_use` content blocks, and you reply with a user message containing `tool_result` blocks that reference `tool_use_id`.

Production details that matter:

- **Validate arguments** with the same schema (Pydantic, Zod) before running anything. Models sometimes produce wrong types or missing fields.
- **Return errors as results**, not exceptions. `{"error": "order not found"}` lets the model recover ("Could you double-check the number?").
- **Keep results small**. A 2 MB JSON dump fills the context window. Return only the fields the model needs.
- **Authorize in code**. The tool runs with *your* credentials, so check that the current user is allowed to see order 4411.

## Common mistakes

- Vague tool descriptions ("does stuff with orders") → say what it does, when to use it, and what it returns.
- Assuming one tool call per turn → loop over every call in the response.
- Trusting arguments blindly → validate against the schema and check permissions before executing.
- Throwing on tool failure and crashing the request → send the error back as the tool result so the model can adapt.
- Dumping raw API responses into context → trim to the fields that matter.
- No upper bound on the loop → cap the number of iterations (see the guardrails lesson).

## Interview angle

Common question: *"Explain how function calling works end to end."* A strong answer says clearly that **the model does not execute anything**; it emits a structured call, the application validates and runs it, and the result is appended as a message so the model can continue. Mention JSON Schema for arguments, the call id linking results, parallel calls, and that tool output is untrusted input (prompt injection can arrive through a web page or email a tool fetched).

Follow-up interviewers like: *"What happens if the model calls a tool with invalid arguments?"* Answer: validate, return a clear error message as the tool result, let the model retry, and count that against a retry or step limit.
