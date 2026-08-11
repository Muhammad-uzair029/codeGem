# Token Usage Display — Design Spec

**Date:** 2026-08-11
**Status:** Approved

## Summary

Show live context-window usage (tokens used / 200K, percentage) in the app header during and after a feature-loop session. Data sourced from Claude Code's `--output-format stream-json` structured output. Resets on each new loop launch.

---

## Data Flow

1. `loopService.ts` adds `--output-format stream-json` to the Claude CLI launch args.
2. Claude Code emits newline-delimited JSON objects on stdout. Two event types matter:
   - `{"type":"assistant","message":{"usage":{"input_tokens":N,"output_tokens":N,...},...},...}` — emitted after each assistant turn.
   - `{"type":"result","usage":{...},"total_cost_usd":N,...}` — emitted once at session end.
3. `loopService.ts` parses each stdout line:
   - If valid JSON with `type === "assistant"`: accumulate `input_tokens + output_tokens + cache_read_input_tokens` into session totals, emit `loop:tokenUpdate` IPC event.
   - If valid JSON with `type === "result"`: emit final `loop:tokenUpdate` with totals from the result event.
   - Extract text content from `message.content` array and emit as `loop:chunk` (same as today) so `TerminalView` continues working unchanged.
   - Non-JSON lines (stderr, system messages) pass through as `loop:chunk` unchanged.
4. Session token totals are reset to zero when a new `loop:launch` is called.

---

## IPC Contract

**New type in `src/shared/ipc.ts`:**

```typescript
export interface TokenUsageEvent {
  sessionId: string;
  inputTokens: number;       // cumulative input tokens this session
  outputTokens: number;      // cumulative output tokens this session
  cacheReadTokens: number;   // cumulative cache-read tokens
  contextWindowSize: number; // always 200_000
  turnNumber: number;        // assistant turn index (1-based)
}
```

**New method on `OrchestratorApi.loop`:**

```typescript
onTokenUpdate: (cb: (evt: TokenUsageEvent) => void) => () => void;
```

---

## Renderer State

**Addition to `workspaceStore.ts`:**

```typescript
tokenUsage: TokenUsageEvent | null;  // null = no session has run yet
setTokenUsage: (u: TokenUsageEvent) => void;
```

`tokenUsage` is reset to `null` inside `setSession(null, false)` (called when a session ends and on reset).

---

## UI — Header Token Pill

Location: `AppShell.tsx` header bar, to the right of the version badge.

**Visible only when** `tokenUsage !== null` (i.e., a session has started or just finished).

**Display:**

```
[v0.2.x]   [⬡ 45,230 / 200K  (23%)]
```

The pill contains:
- A small icon (⬡ or similar)
- `{totalTokens.toLocaleString()} / 200K`
- `({pct}%)` where `pct = Math.round(total / 200_000 * 100)`

**Color of the percentage / pill border:**

| Usage | Color |
|---|---|
| 0–60% | neutral grey (current pill style) |
| 61–80% | amber (`text-yellow-400`) |
| 81–95% | orange (`text-orange-400`) |
| 96–100% | red (`text-red-400`) |

`totalTokens = inputTokens + outputTokens + cacheReadTokens`

No progress bar — just the text pill. Keeps the header uncluttered.

---

## Files Changed

| File | Change |
|---|---|
| `src/shared/ipc.ts` | Add `TokenUsageEvent`; add `onTokenUpdate` to `OrchestratorApi.loop` |
| `src/main/services/loopService.ts` | Add `--output-format stream-json` arg; add JSON line parser + token accumulator; emit `loop:tokenUpdate`; strip JSON from `loop:chunk` display text |
| `src/main/preload.ts` | Wire `loop.onTokenUpdate` via contextBridge |
| `src/renderer/state/workspaceStore.ts` | Add `tokenUsage` + `setTokenUsage`; reset in `setSession` |
| `src/renderer/components/layout/AppShell.tsx` | Token pill in header; subscribe to `onTokenUpdate`; unsubscribe on unmount |

**TerminalView.tsx — no changes.** It continues receiving `loop:chunk` events with formatted text content extracted from the JSON.

---

## Error Handling

- If a stdout line is not valid JSON, treat it as plain text and emit as `loop:chunk` unchanged.
- If the `usage` field is missing from an assistant event, skip token update (don't emit `loop:tokenUpdate`).
- If `contextWindowSize` is unknown, default to `200_000`.

---

## Out of Scope

- Cost display (USD) — not in this spec.
- Per-turn breakdown — only cumulative totals shown.
- Persisting token history across app restarts.
