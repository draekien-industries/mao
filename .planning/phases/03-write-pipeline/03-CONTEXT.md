# Phase 3: Write Pipeline - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

A PersistentClaudeCli decorator that wraps the existing ClaudeCli service via chained Stream.tap calls, selectively persisting complete events to the database while passing all events through unchanged to downstream consumers. The renderer receives the same stream it did before — persistence is invisible to the UI. Includes pre-generating session IDs for new sessions and persisting user messages as the first event in each session.

</domain>

<decisions>
## Implementation Decisions

### Event Persistence Scope
- **D-01:** Persist `SystemInitEvent` immediately upon arrival (captures session_id for resume capability — WPIPE-03)
- **D-02:** Persist `AssistantMessageEvent` — the complete assembled response (WPIPE-01)
- **D-03:** Persist `ResultEvent` — contains total_cost_usd, token usage, and is_error flag. Needed for future cost tracking (COST-01 in v2 requirements)
- **D-04:** Discard `StreamEventMessage` (deltas) — never persisted individually. Only complete events are stored.
- **D-05:** Discard `SystemRetryEvent` — transient API retry info, not needed for conversation reconstruction
- **D-06:** Discard `UnknownEvent` (catch-all) — only persist explicitly typed events. Future event types need explicit schemas before they're persisted.

### User Message Capture
- **D-07:** PersistentClaudeCli decorator owns user message persistence. All persistence logic lives in one place.
- **D-08:** Generate a custom UUID as session_id upfront for new sessions (initial `query` calls). Pass it to the CLI via `--session-id` flag. This means we know the session_id before the stream starts.
- **D-09:** Persist the user message as the first event in the session (before the CLI stream starts) since session_id is known upfront. For `resume`/`cont` calls, session_id is already known from the params.

### Buffer Design
- **D-10:** No buffer needed. The decorator selectively persists complete events and ignores deltas. WPIPE-01 ("only complete AssistantMessageEvent is persisted") and WPIPE-02 ("buffer discarded on termination") are satisfied by design — there is no accumulated state to discard.
- **D-11:** Per-stream scope — each call to query/resume/cont is naturally isolated within its own Effect scope. No shared state between concurrent streams.
- **D-12:** Chained Stream.tap approach — separate tap per event type for readability and easy addition/removal of persisted event types.

### Interrupt & Discard Behavior
- **D-13:** Fiber interrupt from the renderer triggers termination. Effect.addFinalizer handles any cleanup needed.
- **D-14:** On interrupt, SystemInitEvent and user message remain persisted — they are valid session metadata. Phase 4 reconstruction handles sessions with only a user message and no response (shows the prompt with no reply).
- **D-15:** App quit (Electron before-quit) treated identically to interrupt — runtime.dispose() interrupts all fibers. Since there's no buffer to discard, no special cleanup needed.
- **D-16:** No stream timeout — the CLI manages its own retries via SystemRetryEvent. Claude sessions can legitimately take minutes for complex tasks. The user cancels manually.

### Performance
- **D-17:** Awaited writes in Stream.tap (not fire-and-forget). Only 3-4 writes per conversation turn, totaling < 4ms overhead. Ordering is guaranteed and error handling is straightforward.
- **D-18:** Write failures are logged (Effect.logWarning) and swallowed — persistence never breaks the active conversation. Phase 5 (Renderer Integration) is the right place to surface non-blocking UI warnings for write failures.

### Claude's Discretion
- PersistentClaudeCli layer composition and how it replaces ClaudeCli in the dependency graph
- Effect.addFinalizer implementation details for interrupt cleanup (if any cleanup is needed beyond the no-buffer design)
- Error type design for write failures (TaggedError classes or reusing DatabaseQueryError)
- How `--session-id` flag is integrated into the params system (QueryParams extension or decorator-level injection)
- JSON serialization approach for EventStore.append calls
- Whether to add a `session_id` field to the RPC response so the renderer knows the pre-generated ID

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — WPIPE-01 through WPIPE-04 define the acceptance criteria for this phase

### Prior Phase Context
- `.planning/phases/01-sqlite-infrastructure/01-CONTEXT.md` — Database service design (D-01: @effect/sql-sqlite-node, D-02: Database tag wrapping SqlClient)
- `.planning/phases/02-storage-services/02-CONTEXT.md` — EventStore design (D-03: raw JSON on write, no Schema validation), UserMessageEvent schema (D-01, D-02), service structure (D-10, D-11)

### Architecture & Conventions
- `.planning/codebase/CONVENTIONS.md` — Effect-TS service patterns, testing patterns (mock via Layer.succeed, no vi.mock)
- `.planning/codebase/STRUCTURE.md` — Where to add new services, file naming conventions
- `.planning/codebase/ARCHITECTURE.md` — Layer composition pattern, data flow, ClaudeCli abstraction

### Existing Code (Critical for Decorator Pattern)
- `src/services/claude-cli/service-definition.ts` — ClaudeCli Context.Tag interface (the contract PersistentClaudeCli must implement)
- `src/services/claude-cli/service.ts` — ClaudeCliLive implementation (buildStream function, stream pipeline that the decorator wraps)
- `src/services/claude-cli/events.ts` — ClaudeEvent union schema and type guards (isSystemInit, isAssistantMessage, isResult used for selective persistence)
- `src/services/claude-cli/params.ts` — QueryParams, ResumeParams, ContinueParams (need to understand --session-id flag support)
- `src/services/database/event-store/service-definition.ts` — EventStore.append(sessionId, eventType, eventData) API
- `src/services/database/event-store/service.ts` — EventStore implementation
- `src/services/database/event-store/schemas.ts` — StoredEvent and UserMessageEvent schemas
- `src/hooks/use-claude-chat.ts` — Current stream consumer in the renderer (should be UNCHANGED by Phase 3 — verifies transparency)
- `src/main.ts` — Layer composition where PersistentClaudeCli needs to be wired between ClaudeCliLive and ClaudeRpcHandlers

### Project Constraints
- `.planning/PROJECT.md` — Constraints section (Effect-TS patterns, no partial data, performance)
- `.planning/STATE.md` — Blocker note: "Effect.addFinalizer + Stream.tap + fiber interruption interaction... may need prototype validation"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ClaudeCli` Context.Tag (`src/services/claude-cli/service-definition.ts`): The decorator implements this same interface — query, resume, cont all return `Stream.Stream<ClaudeEvent, ClaudeCliError, never>`
- `EventStore.append(sessionId, eventType, eventData)` (`src/services/database/event-store/service-definition.ts`): The write API. Takes raw JSON strings, auto-assigns sequence numbers.
- Type guards (`src/services/claude-cli/events.ts`): `isSystemInit`, `isAssistantMessage`, `isResult` — used inside Stream.tap to decide which events to persist
- `annotations` object (`src/services/diagnostics.ts`): Structured logging keys — the decorator should add its own annotation values

### Established Patterns
- **Service decoration**: No existing decorator pattern in the codebase. `ClaudeCliFromRpc` in `src/services/claude-rpc/client.ts` is the closest analogue — it implements the `ClaudeCli` interface by proxying over RPC. PersistentClaudeCli follows the same shape but adds persistence side effects.
- **Layer composition**: `Layer.provideMerge` chain in `src/main.ts` — PersistentClaudeCli sits between ClaudeCliLive and ClaudeRpcHandlers
- **Stream operators**: `buildStream` in `src/services/claude-cli/service.ts` demonstrates Stream.unwrapScoped, Stream.mapEffect, Stream.concat, Stream.filter — the decorator adds Stream.tap
- **Error handling**: `Effect.tapError` + `Effect.logError` for observability, `Effect.mapError` for wrapping — same pattern for write failure logging

### Integration Points
- `src/main.ts` — Layer composition: PersistentClaudeCli needs to depend on both ClaudeCli and EventStore, then replace ClaudeCli in the layer that ClaudeRpcHandlers sees
- `src/services/claude-cli/params.ts` — May need `session_id` added to QueryParams flagMap for the `--session-id` CLI flag
- `src/services/claude-rpc/server.ts` — RPC handlers currently depend on ClaudeCli; after wiring, they'll transparently get PersistentClaudeCli

</code_context>

<specifics>
## Specific Ideas

- Pre-generate session_id as UUID for new queries, pass via `--session-id` to the CLI. This allows persisting the user message as the very first event before the stream starts, maintaining strict event ordering.
- The "buffer" described in WPIPE-01/WPIPE-02 is achieved by simply not persisting delta events — no accumulation, no state to discard on interrupt. The requirements are satisfied by design through selective persistence of complete events only.

</specifics>

<deferred>
## Deferred Ideas

- **ToolResultEvent schema** — Add a typed schema for `tool_result` events to the `ClaudeEvent` union so they can be persisted instead of falling into `UnknownEvent` (which is discarded). Requires research into the exact shape of tool_result events from the CLI.
- **Broader CLI event type research** — Investigate all event types the Claude CLI emits beyond the currently typed ones. Add schemas for events worth persisting.
- **UI write-failure warnings** — Surface non-blocking toast/notification in the renderer when a persistence write fails. Belongs in Phase 5 (Renderer Integration) scope.

</deferred>

---

*Phase: 03-write-pipeline*
*Context gathered: 2026-03-26*
