---
title: Queues and background jobs for long AI tasks
summary: Move slow AI work (document processing, batch generation, agent runs) out of the request path with a job queue such as BullMQ on Redis.
minutes: 11
practice: [prod-queue-1, prod-queue-2, prod-queue-3]
flow:
  title: A long AI task through a job queue
  steps:
    - label: Request accepted
      detail: The API validates input, stores it, adds a job to the queue, and returns 202 with a job id in milliseconds.
    - label: Job waits in Redis
      detail: The job sits in the queue until a worker is free. Bursts of traffic pile up here instead of crashing the API.
    - label: Worker picks it up
      detail: A separate worker process takes the job and calls the model, tools, or embedding API.
    - label: Progress reported
      detail: The worker updates job progress so the UI can show "chunk 12 of 40".
    - label: Retry on failure
      detail: Timeouts or 429s fail the attempt; the queue retries with exponential backoff up to a set number of attempts.
    - label: Result saved
      detail: The worker writes the result to the database and marks the job complete.
    - label: Client notified
      detail: The client learns the job is done by polling, an SSE progress stream, or a webhook.
  loop:
    from: 5
    to: 3
    label: Retry with backoff
selfCheck:
  - q: Why return 202 Accepted with a job id instead of holding the HTTP request open for a 3-minute AI task?
    options:
      - 202 responses are cheaper for the LLM provider
      - Long-held requests hit timeouts at proxies and load balancers and are lost if the server restarts
      - HTTP does not allow responses that take longer than 30 seconds
    answer: 1
    why: Intermediate hops have idle timeouts and a deploy kills in-flight requests. A queued job survives both and can be retried.
  - q: A job sends an email after generating a summary. It failed after sending the email and is retried. What property should the job have?
    options:
      - It should be idempotent, so a retry does not send the email twice
      - It should have a higher priority
      - It should run with concurrency 1
    answer: 0
    why: Queues give at-least-once execution. Design each step so running it twice is safe, for example by recording that the email was sent.
---

## Core concepts

Some AI work is too slow for a normal request. Summarising a 200-page PDF, embedding a whole knowledge base, or letting an agent run 30 tool calls can take minutes. HTTP requests are a bad home for that work:

- Load balancers and proxies close idle connections.
- A deploy or crash kills every request in flight, and the work is lost.
- A traffic spike means hundreds of slow requests holding server resources at once.

A **job queue** fixes this. Think of a restaurant ticket rail. The waiter (your API) writes a ticket and pins it up right away. The cooks (workers) take tickets when they are free. If ten tables order at once, tickets wait on the rail. Nobody stands at the counter for 20 minutes.

Key terms:

- **Producer**: code that adds jobs (your API).
- **Worker** (consumer): a separate process that runs jobs.
- **Concurrency**: how many jobs one worker runs at the same time.
- **Retries with backoff**: try again after a delay that grows each time (1s, 2s, 4s...).
- **Dead letter / failed set**: where jobs go after their last attempt fails, so a human can inspect them.
- **Idempotency**: running a job twice has the same effect as running it once. Queues usually guarantee *at-least-once* execution, so this matters.

**BullMQ** is a popular Node.js queue built on Redis. Redis holds the jobs and their state; workers can run on any number of machines.

## How it works in real systems

With NestJS, the `@nestjs/bullmq` package wires BullMQ into dependency injection. The producer adds a job with retry options and a `jobId` for de-duplication (adding a job whose id already exists is ignored).

```ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class DocsService {
  constructor(@InjectQueue('ai-docs') private queue: Queue) {}

  async requestSummary(docId: string) {
    const job = await this.queue.add('summarize', { docId }, {
      jobId: `summarize:${docId}`,          // same doc twice = one job
      attempts: 4,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,               // keep the last 1000 for debugging
      removeOnFail: 5000,
    });
    return { jobId: job.id, status: 'queued' }; // controller returns 202
  }
}
```

The worker lives in its own process (often its own container) so slow jobs never compete with API requests for CPU or memory.

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('ai-docs', { concurrency: 5 })
export class SummarizeWorker extends WorkerHost {
  constructor(private docs: DocsRepo, private llm: LlmService) { super(); }

  async process(job: Job<{ docId: string }>) {
    const chunks = await this.docs.chunks(job.data.docId);
    const partials: string[] = [];
    for (const [i, chunk] of chunks.entries()) {
      partials.push(await this.llm.summarize(chunk));
      await job.updateProgress(Math.round(((i + 1) / chunks.length) * 100));
    }
    const summary = await this.llm.combine(partials);
    await this.docs.saveSummary(job.data.docId, summary); // upsert: safe to repeat
    return { length: summary.length };
  }
}
```

The client then polls `GET /jobs/:id` (simple, works everywhere), subscribes to an SSE progress stream, or receives a webhook when the job ends.

Things production teams add:

- **Rate limiting at the worker.** BullMQ workers accept a `limiter` option (max jobs per duration), which helps you stay under a provider's request limits.
- **Separate queues by priority.** Interactive "user is waiting" jobs should not sit behind a nightly batch of 50,000 embeddings.
- **Checkpoints.** Save partial results (for example each chunk summary) so a retry resumes instead of starting over and paying again.
- **Alerts on the failed set.** A growing failed set is often the first sign that a provider changed something.

> [!note] Redis connection setting
> BullMQ workers use blocking Redis commands. With ioredis, BullMQ expects `maxRetriesPerRequest: null` on worker connections. Check the BullMQ docs for your version when you set up connections.

## Common mistakes

- Running long AI calls inside the HTTP handler "with a big timeout" → enqueue and return a job id.
- Running workers in the same process as the API → run them separately so you can scale and deploy them independently.
- Non-idempotent jobs (double emails, double charges) → use upserts, store "already done" markers, and use `jobId` to de-duplicate.
- Retrying everything, including bad input → retry transient errors (timeouts, 429, 5xx); fail fast on validation errors.
- Retrying a 30-step job from step 1 → checkpoint progress so retries are cheap.
- No visibility → watch queue depth, job age, and failed counts; a dashboard such as Bull Board helps.

## Interview angle

Usually asked as: "Users upload large documents to be analysed by an LLM. Design the backend." or "How do you handle AI tasks that take minutes?"

A strong answer covers:

- Accept quickly (202 + job id), process in workers, store results, notify the client.
- Retries with exponential backoff for transient failures, and a failed set for the rest.
- At-least-once delivery, hence idempotent steps and de-duplication.
- Concurrency and rate limits tuned to the provider's limits, plus separate queues for interactive vs batch work.
- How the user sees progress (polling, SSE, webhook) and what happens on a deploy mid-job.

Follow-up interviewers like: "A worker crashes in the middle of a job. What happens to it?" (BullMQ detects stalled jobs, whose lock expired, and moves them back to waiting to be retried, so the job must be safe to run again.)
