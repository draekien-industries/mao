# Phase 3: Write Pipeline - Research

**Researched:** 2026-03-26
**Domain:** Effect-TS Stream decoration, service layering, event persistence
**Confidence:** HIGH

## Summary

Phase 3 implements a `PersistentClaudeCli` decorator that wraps the existing `ClaudeCli` service, intercepting the stream of `ClaudeEvent` values to selectively persist complete events to the database via `EventStore.append`. The decorator implements the same `ClaudeCli` Context.Tag interface, making persistence invisible to all consumers (RPC handlers, renderer hook). The design is straightforward: chained `Stream.tap` calls per event type, no buffer accumulation, no shared mutable state.

The key patterns are well-established in the codebase: `Layer.effect(ClaudeCli, ...)` for the decorator layer, `Stream.tap` for side effects, type guards (`isSystemInit`, `isAssistantMessage`, `isResult`) for event filtering, and `JSON.stringify` for serialization to the EventStore's raw-string API. The blocker concern from STATE.md (Effect.addFinalizer + Stream.tap + fiber interruption) is resolved by the no-buffer design -- there is no accumulated state to clean up on interrupt, so no finalizer is needed.

**Primary recommendation:** Implement PersistentClaudeCli as a `Layer.effect(ClaudeCli, ...)` that depends on both `ClaudeCli` (the underlying implementation) and `EventStore`, wrapping each stream method with chained `Stream.tap` calls for selective persistence. Pre-generate session IDs via `crypto.randomUUID()` for new queries.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Persist `SystemInitEvent` immediately upon arrival (captures session_id for resume capability -- WPIPE-03)
- **D-02:** Persist `AssistantMessageEvent` -- the complete assembled response (WPIPE-01)
- **D-03:** Persist `ResultEvent` -- contains total_cost_usd, token usage, and is_error flag
- **D-04:** Discard `StreamEventMessage` (deltas) -- never persisted individually
- **D-05:** Discard `SystemRetryEvent` -- transient API retry info
- **D-06:** Discard `UnknownEvent` (catch-all) -- only persist explicitly typed events
- **D-07:** PersistentClaudeCli decorator owns user message persistence
- **D-08:** Generate a custom UUID as session_id upfront for new sessions. Pass via `--session-id` flag.
- **D-09:** Persist user message as first event before CLI stream starts (session_id known upfront)
- **D-10:** No buffer needed. Selective persistence of complete events only.
- **D-11:** Per-stream scope -- each call naturally isolated within its own Effect scope
- **D-12:** Chained Stream.tap approach -- separate tap per event type
- **D-13:** Fiber interrupt from renderer triggers termination. Effect.addFinalizer handles cleanup if needed.
- **D-14:** On interrupt, SystemInitEvent and user message remain persisted -- valid session metadata
- **D-15:** App quit treated identically to interrupt -- runtime.dispose() interrupts all fibers
- **D-16:** No stream timeout -- CLI manages its own retries
- **D-17:** Awaited writes in Stream.tap (not fire-and-forget). Only 3-4 writes per turn, < 4ms overhead.
- **D-18:** Write failures are logged (Effect.logWarning) and swallowed -- persistence never breaks the active conversation.

### Claude's Discretion
- PersistentClaudeCli layer composition and how it replaces ClaudeCli in the dependency graph
- Effect.addFinalizer implementation details for interrupt cleanup (if any cleanup is needed beyond the no-buffer design)
- Error type design for write failures (TaggedError classes or reusing DatabaseQueryError)
- How `--session-id` flag is integrated into the params system (QueryParams extension or decorator-level injection)
- JSON serialization approach for EventStore.append calls
- Whether to add a `session_id` field to the RPC response so the renderer knows the pre-generated ID

### Deferred Ideas (OUT OF SCOPE)
- ToolResultEvent schema -- Add typed schema for tool_result events
- Broader CLI event type research -- Investigate all event types beyond currently typed ones
- UI write-failure warnings -- Surface non-blocking toast in renderer (Phase 5 scope)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WPIPE-01 | Stream deltas buffered in memory; only complete AssistantMessageEvent persisted | Satisfied by design: Stream.tap with `isAssistantMessage` guard persists only complete events. Deltas (`StreamEventMessage`) are never tapped. No buffer exists to accumulate partial data. |
| WPIPE-02 | In-memory buffer discarded on user termination with no partial data written | Satisfied by design: no buffer exists. Each Stream.tap call persists atomically (a single INSERT). On fiber interrupt, the stream simply stops -- no pending partial writes. SystemInitEvent and user message already written are valid metadata per D-14. |
| WPIPE-03 | SystemInitEvent persisted immediately to capture session_id for resume capability | Stream.tap with `isSystemInit` guard persists this event immediately when it arrives. For new queries, session_id is pre-generated (D-08) so it's already known before the stream starts. |
| WPIPE-04 | PersistentClaudeCli decorator wraps ClaudeCli via Stream.tap for transparent persistence | Layer.effect(ClaudeCli, ...) implements the same interface. Depends on inner ClaudeCli and EventStore. Each method wraps the inner stream with chained Stream.tap calls. Downstream consumers see identical stream behavior. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

- **effect 3.21.0** -- `Stream.tap`, `Layer.effect`, `Effect.gen`, `Context.Tag` for the decorator pattern
- **@effect/sql-sqlite-node** -- Underlying database layer (Phase 1 infrastructure)
- **No new dependencies required** -- This phase uses only existing packages

### Supporting

- **Node.js `crypto.randomUUID()`** -- Built-in to Node.js 24.13.1 (project runtime). Generates v4 UUIDs for pre-generating session IDs. No external UUID library needed.

**Installation:** No new packages to install.

## Architecture Patterns

### Recommended File Structure
```
src/services/claude-cli/
  persistent/
    service-definition.ts   # (optional) re-export or alias if needed
    service.ts              # PersistentClaudeCli Layer + makePersistentClaudeCliLive()
    __tests__/
      service.test.ts       # Unit tests for the decorator
```

Alternative (simpler, and consistent with codebase convention of flat files per service):
```
src/services/claude-cli/
  persistent-service.ts     # PersistentClaudeCli layer
  __tests__/
    persistent-service.test.ts
```

**Recommendation:** Use the subdirectory approach (`persistent/`) to keep the decorator cleanly separated from the base ClaudeCli implementation while staying within the same service domain. This follows the `database/event-store/` and `database/tab-store/` precedent.

### Pattern 1: Service Decorator via Layer.effect

The PersistentClaudeCli decorator implements the same `ClaudeCli` Context.Tag interface by depending on the inner `ClaudeCli` service and wrapping its streams.

**Key insight:** Effect's dependency injection allows a layer to both _consume_ and _provide_ the same tag. The decorator layer consumes `ClaudeCli` (the inner implementation) and provides `ClaudeCli` (the decorated version). Layer composition in `main.ts` handles the wiring.

```typescript
// Source: codebase pattern from ClaudeCliFromRpc (client.ts lines 45-57)
export const makePersistentClaudeCliLive = () =>
  Layer.effect(
    ClaudeCli,
    Effect.gen(function* () {
      const inner = yield* ClaudeCli;
      const eventStore = yield* EventStore;

      const wrapStream = (
        sessionId: string,
        stream: Stream.Stream<ClaudeEvent, ClaudeCliError, never>,
      ) =>
        stream.pipe(
          Stream.tap((event) => {
            if (isSystemInit(event)) {
              return persistEvent(eventStore, sessionId, event);
            }
            if (isAssistantMessage(event)) {
              return persistEvent(eventStore, sessionId, event);
            }
            if (isResult(event)) {
              return persistEvent(eventStore, sessionId, event);
            }
            return Effect.void;
          }),
        );

      return {
        query: (params) => { /* pre-generate ID, persist user msg, wrap stream */ },
        resume: (params) => { /* use existing session_id, persist user msg, wrap stream */ },
        cont: (params) => { /* determine session_id, wrap stream */ },
      };
    }),
  );
```

### Pattern 2: Pre-generated Session ID for New Queries (D-08, D-09)

For `query` calls, generate a UUID before starting the stream, inject it as `--session-id`, and persist the user message as the first event:

```typescript
query: (params) => {
  const sessionId = crypto.randomUUID();
  const paramsWithSession = new QueryParams({
    ...params,
    session_id: sessionId,
  });

  // Persist user message before stream starts
  const persistUserMsg = eventStore.append(
    sessionId,
    "user_message",
    JSON.stringify({ type: "user_message", prompt: params.prompt }),
  );

  return Stream.fromEffect(persistUserMsg).pipe(
    Stream.drain,
    Stream.concat(wrapStream(sessionId, inner.query(paramsWithSession))),
  );
},
```

For `resume` calls, the session_id comes from `params.session_id` (already known). For `cont` calls, session_id handling needs investigation -- the `ContinueParams` schema has no session_id field.

### Pattern 3: Write Failure Swallowing (D-18)

Per the locked decision, write failures must be logged and swallowed. Use `Effect.catchAll` inside the tap:

```typescript
const persistEvent = (
  eventStore: EventStore.Type,
  sessionId: string,
  event: ClaudeEvent,
) =>
  eventStore
    .append(sessionId, event.type, JSON.stringify(event))
    .pipe(
      Effect.catchAll((err) =>
        Effect.logWarning("Persistence write failed").pipe(
          Effect.annotateLogs("error", err.message),
          Effect.annotateLogs("sessionId", sessionId),
          Effect.annotateLogs("eventType", event.type),
        ),
      ),
    );
```

### Pattern 4: Layer Composition in main.ts

The decorator must sit between `ClaudeCliLive` (the base implementation) and `ClaudeRpcHandlers` (the consumer):

```typescript
// Current (simplified):
//   ClaudeRpcHandlers -> ClaudeCli -> CommandExecutor

// After Phase 3:
//   ClaudeRpcHandlers -> ClaudeCli(Persistent) -> ClaudeCli(Live) -> CommandExecutor
//                                              -> EventStore -> Database -> SqlClient

const PersistentLayer = makePersistentClaudeCliLive();

const BaseLayer = Layer.provideMerge(
  ClaudeRpcHandlers,
  Layer.provideMerge(
    PersistentLayer,           // <-- NEW: sits between handlers and CLI
    Layer.provideMerge(
      ClaudeCliLive,
      Layer.provideMerge(
        TabStoreLayer,
        Layer.provideMerge(
          EventStoreLayer,
          Layer.provideMerge(
            DatabaseLayer,
            Layer.provideMerge(SqliteLive, NodeContext.layer),
          ),
        ),
      ),
    ),
  ),
);
```

**Critical note on Layer.effect consuming its own tag:** When `PersistentClaudeCliLive` is built with `Layer.effect(ClaudeCli, ...)`, the Effect inside will `yield* ClaudeCli` to get the inner service. This works because `Layer.provideMerge` resolves dependencies downward -- the `ClaudeCliLive` layer below provides the inner `ClaudeCli`, and the decorator consumes it and re-provides the tag with the decorated implementation.

### Anti-Patterns to Avoid
- **Accumulating delta text in a buffer:** The CONTEXT.md explicitly forbids this (D-10). The "buffer" from the requirements is satisfied by simply not persisting deltas.
- **Fire-and-forget writes:** D-17 requires awaited writes in Stream.tap. Do not use `Effect.forkDaemon` or `Effect.runFork` for persistence.
- **Modifying the stream shape:** The decorator must return `Stream.Stream<ClaudeEvent, ClaudeCliError, never>` -- the same type as the inner stream. `Stream.tap` preserves the element type; `Stream.map` or `Stream.mapEffect` would change it.
- **Using `as` type casting:** Per project CLAUDE.md, avoid `as` casting. The decorator's return type should be inferred from the `ClaudeCli` tag definition.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom ID generation | `crypto.randomUUID()` | Built into Node.js 24; cryptographically secure v4 UUIDs |
| JSON serialization of events | Custom encoder | `JSON.stringify(event)` | Schema.Class instances serialize cleanly via JSON.stringify (verified) |
| Stream side effects | Custom stream wrapper | `Stream.tap` | Built into Effect 3.21.0; preserves stream element type |
| Service decoration | Manual dependency rewiring | `Layer.effect(ClaudeCli, ...)` + layer composition | Effect's DI handles the tag resolution automatically |

**Key insight:** The entire decorator is a thin composition of existing primitives -- Stream.tap, type guards, EventStore.append, Layer.effect. No custom infrastructure is needed.

## Common Pitfalls

### Pitfall 1: Layer Tag Shadowing Failure
**What goes wrong:** The decorator layer provides the same `ClaudeCli` tag it consumes. If layer composition is wrong, the decorator sees itself instead of the inner implementation, causing infinite recursion or missing dependencies.
**Why it happens:** `Layer.provideMerge` order matters. The decorator must be composed _above_ `ClaudeCliLive` in the stack so that when the decorator does `yield* ClaudeCli`, it resolves to the inner live implementation.
**How to avoid:** In `main.ts`, `PersistentLayer` must be `Layer.provideMerge`d on top of `ClaudeCliLive`, not below it or at the same level. Test the layer composition in isolation.
**Warning signs:** `Maximum call stack size exceeded` at runtime, or the decorator's methods receiving its own output.

### Pitfall 2: ContinueParams Missing session_id
**What goes wrong:** `ContinueParams` has no `session_id` field. The `--continue` flag tells Claude CLI to continue the last session, but the decorator needs a session_id to persist events.
**Why it happens:** `--continue` is a command flag, not a session-specific parameter. The CLI determines which session to continue internally.
**How to avoid:** For `cont` calls, the SystemInitEvent in the stream will contain the `session_id`. The decorator can extract it from the first SystemInitEvent and use it for subsequent persistence. User message persistence happens after receiving the SystemInitEvent (not before, unlike `query` and `resume`).
**Warning signs:** `sessionId` is `undefined` when calling `eventStore.append` for cont sessions.

### Pitfall 3: Write Failure Propagation Breaking the Stream
**What goes wrong:** If `EventStore.append` fails and the error isn't caught inside `Stream.tap`, the error propagates to the stream consumer, breaking the active conversation.
**Why it happens:** `Stream.tap` runs the effect for each element; an uncaught error from the tap effect terminates the stream with that error.
**How to avoid:** Every `EventStore.append` call inside `Stream.tap` must be wrapped with `Effect.catchAll` to swallow the error and log a warning (D-18). This ensures the stream continues even if persistence fails.
**Warning signs:** Conversations dying mid-response with `DatabaseQueryError` errors surfacing in the renderer.

### Pitfall 4: JSON.stringify on Schema.Class Losing Type Discriminator
**What goes wrong:** `JSON.stringify` on a `Schema.Class` instance serializes all enumerable properties. If the `_tag` property (used by Schema for discrimination) is not enumerable, round-trip decoding in Phase 4 could fail.
**Why it happens:** `Schema.Class` instances have properties from the schema fields, which are enumerable. The `_tag` is not stored as a property -- discrimination relies on the `type` field in this codebase's event schemas.
**How to avoid:** This is not actually a problem for this codebase: all events discriminate on the `type` field (e.g., `"system"`, `"assistant"`, `"result"`, `"user_message"`), which IS included in `JSON.stringify` output. Verified by testing: `JSON.stringify(new SystemInitEvent({...}))` produces `{"type":"system","subtype":"init",...}`.
**Warning signs:** None expected; this is a non-issue but documented for completeness.

### Pitfall 5: Stream.tap Ordering With Async Effects
**What goes wrong:** If multiple `Stream.tap` calls contain async effects, the ordering of side effects relative to downstream consumption could be unclear.
**Why it happens:** `Stream.tap` awaits its effect before emitting the element downstream. With chained taps, each tap runs sequentially for each element.
**How to avoid:** This is actually safe behavior -- `Stream.tap` guarantees the effect completes before the element flows to the next operator. A single `Stream.tap` with a conditional body (using if/else on type guards) is equivalent to chained taps and may be simpler.
**Warning signs:** None; this is how Effect streams work by design.

## Code Examples

### Complete PersistentClaudeCli Decorator Shape

```typescript
// Source: derived from codebase patterns in service.ts and client.ts
import { Effect, Layer, Stream } from "effect";
import {
  isAssistantMessage,
  isResult,
  isSystemInit,
} from "./events";
import type { ClaudeEvent } from "./events";
import type { ClaudeCliError } from "./errors";
import { QueryParams } from "./params";
import { ClaudeCli } from "./service-definition";
import { EventStore } from "../database/event-store/service-definition";
import { annotations } from "../diagnostics";

const persistEvent = (
  store: Context.Tag.Service<typeof EventStore>,
  sessionId: string,
  eventType: string,
  event: ClaudeEvent,
) =>
  store.append(sessionId, eventType, JSON.stringify(event)).pipe(
    Effect.catchAll((err) =>
      Effect.logWarning("Persistence write failed").pipe(
        Effect.annotateLogs("error", err.message),
        Effect.annotateLogs(annotations.sessionId, sessionId),
        Effect.annotateLogs("eventType", eventType),
      ),
    ),
  );

const wrapStream = (
  store: Context.Tag.Service<typeof EventStore>,
  sessionId: string,
  stream: Stream.Stream<ClaudeEvent, ClaudeCliError, never>,
) =>
  stream.pipe(
    Stream.tap((event) => {
      if (isSystemInit(event)) {
        return persistEvent(store, sessionId, "system", event);
      }
      if (isAssistantMessage(event)) {
        return persistEvent(store, sessionId, "assistant", event);
      }
      if (isResult(event)) {
        return persistEvent(store, sessionId, "result", event);
      }
      return Effect.void;
    }),
  );
```

### Session ID Pre-generation for Query

```typescript
// Source: derived from params.ts QueryParams and D-08/D-09
query: (params) => {
  const sessionId = crypto.randomUUID();
  const enrichedParams = new QueryParams({
    ...params,
    session_id: sessionId,
  });

  // Persist user message BEFORE stream starts (D-09)
  const persistUserMessage = store
    .append(
      sessionId,
      "user_message",
      JSON.stringify({ type: "user_message", prompt: params.prompt }),
    )
    .pipe(
      Effect.catchAll((err) =>
        Effect.logWarning("Failed to persist user message").pipe(
          Effect.annotateLogs("error", err.message),
        ),
      ),
    );

  // Stream.fromEffect + drain + concat ensures user message is persisted
  // before the CLI stream starts
  return Stream.fromEffect(persistUserMessage).pipe(
    Stream.drain,
    Stream.concat(wrapStream(store, sessionId, inner.query(enrichedParams))),
  );
},
```

### Mock Pattern for Testing

```typescript
// Source: derived from existing test patterns in event-store service.test.ts
const makeTestLayer = () => {
  const appendedEvents: Array<{
    sessionId: string;
    eventType: string;
    eventData: string;
  }> = [];

  const mockEventStore = Layer.succeed(EventStore, {
    append: (sessionId, eventType, eventData) => {
      appendedEvents.push({ sessionId, eventType, eventData });
      return Effect.void;
    },
    getBySession: () => Effect.succeed([]),
    purgeSession: () => Effect.void,
  });

  const events: ClaudeEvent[] = [];
  const mockInnerCli = Layer.succeed(ClaudeCli, {
    query: () => Stream.fromIterable(events),
    resume: () => Stream.fromIterable(events),
    cont: () => Stream.fromIterable(events),
  });

  // PersistentClaudeCli depends on both ClaudeCli and EventStore
  const testLayer = makePersistentClaudeCliLive().pipe(
    Layer.provide(mockInnerCli),
    Layer.provide(mockEventStore),
  );

  return { appendedEvents, events, layer: testLayer };
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Buffer + flush pattern | Selective persistence (no buffer) | D-10 decision | Eliminates all buffer management, interrupt cleanup, and partial data concerns |
| Extract session_id from SystemInitEvent | Pre-generate session_id (D-08) | CONTEXT.md decision | Enables persisting user message before stream starts; simpler lifecycle |
| Separate PersistentClaudeCli Context.Tag | Reuse ClaudeCli tag (decorator pattern) | CONTEXT.md decision | Transparent to all consumers; no API changes needed |

## Validation Architecture

### Test Framework

- **Framework:** Vitest 4.1.1
- **Config file:** `vitest.config.mts`
- **Quick run command:** `npx vitest run src/services/claude-cli/persistent/__tests__/service.test.ts`
- **Full suite command:** `npm test`

### Phase Requirements to Test Map

- **WPIPE-01** (Only complete AssistantMessageEvent persisted)
  - Test type: unit
  - Command: `npx vitest run src/services/claude-cli/persistent/__tests__/service.test.ts -t "persists AssistantMessageEvent"`
  - File exists: No (Wave 0)

- **WPIPE-02** (No partial data on termination)
  - Test type: unit
  - Command: `npx vitest run src/services/claude-cli/persistent/__tests__/service.test.ts -t "no partial data"`
  - File exists: No (Wave 0)

- **WPIPE-03** (SystemInitEvent persisted immediately)
  - Test type: unit
  - Command: `npx vitest run src/services/claude-cli/persistent/__tests__/service.test.ts -t "persists SystemInitEvent"`
  - File exists: No (Wave 0)

- **WPIPE-04** (Transparent decorator via Stream.tap)
  - Test type: unit
  - Command: `npx vitest run src/services/claude-cli/persistent/__tests__/service.test.ts -t "transparent"`
  - File exists: No (Wave 0)

### Sampling Rate
- **Per task commit:** `npx vitest run src/services/claude-cli/persistent/__tests__/service.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/services/claude-cli/persistent/__tests__/service.test.ts` -- covers WPIPE-01 through WPIPE-04
- [ ] No new framework install needed (Vitest 4.1.1 already configured)

## Open Questions

1. **ContinueParams session_id resolution**
   - What we know: `ContinueParams` has no `session_id` field. The `--continue` flag tells the CLI to continue the most recent session. The decorator needs a session_id to persist events.
   - What's unclear: Should the decorator extract session_id from the first `SystemInitEvent` in the stream, or should it query the database for the most recent session?
   - Recommendation: Extract from `SystemInitEvent` when it arrives. For `cont` calls, the user message persistence and SystemInitEvent persistence happen in-stream (not pre-stream). This is the simplest approach and avoids database queries.

2. **RPC response session_id visibility**
   - What we know: The pre-generated session_id (D-08) is injected into QueryParams at the decorator level. The renderer currently gets session_id from the SystemInitEvent in the stream.
   - What's unclear: Should the RPC response include the pre-generated session_id so the renderer knows it immediately (before the stream starts)?
   - Recommendation: Not needed for Phase 3. The renderer already extracts session_id from SystemInitEvent. Phase 5 (Renderer Integration) can add this if needed.

3. **Error type for write failures**
   - What we know: EventStore.append returns `Effect.Effect<void, DatabaseQueryError>`. Per D-18, write failures are logged and swallowed.
   - What's unclear: Should the decorator define its own error type (e.g., `PersistenceWriteError`) or reuse `DatabaseQueryError`?
   - Recommendation: Reuse `DatabaseQueryError` since it's caught and swallowed internally. No new error type needed -- the error never surfaces to consumers.

## Project Constraints (from CLAUDE.md)

- NEVER use `as` type casting unless absolutely necessary. Prefer decoding via Effect Schema or type narrowing.
- NEVER use `any` type. For complex types use built-in type helpers.
- Run `npm run check:write` after changes and resolve issues.
- Run `npm run typecheck` after changes and resolve issues.
- Run `npm test` after implementation to check for regressions.
- Use Effect-TS service/layer patterns consistent with existing architecture.
- No partial data: terminated sessions must not leave partial rows.
- Performance: writes should not block the UI or slow down CLI stream processing.

## Sources

### Primary (HIGH confidence)
- Codebase: `src/services/claude-cli/service.ts` -- existing ClaudeCliLive implementation pattern
- Codebase: `src/services/claude-cli/service-definition.ts` -- ClaudeCli Context.Tag interface
- Codebase: `src/services/claude-cli/events.ts` -- ClaudeEvent union and type guards
- Codebase: `src/services/claude-cli/params.ts` -- QueryParams with session_id field already defined
- Codebase: `src/services/database/event-store/service-definition.ts` -- EventStore.append API
- Codebase: `src/services/claude-rpc/client.ts` -- ClaudeCliFromRpc as decorator pattern precedent
- Codebase: `src/main.ts` -- Layer composition pattern
- Local verification: `JSON.stringify` on Schema.Class instances produces clean JSON with all fields
- Local verification: `crypto.randomUUID()` available in Node.js 24.13.1
- Local verification: `Stream.tap` exists in effect 3.21.0

### Secondary (MEDIUM confidence)
- [Effect Stream Operations docs](https://effect.website/docs/stream/operations/) -- Stream.tap API and behavior
- [Effect Scope/addFinalizer docs](https://effect.website/docs/resource-management/scope/) -- Finalizer behavior on interruption
- [Effect Layer docs](https://effect.website/docs/requirements-management/layers/) -- Layer composition patterns

### Tertiary (LOW confidence)
- None -- all findings verified against codebase and official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; all patterns verified in codebase
- Architecture: HIGH -- decorator pattern has direct precedent in ClaudeCliFromRpc; layer composition is established in main.ts
- Pitfalls: HIGH -- primary risks (layer shadowing, cont session_id, write failure propagation) identified with concrete mitigations
- Testing: HIGH -- existing test patterns (mock SqlClient, Layer.succeed, Effect.either) directly applicable

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable -- no external dependencies or fast-moving APIs)
