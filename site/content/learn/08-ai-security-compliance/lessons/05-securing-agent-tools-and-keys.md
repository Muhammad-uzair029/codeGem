---
title: Securing tool access and API keys for agents
summary: Give agents only the access they need, keep secrets out of prompts, and put a human in front of risky actions.
minutes: 11
practice: [sec-tools-1, sec-tools-2, sec-tools-3]
flow:
  title: A guarded tool call
  steps:
    - label: Model proposes a call
      detail: The model returns a tool name and arguments. This is a request, not a command.
    - label: Validate arguments
      detail: Code parses the arguments against a strict schema and rejects anything malformed or out of range.
    - label: Authorise as the user
      detail: Check that this user is allowed to do this action on this resource. The agent never has more rights than the user.
    - label: Risk check
      detail: Low-risk reads run automatically. Writes, external sends, payments, and deletes go to human approval.
    - label: Get a scoped credential
      detail: The executor fetches a short-lived, narrowly scoped token from a secret store. The model never sees it.
    - label: Execute and log
      detail: Run the action and write an audit log entry with user, tool, arguments, and result.
    - label: Return the result
      detail: Send the result back to the model as untrusted data, trimmed to what the task needs.
selfCheck:
  - q: Where should the API key for a tool the agent uses live?
    options:
      - In the system prompt, so the model can include it in tool calls
      - In a secret store, loaded by the server-side tool executor and never shown to the model
      - In the user's browser local storage
    answer: 1
    why: Anything in the prompt can leak through output, logs, or injection. The executor attaches credentials after the model has decided what to call.
  - q: An agent acts for a user who can only see their own team's tickets. The agent's service account can read all tickets. What is the problem?
    options:
      - There is no problem, the model will only fetch the right tickets
      - The agent can be tricked into reading tickets the user is not allowed to see; authorisation should be checked as the user
      - The service account should also be able to write tickets
    answer: 1
    why: This is the confused deputy problem. The tool layer should enforce the user's permissions, ideally with a credential scoped to that user.
---

## Core concepts

An agent is an LLM that can call **tools**: functions that search, read files, send emails, run code, or call APIs. Tools turn a chatbot into something that acts. They also turn a prompt injection or a model mistake into a real-world incident.

The guiding principle is **least privilege**: every component gets the minimum access needed for its job, for the shortest time. Think of a hotel key card. A guest's card opens their room and the gym, only during their stay. You would not hand every guest the master key just because it is easier.

Core rules:

- **The agent never has more access than the user it acts for.** Otherwise anyone who can chat with it can borrow its extra powers. This is called the **confused deputy** problem: a trusted component is tricked into using its authority for someone else.
- **Scoped, short-lived credentials.** Prefer OAuth tokens with narrow scopes, or temporary cloud credentials (for example from AWS STS), over long-lived all-powerful keys.
- **Secrets never go in prompts.** The model doesn't need your API key to decide *what* to do. The server-side executor adds credentials *after* the model has chosen an action. Anything in a prompt can show up in output, logs, traces, or a leaked system prompt.
- **Human approval for risky tools.** Classify tools by risk. Reads can run automatically; sending messages outside the company, moving money, deleting data, or changing permissions should pause for a person to confirm.
- **Audit everything.** Log who triggered what, with which arguments, and what happened.

## How it works in real systems

A tool registry with risk levels, schema validation, and authorisation, so policy is enforced by code, not by the model:

```ts
type Risk = 'read' | 'write' | 'dangerous';
const TOOLS = {
  search_tickets: { risk: 'read' as Risk, args: z.object({ query: z.string().max(200) }) },
  refund_order: { risk: 'dangerous' as Risk, args: z.object({ orderId: z.string(), amount: z.number().positive().max(500) }) },
};

export async function runTool(name: string, rawArgs: unknown, user: User) {
  const tool = TOOLS[name as keyof typeof TOOLS];
  if (!tool) throw new ToolError(`Unknown tool ${name}`);
  const args = tool.args.parse(rawArgs);                       // 1. validate
  await authz.assertAllowed(user, name, args);                 // 2. as the user
  if (tool.risk === 'dangerous') {
    return approvals.request({ userId: user.id, tool: name, args }); // 3. pause
  }
  const token = await tokens.forUser(user.id, scopesFor(name)); // 4. scoped, short-lived
  const result = await handlers[name](args, token);
  await audit.log({ userId: user.id, tool: name, args, ok: true });
  return truncate(result, 4_000);                              // 5. untrusted, trimmed
}
```

Loading a secret at runtime from a secret manager instead of hard-coding it (here AWS Secrets Manager with the AWS SDK):

```ts
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const sm = new SecretsManagerClient({});
let cached: { value: string; at: number } | undefined;

export async function getCrmApiKey() {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value; // short in-memory cache
  const res = await sm.send(new GetSecretValueCommand({ SecretId: 'prod/crm/api-key' }));
  cached = { value: res.SecretString!, at: Date.now() };
  return cached.value;
}
```

More controls teams add:

- **Egress allow-lists**: a "fetch URL" tool can only reach approved domains, which blocks both data exfiltration and server-side request forgery (SSRF) into your internal network.
- **Sandboxed code execution**: run model-written code in an isolated container or VM with no network and no secrets.
- **Per-tool rate limits and spend caps**: an agent loop cannot issue 500 refunds in a minute.
- **Third-party tool servers** (for example MCP servers) are supply-chain dependencies: review them, pin versions, and grant them only the scopes they need.
- **Clear approval UIs**: show the human exactly what will happen ("Refund $120 on order #8812 to card ending 4242"), not a vague "Allow action?".

> [!tip] Design for "the model was fooled"
> Ask of every tool: if an attacker fully controlled the model's next tool call, what is the worst outcome? If the answer is unacceptable, narrow the tool, scope its credential, or add approval.

## Common mistakes

- One admin API key shared by all tools and users → per-user, per-tool scoped tokens with short lifetimes.
- Putting keys or connection strings in the system prompt or tool descriptions → keep secrets in the executor and the secret store.
- Letting the model decide what needs approval → classify risk in code, per tool and per argument (for example refunds above a set amount).
- Approval prompts that hide details → show the exact action, target, and amount.
- Returning huge raw tool outputs to the model → trim to what's needed; large outputs cost tokens and widen the injection surface.
- Generic tools like "run any SQL" or "call any URL" → narrow, purpose-built tools with typed arguments.
- No audit trail → log every tool call with user, arguments, approval, and outcome.

## Interview angle

Usually asked as: "How would you secure an AI agent that can take actions in our systems?" or "Where do the API keys go?"

A strong answer covers:

- Least privilege and acting with the user's permissions (no confused deputy).
- Secrets in a secret store, attached by the server-side executor, never in prompts.
- Strict argument validation and authorisation checks in code for every call.
- Risk tiers with human approval for dangerous actions, and clear approval UIs.
- Egress control, sandboxing, rate limits, and audit logs.

Follow-up interviewers like: "How do you keep approvals from becoming rubber stamps?" (Approve only what is genuinely risky so prompts stay rare, show precise details, use thresholds such as amount limits, and review approval logs for patterns.)
