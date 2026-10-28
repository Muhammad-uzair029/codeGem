---
title: Model Context Protocol (MCP)
summary: MCP is an open standard that lets any AI app plug into tools and data through servers, the way USB lets any laptop use any keyboard.
minutes: 10
practice: [agent-mcp-1, agent-mcp-2, agent-mcp-3]
flow:
  title: An MCP session
  steps:
    - label: Host starts client
      detail: The AI app (the host, e.g. an IDE or chat app) creates one MCP client per server it connects to.
    - label: Initialize
      detail: Client and server exchange protocol versions and capabilities (does the server offer tools, resources, prompts?).
    - label: Discover
      detail: The client calls tools/list, resources/list, or prompts/list to see what the server provides.
    - label: Model picks a tool
      detail: The host passes tool definitions to the model, which emits a tool call.
    - label: tools/call
      detail: The client sends a JSON-RPC tools/call request; the server runs it and returns content.
    - label: Result to model
      detail: The host feeds the result back into the conversation, just like any tool result.
  loop:
    from: 6
    to: 4
    label: Next tool call
selfCheck:
  - q: Which MCP primitive is meant for read-only context the application can attach, like a file or a database schema?
    options:
      - Tools
      - Resources
      - Prompts
    answer: 1
    why: Resources expose data addressed by URI. Tools perform actions; prompts are reusable templates.
  - q: Which transport is typical for a server running as a local subprocess?
    options:
      - stdio
      - Streamable HTTP
      - WebRTC
    answer: 0
    why: Local servers are launched as subprocesses and talk JSON-RPC over stdin/stdout. Remote servers use HTTP.
  - q: What message format does MCP use on the wire?
    options:
      - GraphQL
      - JSON-RPC 2.0
      - Protocol Buffers
    answer: 1
    why: All MCP messages are JSON-RPC 2.0 requests, responses, and notifications.
---

## Core concepts

Before MCP, every AI app wrote its own integration for every tool: a GitHub plugin for app A, another for app B, and so on. That's an *M apps × N tools* problem. The **Model Context Protocol**, an open standard introduced by Anthropic in late 2024 and now supported by many clients, turns it into *M + N*: write a server once, use it from any MCP-capable app.

Analogy: **USB for AI tools**. The laptop (host) doesn't need to know how your keyboard works inside; it speaks USB.

The roles:

- **Host**: the AI application the user interacts with (an IDE, a desktop chat app, your own agent).
- **Client**: a connector inside the host. One client keeps one connection to one server.
- **Server**: a program that exposes capabilities, e.g. a GitHub server, a Postgres server, your company's internal API.

A server can offer three primitives:

| Primitive | What it is | Who's in control |
|---|---|---|
| **Tools** | Functions the model can call (create issue, run query) | The model decides to call them |
| **Resources** | Read-only data addressed by URI (a file, a schema, a doc) | The application chooses what to attach |
| **Prompts** | Reusable prompt templates with arguments (e.g. "review this PR") | The user picks them, often as slash commands |

Clients can offer features back to servers too, such as **sampling** (the server asks the host's model to generate text) and **roots** (which folders the server may work in).

**Transports** (how bytes move):

- **stdio**: the host launches the server as a local subprocess and they exchange JSON-RPC messages over stdin/stdout. Simple, no network, good for local tools.
- **Streamable HTTP**: the server runs as a web service; clients send JSON-RPC over HTTP POST and the server can stream responses. Used for remote, shared servers. It replaced the older HTTP+SSE transport in the 2025 spec revisions, so you may still see "SSE" in older docs.

## How it works in real systems

A small server with the official Python SDK's `FastMCP` helper. Type hints and docstrings become the tool schema and description.

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("orders")

@mcp.tool()
def get_order_status(order_id: str) -> dict:
    """Return the shipping status of an order by its id."""
    return db.fetch_status(order_id)          # your real lookup

@mcp.resource("orders://schema")
def order_schema() -> str:
    """The orders table schema, for context."""
    return open("schema.sql").read()

@mcp.prompt()
def triage_order(order_id: str) -> str:
    return f"Investigate order {order_id}: check status, then suggest next steps."

if __name__ == "__main__":
    mcp.run()                                  # stdio by default
    # mcp.run(transport="streamable-http")     # serve over HTTP instead
```

Under the hood a tool call is a JSON-RPC request:

```json
{"jsonrpc": "2.0", "id": 7, "method": "tools/call",
 "params": {"name": "get_order_status", "arguments": {"order_id": "4411"}}}
```

Production concerns:

- **Security is on you**. A server runs with whatever credentials you give it. Scope tokens narrowly, validate inputs, and treat tool output as untrusted (it can contain prompt-injection text).
- **Remote servers need auth**. The spec defines an OAuth-based authorization flow for HTTP servers; never expose an unauthenticated server that can touch real data.
- **Only install servers you trust**. A malicious server's tool descriptions can try to manipulate the model.
- **Keep the tool list small**. Every connected server adds tool definitions to the context window.

## Common mistakes

- Thinking MCP replaces tool calling → MCP standardizes how tools are *discovered and invoked*; the model still uses normal tool calling.
- Exposing everything as tools → use resources for read-only context and prompts for user-triggered templates.
- Running a remote HTTP server without auth → use the spec's authorization flow and least-privilege tokens.
- Writing logs to stdout in a stdio server → stdout carries protocol messages; log to stderr.
- Installing random community servers with broad permissions → review the code or use trusted sources.

## Interview angle

Typical question: *"What is MCP and why does it matter?"* A strong answer: it's an open protocol (JSON-RPC 2.0) between AI hosts and servers that expose tools, resources, and prompts; it solves the M×N integration problem; transports are stdio for local and Streamable HTTP for remote. Bonus points for naming the security issues: tool poisoning via descriptions, prompt injection through results, and over-privileged tokens.

Follow-up: *"Tools vs resources: when do you use which?"* Tools for actions or queries the model should decide to run; resources for data the app or user chooses to put in context.
