---
title: GDPR considerations for AI features
summary: The GDPR questions an AI feature raises (lawful basis, minimisation, DPIAs, data subject rights, and processors) and what engineers build to answer them.
minutes: 12
practice: [sec-gdpr-1, sec-gdpr-2, sec-gdpr-3]
flow:
  title: Taking a new AI feature through privacy review
  steps:
    - label: Map the data
      detail: List what personal data the feature uses, where it comes from, where it goes, and every copy it creates.
    - label: State the purpose
      detail: Write down exactly what the processing is for. Using the data to train or improve models is a separate purpose.
    - label: Choose a lawful basis
      detail: With the privacy team, pick the Article 6 basis (for example contract or legitimate interests) and check for special category data.
    - label: Minimise
      detail: Remove fields and history the feature doesn't need, and set retention periods.
    - label: Assess risk (DPIA)
      detail: If the processing is likely to be high risk, run a Data Protection Impact Assessment before launch.
    - label: Sign processor terms
      detail: Put a data processing agreement in place with the model provider and check its sub-processors and transfer mechanism.
    - label: Build rights support
      detail: Make sure access, deletion, correction, and objection requests reach this feature's data.
    - label: Be transparent
      detail: Update the privacy notice to explain the AI processing in plain language.
selfCheck:
  - q: Your company uses an LLM provider's API to process customer support tickets on your behalf. In GDPR terms, what is the provider usually?
    options:
      - A data controller for your customers' data
      - A processor, acting on your instructions under a data processing agreement
      - Not involved in GDPR at all
    answer: 1
    why: When a vendor processes personal data on your behalf and under your instructions, it is typically a processor, and Article 28 requires a contract with specific terms.
  - q: When is a DPIA required?
    options:
      - For every feature that uses any personal data
      - When processing is likely to result in a high risk to people's rights and freedoms, which new technologies and large-scale processing often trigger
      - Only after a data breach
    answer: 1
    why: Article 35 requires a DPIA for likely high-risk processing. Many AI features fall into this, so privacy teams often run one by default.
---

> [!note] Not legal advice
> This lesson is educational. It explains the concepts engineers need in order to work well with legal and privacy teams. For decisions about a real product, ask a qualified privacy professional.

## Core concepts

The **GDPR** (General Data Protection Regulation) applies to processing personal data of people in the EU, and the UK has its own closely matching version. AI features do not get special rules under GDPR; the normal rules apply, but AI makes several of them harder to follow. (The EU AI Act is a separate law with its own obligations, and is not covered here.)

Key roles:

- **Controller**: decides why and how personal data is processed (usually your company).
- **Processor**: processes data on the controller's behalf (for example your model provider, cloud host, or vector database vendor).
- **Sub-processor**: a processor's own vendor (for example the cloud provider your model provider runs on).

The ideas that matter most for AI features:

**Lawful basis (Article 6).** Every processing purpose needs one of six bases: consent, contract, legal obligation, vital interests, public task, or legitimate interests. An AI feature that delivers a service the user asked for often relies on contract or legitimate interests, the latter requiring a documented balancing test. **Special category data** (health, religion, biometrics, and so on) needs an additional condition under Article 9.

**Purpose limitation and data minimisation (Article 5).** Collect data for specified purposes and use only what is adequate, relevant, and necessary. "We'll send the whole customer record to the model in case it helps" conflicts with minimisation. Reusing support chats to train a model is a *new purpose* that needs its own assessment.

**DPIA (Article 35).** A Data Protection Impact Assessment is required when processing is likely to be high risk, for example large-scale processing, systematic monitoring, special category data, or innovative technology. Many AI features meet at least one of these criteria.

**Data subject rights (Articles 15 to 22).** People can ask to access, correct, or erase their data, to restrict processing, to object to it, and to receive it in a portable format. **Article 22** gives people rights around decisions based *solely* on automated processing that have legal or similarly significant effects (for example an AI that rejects a loan with no human involved).

**Processors and transfers (Article 28 and Chapter V).** You need a contract (a data processing agreement, DPA) with each processor, and the processor needs your authorisation to use sub-processors. If data goes outside the EU, a transfer mechanism is needed, such as an adequacy decision or Standard Contractual Clauses.

**Transparency (Articles 13 and 14).** Tell people, in plain language, that and how AI processes their data.

## How it works in real systems

Engineers don't decide the legal basis, but they build what makes compliance real:

- **A data map** of the feature: inputs, outputs, every store, every vendor. This is the input to the DPIA and to the records of processing.
- **Minimisation in code**: select only needed fields before building the prompt.
- **Deletion and access by user ID** across primary stores, vector indexes, caches, and logs.
- **Region and vendor controls**: EU-region endpoints where available and only approved providers.
- **A human in the loop** for decisions with significant effects, so they are not "solely automated".
- **Audit logs** that show what was processed, when, and by which model version.

Minimisation at the prompt-building step:

```ts
// Only what the "suggest a reply" feature needs. No address, DOB, or payment data.
const TicketForPrompt = z.object({
  ticketId: z.string(),
  subject: z.string(),
  body: z.string(),
  productTier: z.enum(['free', 'pro', 'enterprise']),
});

export function buildReplyPrompt(ticket: Ticket) {
  const safe = TicketForPrompt.parse({
    ticketId: ticket.id, subject: ticket.subject,
    body: redactPII(ticket.body), productTier: ticket.customer.tier,
  });
  return `Suggest a helpful reply to this support ticket:\n${JSON.stringify(safe)}`;
}
```

A deletion request handler that reaches derived data:

```python
def erase_user(user_id: str) -> None:
    doc_ids = documents.ids_for_owner(user_id)
    vector_store.delete(filter={"owner_id": user_id})   # chunks + embeddings
    cache.delete_pattern(f"llm:user:{user_id}:*")        # personalised cache entries
    documents.delete_many(doc_ids)
    conversations.delete_for_user(user_id)
    audit_log.record("erasure", user_id=user_id, doc_count=len(doc_ids))
    # Logs and backups: covered by their retention schedule, documented in the DPIA
```

(The store objects stand for your own data-access layer.)

## Common mistakes

- Treating "we use an API, the provider handles GDPR" as the plan → you are usually the controller; you need a DPA, a sub-processor review, and your own lawful basis.
- Sending whole records to the model → select fields explicitly and redact free text.
- Quietly reusing production data for training or evals → treat it as a new purpose and get it reviewed first.
- Erasure that skips embeddings, caches, and eval sets → track lineage by user and document ID.
- Fully automated decisions with significant effects → add meaningful human review, and explain the logic to users.
- Privacy notices that don't mention AI processing → update them when you launch the feature.

## Interview angle

Usually asked as: "We're adding an AI assistant that reads customer tickets. What GDPR issues should engineering raise?"

A strong answer covers:

- Controller vs processor roles, a DPA with the model provider, sub-processors, and international transfers.
- Lawful basis per purpose, and that training on the data is a separate purpose.
- Minimisation in the prompt and retention limits on every copy.
- Whether a DPIA is needed, and the data map engineering contributes to it.
- Supporting data subject rights across derived data, and Article 22 for significant automated decisions.
- Saying clearly that legal calls belong to the privacy team, and engineering provides the facts and controls.

Follow-up interviewers like: "A user asks what data your AI feature holds about them. What can you actually return?" (Everything stored that relates to them: conversations, uploaded documents, and outputs. That is why data needs owner IDs from day one.)
