---
title: PII detection, redaction, and data retention
summary: Find personal data in prompts and documents, remove or mask it before it spreads, and decide how long every copy is kept.
minutes: 11
practice: [sec-pii-1, sec-pii-2, sec-pii-3]
flow:
  title: Handling PII in an AI request
  steps:
    - label: Classify the input
      detail: Detect PII with rules (emails, phone numbers, card numbers) plus an entity recognition model (names, addresses).
    - label: Decide per field
      detail: Drop what the task doesn't need, mask what it might need as a placeholder, and keep only what is essential.
    - label: Pseudonymise
      detail: Replace values like names with placeholders such as PERSON_1 and keep the mapping server-side.
    - label: Call the model
      detail: The provider sees placeholders instead of the real values.
    - label: Restore if needed
      detail: Swap placeholders back into the answer before showing it to the authorised user.
    - label: Log the redacted version
      detail: Logs, traces, and eval datasets store the redacted text with a short retention period.
    - label: Expire and delete
      detail: Retention jobs delete old data everywhere it was copied, including caches, vector stores, and backups on their cycle.
selfCheck:
  - q: Why combine regular expressions with an ML-based entity recogniser for PII detection?
    options:
      - Regexes are good for structured patterns like emails and card numbers, while models catch free-form entities like names and addresses
      - Regexes are illegal under GDPR
      - ML models are always 100% accurate so regexes are only a backup
    answer: 0
    why: Each covers the other's blind spots. Neither is perfect, so you also tune and test on your own data.
  - q: A user asks you to delete their data. Their documents were chunked and embedded into a vector store. What do you need to delete?
    options:
      - Only the original uploaded files
      - The originals plus every derived copy, including chunks, embeddings, caches, logs, and any eval or fine-tuning sets that contain them
      - Nothing, embeddings are not personal data
    answer: 1
    why: Derived data can still contain or reveal personal data. Track lineage so deletion reaches every copy.
---

## Core concepts

**PII** (personally identifiable information) is any data that identifies a person directly (name, email, phone, ID number) or indirectly when combined with other data (address plus date of birth). Under GDPR the broader term is **personal data**, and some types are **special category** data (health, religion, biometrics, and others) with stricter rules.

AI features are PII magnets. Users paste emails, contracts, and medical notes into chat boxes. And AI systems copy data everywhere:

- the prompt sent to a model provider,
- application logs and tracing tools,
- answer caches and semantic caches,
- chunks and embeddings in a vector store,
- eval datasets and fine-tuning sets built from "real examples".

Think of PII like glitter. Once it gets into a system it spreads to every corner, and cleaning up later is much harder than keeping it contained.

Three tools help:

- **Detection**: finding PII. Rules (regular expressions with checks like the Luhn checksum for card numbers) work for structured data. Named-entity recognition (NER) models find names, places, and organisations in free text.
- **Redaction**: removing or masking values, for example `[EMAIL]`.
- **Pseudonymisation**: replacing values with consistent placeholders (`PERSON_1`) and keeping the mapping separately, so you can restore the originals later. Note that pseudonymised data is still personal data under GDPR, because it can be re-linked.

**Retention** is the other half: decide how long each copy lives, and make sure deletion actually happens.

## How it works in real systems

Microsoft **Presidio** is an open-source Python toolkit that combines rules and NER for detection and anonymisation:

```python
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

text = "Hi, I'm Jane Smith, reach me at jane.smith@example.com or +44 20 7946 0958."
findings = analyzer.analyze(text=text, language="en")
redacted = anonymizer.anonymize(text=text, analyzer_results=findings)

print(redacted.text)
# Placeholders such as <PERSON> and <EMAIL_ADDRESS> replace the detected values
```

When the task needs the values back (for example drafting a reply that uses the customer's name), pseudonymise and restore. A simplified version for illustration:

```ts
export function pseudonymise(text: string, entities: { start: number; end: number; type: string }[]) {
  const map = new Map<string, string>();
  const counters: Record<string, number> = {};
  let out = text;
  for (const e of [...entities].sort((a, b) => b.start - a.start)) { // replace from the end
    const value = text.slice(e.start, e.end);
    const placeholder = `${e.type}_${(counters[e.type] = (counters[e.type] ?? 0) + 1)}`;
    map.set(placeholder, value);
    out = out.slice(0, e.start) + placeholder + out.slice(e.end);
  }
  return { out, map }; // keep `map` server-side, never send it to the model
}

export const restore = (text: string, map: Map<string, string>) =>
  [...map].reduce((t, [ph, v]) => t.replaceAll(ph, v), text);
```

(A production version would give repeated mentions of the same value the same placeholder.)

**Retention in practice:**

- Write a retention table: each data store, what it holds, how long, and who deletes it.
- Use TTLs where the store supports them (Redis `EX`, object storage lifecycle rules, log retention settings).
- Store document IDs and owner IDs on every chunk and embedding so you can delete by user.
- Check your model provider's data retention and training terms. Many providers state whether API data is used for training and how long it is kept, and some offer reduced or zero retention options under specific agreements. Read the current terms for your account.
- Keep eval and fine-tuning datasets redacted, or treat them as personal data with the same rules.

> [!warning] Detection is never perfect
> PII detectors miss things (unusual name formats, IDs from other countries) and flag things wrongly. Measure recall on samples of your real data, and combine redaction with access control and retention rather than relying on it alone.

## Common mistakes

- Logging full prompts and responses forever "for debugging" → log redacted text, sample if you can, and set short retention.
- Redacting the prompt but not the cache, traces, or vector store → map every copy and apply the same rules.
- Building eval sets by copying production conversations → redact first, or get the right basis and controls for keeping them.
- Treating pseudonymised data as anonymous → it is still personal data if it can be re-linked; protect the mapping.
- Embedding documents without owner metadata → store owner and document IDs so deletion requests can be met.
- Assuming the provider's default retention terms → read the current terms and configure what your account allows.

## Interview angle

Usually asked as: "Users will paste customer data into our AI assistant. How do you handle PII?" or "How do you support deleting a user's data in a RAG system?"

A strong answer covers:

- Data mapping: every place data is copied (provider, logs, caches, vector store, evals).
- Minimisation first: don't collect or send what the task doesn't need.
- Detection with rules plus NER, redaction or pseudonymisation, and the trade-offs of each.
- Retention periods per store, TTLs, and deletion that reaches derived data like embeddings.
- Provider terms on training and retention as part of vendor review.

Follow-up interviewers like: "The model needs the customer's name to write a good reply. Can you still avoid sending it?" (Pseudonymise: send `PERSON_1`, restore the real name in the answer server-side. Or decide that the name is necessary, document that, and rely on the provider's processing terms.)
