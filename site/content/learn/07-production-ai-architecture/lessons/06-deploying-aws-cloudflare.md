---
title: "Deploying AI services: AWS and Cloudflare trade-offs"
summary: Choose between Bedrock, Lambda, and ECS on AWS, or Workers, Workers AI, and AI Gateway on Cloudflare, based on what your AI workload actually needs.
minutes: 11
practice: [prod-deploy-1, prod-deploy-2, prod-deploy-3]
flow:
  title: Picking a home for each part of an AI feature
  steps:
    - label: Split the workload
      detail: "Separate the pieces: chat API with streaming, background jobs, model access, vector storage."
    - label: Model access
      detail: Call a provider API directly, go through a cloud-hosted model service (Bedrock, Workers AI), or self-host.
    - label: Request-path compute
      detail: Short, bursty requests suit functions (Lambda, Workers). Long-lived streams and heavy SDKs suit containers (ECS).
    - label: Background compute
      detail: Long jobs go to containers or queue-driven workers, not to a function that has an execution time cap.
    - label: Gateway layer
      detail: Optionally route provider calls through a gateway (AI Gateway or your own) for logging, caching, and rate limits.
    - label: Check constraints
      detail: Confirm data residency, network isolation, compliance needs, and current platform limits in the docs.
selfCheck:
  - q: A team wants its LLM traffic to stay inside its AWS account boundary with IAM-based access control. Which option fits best?
    options:
      - Amazon Bedrock
      - A Cloudflare Worker calling a public API with an API key
      - Running the model in the browser
    answer: 0
    why: Bedrock is AWS's managed model service. Access is controlled with IAM, and it can be reached privately from a VPC.
  - q: What does Cloudflare AI Gateway do?
    options:
      - It trains models on your data
      - It is a proxy in front of AI providers that adds logging, analytics, caching, rate limiting, and fallbacks
      - It replaces your vector database
    answer: 1
    why: AI Gateway sits between your app and providers. You change the base URL and get observability and control features.
---

## Core concepts

"Where do we deploy?" is really several smaller questions. An AI feature usually has:

1. **Model access**: who runs the model.
2. **A request path**: the API that receives the user's message and streams the answer.
3. **Background work**: ingestion, embeddings, long agent runs.
4. **Data**: databases, vector stores, caches.

Each piece can live somewhere different. Here are the main options on two popular platforms.

**AWS**

- **Amazon Bedrock**: managed access to foundation models from several model providers through AWS APIs. You authenticate with IAM roles instead of a separate vendor API key, billing goes through AWS, and you can reach it privately from a VPC. Good when your company already lives in AWS and cares about governance. Trade-off: model availability varies by region, and new models may appear on a provider's own API before they reach Bedrock.
- **AWS Lambda**: functions that scale to zero and bill per invocation. Great for event-driven glue and short requests. Trade-offs: cold starts, a maximum execution time (15 minutes at the time of writing), and streaming responses need a supported setup (Lambda response streaming), so check the docs before planning SSE on Lambda.
- **Amazon ECS** (often on Fargate): long-running containers. A natural home for a NestJS API that holds SSE connections, and for BullMQ workers. Trade-offs: you pay while containers run, and you manage scaling policies, load balancer timeouts, and deploys.

**Cloudflare**

- **Workers**: code running in lightweight isolates across Cloudflare's network, close to users, with very fast startup. Good for API edges, auth, routing, and streaming proxies. Trade-off: it is not a full Node.js server. There are CPU-time and memory limits and partial Node API compatibility, so heavy SDKs or native modules may not work.
- **Workers AI**: run a catalogue of open models on Cloudflare's GPUs from a Worker, with no GPU servers of your own. Good for embeddings, classification, and smaller generation tasks near the user. Trade-off: the catalogue is open models chosen by Cloudflare, so the top proprietary models are accessed elsewhere.
- **AI Gateway**: a proxy you put in front of AI providers (OpenAI, Anthropic, Workers AI, and others). You get request logs, analytics, caching, rate limiting, retries, and fallbacks by changing the base URL. It works whether or not the rest of your app runs on Cloudflare.

> [!warning] Limits change
> Timeouts, payload sizes, CPU limits, and model catalogues change regularly. Treat any number you remember as a hint and check the current docs before you commit to an architecture.

## How it works in real systems

Calling a model through Bedrock with the AWS SDK's Converse API, which uses one request shape across Bedrock models:

```ts
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION }); // IAM role creds

export async function ask(prompt: string) {
  const res = await bedrock.send(new ConverseCommand({
    modelId: process.env.BEDROCK_MODEL_ID!, // from config; availability varies by region
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 512 },
  }));
  return { text: res.output?.message?.content?.[0]?.text ?? '', usage: res.usage };
}
```

For streaming there is a matching `ConverseStreamCommand`.

A Cloudflare Worker using the Workers AI binding (configured in your Wrangler config). The model name comes from an environment variable so you can switch models without code changes.

```ts
export interface Env { AI: Ai; MODEL: string }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { question } = await request.json<{ question: string }>();
    const result = await env.AI.run(env.MODEL, {
      messages: [{ role: 'user', content: question }],
    });
    return Response.json(result);
  },
};
```

Using AI Gateway with an existing provider SDK only changes the base URL:

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: `https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/${GATEWAY_ID}/openai`,
});
```

Common shapes that work well:

- **All-AWS**: Next.js frontend, NestJS API on ECS behind a load balancer (idle timeout raised for SSE), BullMQ workers on ECS with ElastiCache Redis, Bedrock for models.
- **Edge-first**: Next.js plus a Worker as the API edge for auth, rate limiting, and streaming; AI Gateway in front of the model providers; heavy background jobs on a container platform or a queue product.
- **Hybrid**: Cloudflare in front for edge caching and the gateway, AWS behind it for data and long-running work.

## Common mistakes

- Putting a 10-minute agent run in a function with an execution cap → move long work to queue workers on containers.
- Holding SSE through a load balancer with a short idle timeout → raise the timeout or send periodic keep-alive comments (`: ping`).
- Assuming every Node.js library runs on Workers → check compatibility early, especially for SDKs with native dependencies.
- Picking a platform for one model, then finding it is not available in your region → check model availability per region first.
- Quoting limits from memory in a design review → link the current docs.
- Hard-coding model ids in deployed code → keep them in environment config.

## Interview angle

Usually asked as: "Where would you deploy this AI chat feature and why?" or "Lambda or ECS for an LLM backend?"

A strong answer covers:

- Splitting the system into model access, request path, background work, and data, then placing each.
- Functions for short, bursty work; containers for long-lived streams and long jobs.
- Bedrock when IAM, private networking, and AWS-native governance matter; direct provider APIs when you need the newest models first.
- Workers and AI Gateway for edge logic, observability, caching, and fallbacks across providers.
- Checking current limits and regional availability instead of assuming them.

Follow-up interviewers like: "Your security team says no customer data may leave the EU. What changes?" (Pick regions and model endpoints that process data in the EU, check each provider's data processing terms, and make sure logs, caches, and gateways are in-region too.)
