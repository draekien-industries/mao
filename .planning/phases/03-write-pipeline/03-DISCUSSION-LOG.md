# Phase 3: Write Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 03-write-pipeline
**Areas discussed:** Event persistence scope, User message capture, Interrupt & discard behavior, Buffer design, Performance

---

## Event Persistence Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, persist it | ResultEvent contains total_cost_usd, token usage, is_error flag. Useful for Phase 4 reconstruction and future cost tracking. | ✓ |
| No, discard it | Session reconstruction doesn't strictly need it — AssistantMessageEvent already has the content. | |

**User's choice (ResultEvent):** Yes, persist it
**Notes:** Useful for future cost tracking (COST-01 in v2 requirements)

| Option | Description | Selected |
|--------|-------------|----------|
| No, discard it | Transient API retry info. Not needed for conversation reconstruction. Would add noise. | ✓ |
| Yes, persist it | Could be useful for debugging API reliability issues. | |

**User's choice (SystemRetryEvent):** No, discard it

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, persist it | Future-proofs against new CLI event types. Storage cost minimal. | |
| No, discard it | Keep the database clean — only store events we explicitly understand. | ✓ |

**User's choice (UnknownEvent):** No, discard it
**Notes:** User wants to persist tool_result specifically but as a future typed schema, not via UnknownEvent catch-all. Deferred to future todo.

---

## User Message Capture

| Option | Description | Selected |
|--------|-------------|----------|
| PersistentClaudeCli decorator | Decorator intercepts query/resume/cont calls. Has access to prompt text and session_id. All persistence in one place. | ✓ |
| RPC handler layer | RPC server handler persists before calling ClaudeCli. Separates user message from stream persistence. | |
| Renderer hook | Hook calls separate RPC endpoint. Gives renderer explicit control. | |

**User's choice (Responsibility):** PersistentClaudeCli decorator

| Option | Description | Selected |
|--------|-------------|----------|
| After SystemInitEvent | Wait for session_id from SystemInitEvent. Guarantees correct session link. | |
| Before stream starts | Persist immediately. Requires pre-knowing session_id. | |
| (Custom) | Generate custom UUID, pass via --session-id flag. Persist user message first. | ✓ |

**User's choice (Timing):** Custom — generate UUID as session_id upfront via --session-id flag, persist user message as the very first event before stream starts. This keeps everything in strict order.

---

## Interrupt & Discard Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Fiber interrupt from renderer | Renderer signal interrupts the fiber. Effect.addFinalizer discards buffer. Clean and Effect-idiomatic. | ✓ |
| Explicit stop RPC call | New 'stop' RPC endpoint. Main process kills CLI and discards buffer. | |

**User's choice (Trigger):** Fiber interrupt from renderer

| Option | Description | Selected |
|--------|-------------|----------|
| Leave it | SystemInitEvent records session start. Valid metadata even if interrupted. Phase 4 handles incomplete sessions. | ✓ |
| Roll it back | Delete SystemInitEvent and user message on interrupt. Keep DB clean. | |

**User's choice (Cleanup):** Leave persisted events on interrupt

| Option | Description | Selected |
|--------|-------------|----------|
| Discard buffer, same as interrupt | App quit triggers runtime.dispose(), interrupts all fibers. Buffer finalizer discards. | ✓ |
| Flush buffer as incomplete event | Write partial data with incomplete marker before shutdown. | |

**User's choice (App quit):** Same as interrupt — discard

| Option | Description | Selected |
|--------|-------------|----------|
| No timeout | CLI manages its own retries. Sessions can take minutes. User cancels manually. | ✓ |
| Yes, add a timeout | Max wait time, auto-discard if no events arrive. | |

**User's choice (Timeout):** No timeout

---

## Buffer Design

| Option | Description | Selected |
|--------|-------------|----------|
| Just a dirty flag | Since AssistantMessageEvent is self-contained, no delta accumulation needed. Buffer is just a boolean. | |
| Accumulate delta events | Keep all StreamEventMessage events in a list. More memory, more complexity. | |
| (Refined) No buffer at all | Don't even need a dirty flag. Selective persistence of complete events means no state to track or discard. | ✓ |

**User's choice (Buffer tracking):** No buffer needed — selective persistence makes this a non-issue
**Notes:** User realized that since AssistantMessageEvent contains the complete response, there's nothing to buffer. WPIPE-01 and WPIPE-02 are satisfied by design.

| Option | Description | Selected |
|--------|-------------|----------|
| Per-stream | Each call gets its own scope. Naturally isolated. | ✓ |
| Shared with session key | One buffer map keyed by session_id. | |

**User's choice (Scope):** Per-stream

| Option | Description | Selected |
|--------|-------------|----------|
| Inline single tap | One Stream.tap with pattern matching. Fewer allocations. | |
| Chained taps | Separate Stream.tap per event type. More readable. | ✓ |

**User's choice (Tap style):** Chained taps — separate tap per event type for readability

| Option | Description | Selected |
|--------|-------------|----------|
| Effect Ref | Idiomatic Effect state management. Works with fiber interruption. | |
| Plain mutable variable | Simple closure. Less Effect-idiomatic. | |
| (Refined) Neither | No dirty flag needed at all since there's no buffer. | ✓ |

**User's choice (State type):** Neither — no state tracking needed

---

## Performance

| Option | Description | Selected |
|--------|-------------|----------|
| Awaited in Stream.tap | Each persist completes before next event processed. < 4ms total per turn. Simple error handling. | ✓ |
| Fire-and-forget with fork | Fork each write. Saves < 4ms but loses ordering, complicates error handling. | |

**User's choice (Write mode):** Awaited — user requested detailed analysis before deciding. Convinced by ordering guarantees and < 4ms overhead argument.

| Option | Description | Selected |
|--------|-------------|----------|
| Log and continue | Persistence is a side effect. Never break the conversation. Phase 5 adds UI warnings. | ✓ |
| Halt the stream | Fail loudly. No silent data loss but breaks active conversation. | |

**User's choice (Write errors):** Log and continue — user requested detailed pros/cons before deciding. Convinced by "persistence is a side effect" argument.

---

## Claude's Discretion

- PersistentClaudeCli layer composition and placement in the dependency graph
- Effect.addFinalizer implementation details
- Error type design for write failures
- --session-id flag integration into the params system
- JSON serialization for EventStore.append calls

## Deferred Ideas

- ToolResultEvent schema — typed schema for tool_result events (user explicitly wants these persisted, deferred implementation)
- Broader CLI event type research — investigate all event types the CLI emits
- UI write-failure warnings — non-blocking renderer notifications (Phase 5 scope)
