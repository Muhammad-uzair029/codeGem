---
title: The OWASP Top 10 for LLM applications (2025)
summary: A tour of the ten risk categories OWASP lists for LLM apps, what each looks like in a real product, and the main control for each.
minutes: 12
practice: [sec-owasp-1, sec-owasp-2, sec-owasp-3]
flow:
  title: Using the list as a review checklist
  steps:
    - label: Map the system
      detail: Draw the data flow, covering users, prompts, retrieval, tools, model providers, outputs, and logs.
    - label: Walk each category
      detail: For each of the ten risks, ask where it could happen in this specific design.
    - label: Rate the risk
      detail: Estimate impact and likelihood. An agent with payment tools rates higher than a read-only FAQ bot.
    - label: Pick controls
      detail: Choose concrete controls such as least privilege, output encoding, budgets, or provenance checks.
    - label: Test
      detail: Write abuse tests (injection, over-long inputs, poisoned documents) and run them in CI.
    - label: Revisit on change
      detail: Re-run the review when you add a tool, a data source, or a new model.
  loop:
    from: 6
    to: 1
    label: Every significant change
selfCheck:
  - q: An LLM's output is inserted into a web page as raw HTML, and an attacker gets the model to output a script tag. Which category is this?
    options:
      - Improper Output Handling
      - Misinformation
      - Supply Chain
    answer: 0
    why: Passing model output to a browser, shell, or database without validation or encoding is Improper Output Handling. It leads to classic bugs like XSS or injection.
  - q: An agent has a tool that can delete any customer record, although its job only needs read access. Which category describes this?
    options:
      - Unbounded Consumption
      - Excessive Agency
      - System Prompt Leakage
    answer: 1
    why: Excessive Agency covers too much functionality, too many permissions, or too much autonomy given to an LLM-based system.
---

## Core concepts

**OWASP** (the Open Worldwide Application Security Project) is a non-profit known for its web security Top 10. It also publishes a **Top 10 for Large Language Model Applications**. The 2025 edition lists these categories:

1. **LLM01: Prompt Injection.** Inputs (direct or indirect) that change the model's behaviour in ways you didn't intend.
2. **LLM02: Sensitive Information Disclosure.** The app reveals personal data, secrets, or confidential business data through model output, for example by retrieving documents the user should not see.
3. **LLM03: Supply Chain.** Risks from third-party models, datasets, fine-tuning adapters, libraries, and plugins you depend on.
4. **LLM04: Data and Model Poisoning.** Training, fine-tuning, or embedding data is manipulated to plant backdoors, biases, or wrong behaviour.
5. **LLM05: Improper Output Handling.** Model output is passed to other systems (browser, shell, SQL, APIs) without validation, sanitisation, or encoding.
6. **LLM06: Excessive Agency.** The LLM has too much functionality, too many permissions, or too much autonomy, so a mistake or manipulation causes real harm.
7. **LLM07: System Prompt Leakage.** System prompts are exposed, which matters most when developers put secrets or security logic in them.
8. **LLM08: Vector and Embedding Weaknesses.** Problems in how embeddings and vector stores are built and queried, such as missing access control across tenants, poisoned documents in the index, or data leaking via embeddings.
9. **LLM09: Misinformation.** The model produces false or misleading content that looks credible (hallucinations), and people or systems rely on it.
10. **LLM10: Unbounded Consumption.** Uncontrolled use of the model, leading to denial of service, runaway costs ("denial of wallet"), or model extraction through mass querying.

Think of it as a pre-flight checklist rather than a scoring system. Its value is making sure you asked each question about your design.

Many categories are old ideas in new places. Improper Output Handling is the LLM version of "never trust user input": model output is effectively user-influenced input. Unbounded Consumption is rate limiting and quotas. Supply Chain is dependency hygiene, now including model files and datasets.

## How it works in real systems

Here is what each category looks like in a typical RAG plus agent product, with the main control:

| Category | Realistic example | Main control |
|---|---|---|
| Prompt Injection | Uploaded PDF tells the agent to email data out | Least privilege, approvals, argument validation |
| Sensitive Information Disclosure | Bot answers with another customer's order details | Authorization checks before retrieval, redaction |
| Supply Chain | Unvetted open model or plugin with hidden behaviour | Trusted sources, pinned versions, review, inventory |
| Data and Model Poisoning | Attacker edits a wiki page that gets indexed | Source allow-lists, provenance, review of ingested data |
| Improper Output Handling | Model output rendered as HTML (XSS) or run as SQL | Encode output, parameterised queries, sandboxing |
| Excessive Agency | Support agent can issue unlimited refunds | Minimal tools, scoped permissions, human approval |
| System Prompt Leakage | API key or "admin password" written in the prompt | No secrets in prompts; enforce rules in code |
| Vector and Embedding Weaknesses | Shared index returns chunks across tenants | Per-tenant filters or indexes, access metadata |
| Misinformation | Bot invents a refund policy | Grounding with citations, evals, clear UI disclaimers |
| Unbounded Consumption | Script sends huge prompts in a loop | Rate limits, input size caps, budgets, max_tokens |

Improper Output Handling in code. Model output is untrusted, so never pass it straight to a sink:

```ts
// Bad: model text becomes SQL
await db.query(`SELECT * FROM orders WHERE status = '${llmOutput.status}'`);

// Better: parse into a strict shape, then use parameters
const Filter = z.object({ status: z.enum(['open', 'shipped', 'refunded']) });
const { status } = Filter.parse(JSON.parse(llmOutput));
await db.query('SELECT * FROM orders WHERE status = $1 AND customer_id = $2', [status, user.id]);
```

Vector and Embedding Weaknesses in code. Filter by access *in the query*, not after:

```python
results = vector_store.search(
    query_vector=embed(question),
    top_k=5,
    filter={"tenant_id": user.tenant_id, "allowed_groups": {"$in": user.groups}},
)
```

(`vector_store` stands for your vector database client; most support metadata filters like this.)

> [!tip] Read the source
> The OWASP GenAI Security Project site has the full text for each category, with example attack scenarios and mitigations. It is worth reading the descriptions for Excessive Agency and Improper Output Handling in full before an interview.

## Common mistakes

- Treating the list as only "prompt injection plus nine others" → most real incidents come from Excessive Agency, Sensitive Information Disclosure, and Improper Output Handling around the injection.
- Filtering retrieved documents after the model has seen them → enforce access control in the retrieval query.
- Putting secrets or authorization rules in the system prompt → assume the prompt leaks; keep secrets and rules in code.
- Ignoring cost as a security issue → rate limits, input caps, and budgets defend against Unbounded Consumption.
- Downloading models and adapters from anywhere → use trusted sources, pin versions, and track what you run.
- Doing the review once → repeat it whenever you add a tool, data source, or model.

## Interview angle

Usually asked as: "Are you familiar with the OWASP Top 10 for LLMs? Which risks matter most for our product?"

A strong answer covers:

- Naming several categories correctly and explaining them in plain words.
- Mapping them to the specific product (an agent with tools has very different top risks from a read-only chatbot).
- Concrete controls for each, mostly in code and architecture rather than prompt wording.
- Seeing the overlap with classic AppSec: output handling is injection, consumption is rate limiting, supply chain is dependency hygiene.

Follow-up interviewers like: "Which category would you fix first for an agent that can send emails and read a shared drive?" (Excessive Agency and Sensitive Information Disclosure: cut tools and permissions to the minimum and add approval for external sends, because that caps the damage of every other attack, including injection.)
