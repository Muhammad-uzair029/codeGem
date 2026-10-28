---
title: Streaming responses with SSE (NestJS to Next.js)
summary: Send tokens to the browser as the model writes them, using Server-Sent Events from a NestJS backend to a Next.js client.
minutes: 12
practice: [prod-stream-1, prod-stream-2, prod-stream-3]
flow:
  title: One streamed chat turn
  steps:
    - label: Client opens stream
      detail: The browser calls the backend with EventSource (GET) or fetch (POST) and keeps the connection open.
    - label: Backend calls the model
      detail: NestJS starts a streaming request to the LLM provider and sets Content-Type to text/event-stream.
    - label: Model emits deltas
      detail: The provider sends small text chunks (deltas) as they are generated, not one big answer at the end.
    - label: Backend forwards events
      detail: "Each delta is written as an SSE frame, a line like `data: {...}` followed by a blank line."
    - label: Client renders
      detail: The client parses each frame and appends the text to the UI, so the user sees words appear.
    - label: Done or abort
      detail: The backend sends a final `done` event and closes. If the user leaves, the backend aborts the provider call.
  loop:
    from: 5
    to: 3
    label: Repeat for every chunk
selfCheck:
  - q: Why can't you send a POST body with the browser's EventSource?
    options:
      - EventSource only supports GET requests and you cannot set a request body or custom headers
      - EventSource only works over WebSockets
      - EventSource needs a NestJS-specific client library
    answer: 0
    why: EventSource is a simple GET-only API. For POST bodies or an Authorization header, use fetch and read the response body as a stream.
  - q: What usually happens if your server ends an SSE response and the client never calls close() on its EventSource?
    options:
      - Nothing, the connection just stays closed
      - The browser automatically reconnects and may trigger the request again
      - The browser throws a fatal error and reloads the page
    answer: 1
    why: EventSource reconnects by design. Send an explicit "done" event and call close() on the client when you receive it.
  - q: What is the main user-facing benefit of streaming an LLM response?
    options:
      - The total generation time becomes shorter
      - The time until the user sees the first words is much shorter
      - The response uses fewer tokens
    answer: 1
    why: Total generation time is about the same, but time-to-first-token drops, so the app feels fast.
---

## Core concepts

An LLM writes its answer one token at a time. A long answer can take many seconds to finish. If you wait for the whole thing before showing anything, the user stares at a spinner. **Streaming** means you forward each piece to the user as soon as the model produces it.

Think of it like a waiter bringing dishes as they are ready instead of holding the whole order until the dessert is done.

The key metric is **time to first token (TTFT)**: how long until the first word appears. Streaming does not make generation faster overall, but it makes TTFT feel almost instant.

**Server-Sent Events (SSE)** is the simplest way to push a stream from server to browser:

- It is plain HTTP. The response has `Content-Type: text/event-stream` and stays open.
- The server writes frames. Each frame is one or more `field: value` lines, ending with a blank line. The common fields are `data`, `event` (a name), `id`, and `retry`.
- It is one-way, server to client. For a chat turn that is all you need. The next user message is just a new request.

Why not WebSockets? WebSockets are two-way and great for collaborative or real-time apps, but they need more infrastructure (sticky connections, a different protocol through proxies). For "stream one answer back", SSE is easier and works through most HTTP stacks.

On the client you have two options:

- **`EventSource`**: the built-in browser API. GET only, no custom headers, reconnects automatically.
- **`fetch` + `ReadableStream`**: works with POST, JSON bodies, and `Authorization` headers. You parse the SSE frames yourself.

## How it works in real systems

**Option A: NestJS `@Sse()` returning an Observable.** NestJS turns each emitted value into an SSE frame. `MessageEvent` here is the interface exported by `@nestjs/common`. When the client disconnects, Nest unsubscribes, and the teardown function aborts the provider call.

```ts
import { Controller, Query, Sse, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import Anthropic from '@anthropic-ai/sdk';

@Controller('chat')
export class ChatController {
  private client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  @Sse('stream')
  stream(@Query('q') q: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const stream = this.client.messages.stream({
        model: process.env.LLM_MODEL!, // keep model ids in config, not code
        max_tokens: 1024,
        messages: [{ role: 'user', content: q }],
      });
      stream.on('text', (delta) => subscriber.next({ data: { delta } }));
      stream.finalMessage()
        .then(() => { subscriber.next({ type: 'done', data: {} }); subscriber.complete(); })
        .catch((err) => subscriber.error(err));
      return () => stream.abort(); // client went away: stop paying for tokens
    });
  }
}
```

The matching Next.js client component uses `EventSource`. Note the explicit `close()` on `done`, otherwise the browser reconnects and asks again.

```ts
'use client';
import { useState } from 'react';

export function Answer() {
  const [text, setText] = useState('');
  function ask(q: string) {
    setText('');
    const es = new EventSource(`/api/chat/stream?q=${encodeURIComponent(q)}`);
    es.onmessage = (e) => setText((t) => t + JSON.parse(e.data).delta);
    es.addEventListener('done', () => es.close());
    es.onerror = () => es.close(); // show a retry button instead of looping
  }
  return <div><button onClick={() => ask('Explain SSE')}>Ask</button><p>{text}</p></div>;
}
```

**Option B: POST + raw response.** Real chat apps send a conversation history and an auth header, so they POST. In NestJS you can take the Express response with `@Res()` and write frames yourself.

```ts
@Post('stream')
async streamPost(@Body() body: ChatDto, @Req() req: Request, @Res() res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // ask nginx not to buffer
  res.flushHeaders();
  const stream = this.client.messages.stream({
    model: process.env.LLM_MODEL!, max_tokens: 1024, messages: body.messages,
  });
  req.on('close', () => stream.abort());
  stream.on('text', (delta) => res.write(`data: ${JSON.stringify({ delta })}\n\n`));
  try { await stream.finalMessage(); res.write('event: done\ndata: {}\n\n'); }
  catch { res.write('event: error\ndata: {"message":"stream failed"}\n\n'); }
  res.end();
}
```

The client reads the body with a stream reader and splits on the blank line between frames:

```ts
export async function streamChat(messages: Msg[], onDelta: (t: string) => void, signal: AbortSignal) {
  const res = await fetch('/api/chat/stream', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ messages }),
  });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? ''; // keep the incomplete tail for the next read
    for (const frame of frames) {
      const data = frame.split('\n').find((l) => l.startsWith('data: '));
      if (data && !frame.startsWith('event:')) onDelta(JSON.parse(data.slice(6)).delta);
    }
  }
}
```

> [!warning] Buffering kills streaming
> Reverse proxies, CDNs, and compression middleware may hold chunks until a buffer fills. The stream "works" locally and arrives all at once in production. Check every hop: proxy buffering settings, `compression()` middleware, and your hosting platform's streaming support.

## Common mistakes

- Waiting for the full completion and then "streaming" it from memory → stream from the provider directly, so TTFT is real.
- Not aborting the provider call when the user closes the tab → listen for disconnect (`req.on('close')` or Observable teardown) and abort, or you pay for tokens nobody reads.
- Forgetting `es.close()` on the client → send a `done` event and close; otherwise EventSource reconnects and may re-run the request.
- Using EventSource when you need an auth header → use `fetch` with a stream reader, or authenticate with a cookie.
- Splitting chunks on `\n` and assuming one network chunk equals one frame → buffer and split on the blank line; a frame can arrive in pieces.
- Testing only on localhost → test through the real proxy, load balancer, and CDN, where buffering and idle timeouts live.

## Interview angle

Usually asked as: "How would you stream LLM responses to a web client?" or "Why does our streaming endpoint deliver everything at once in production?"

A strong answer covers:

- SSE vs WebSockets, and why SSE fits a one-way token stream.
- The frame format (`data:` lines, blank-line separator, named events for `done` and `error`).
- EventSource limits (GET only, no custom headers, auto-reconnect) and the `fetch` + reader alternative.
- Abort on disconnect to save cost, and buffering at proxies as the classic production bug.
- How errors mid-stream reach the user, since the HTTP status is already 200 once streaming starts.

Follow-up interviewers like: "The stream fails halfway through. The status code was already 200. How does the client know, and what do you show?" (Answer: send a named `error` event, keep the partial text, and offer a retry.)
