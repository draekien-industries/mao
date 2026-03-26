# Phase 4: Session Reconstruction - Research

**Researched:** 2026-03-26
**Domain:** Event folding, RPC multi-group composition, Effect-TS service patterns
**Confidence:** HIGH

## Summary

Phase 4 builds a read-path service that folds stored events into typed `ChatMessage` arrays and exposes them to the renderer via a new `PersistenceRpcGroup`. The technical domain is well-constrained: all the building blocks exist (EventStore, TabStore, StoredEvent union, type guards, IPC transport), and the implementation follows established codebase patterns for services, layers, and RPC groups.

The primary technical challenge is wiring two RPC groups (`ClaudeRpcGroup` and `PersistenceRpcGroup`) through a single IPC transport. Research confirms that `@effect/rpc` 0.75.0's `RpcGroup.merge()` method is the correct approach -- `RpcServer.make` and `RpcClient.make` both accept a single group, so groups must be merged before being passed in.

A secondary finding is that `EventStore.getBySession` currently returns `ReadonlyArray<StoredEvent>` (decoded event data only), discarding DB row metadata (`sequence_number`, `created_at`). Per D-02, `ChatMessage` needs `id` (sequence_number) and `createdAt` (created_at). This requires extending the EventStore API with a new method that returns row metadata alongside decoded events.

**Primary recommendation:** Use `RpcGroup.merge()` to combine `ClaudeRpcGroup` and `PersistenceRpcGroup` into a single merged group. Add a `getBySessionWithMeta` method to EventStore that returns row metadata. Build `SessionReconstructor` as a standard Effect service following existing `service-definition.ts` + `service.ts` patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Reconstruction returns a Schema class `ReconstructedSession` containing `{ sessionId: string, messages: ChatMessage[] }`. Session-level metadata (cost, model) excluded for now.
- **D-02:** `ChatMessage` is extended with `id` (sequence_number from DB -- stable identity for React keys/scroll anchoring) and `createdAt` (ISO timestamp from DB row). New shape: `{ id: number, role: "user" | "assistant", content: string, createdAt: string }`.
- **D-03:** `ChatMessage` and `ReconstructedSession` are defined as Effect Schema classes.
- **D-04:** Create a new `PersistenceRpcGroup` separate from `ClaudeRpcGroup`. Both share the same IPC transport.
- **D-05:** `PersistenceRpcGroup` contains two non-streaming RPCs: `reconstructSession(sessionId)` and `listTabs()`.
- **D-06:** `RpcServer.make` and `RpcClient.make` accept both groups as variadic arguments -- single transport, single client. **RESEARCH FINDING: variadic is not supported. Use `RpcGroup.merge()` instead.**
- **D-07:** A new `PersistenceRpcHandlers` layer provides handler implementations. Composed alongside `ClaudeRpcHandlers` in `main.ts`.
- **D-08:** `SessionReconstructor` is an Effect service (`Context.Tag`) with a `reconstruct(sessionId)` method.
- **D-09:** Event-to-message mapping: UserMessageEvent -> user message, AssistantMessageEvent -> assistant message, SystemInitEvent -> extracts session_id, ResultEvent/SystemRetryEvent/UnknownEvent -> skipped.
- **D-10:** Incomplete sessions represented as-is (no placeholder assistant message).
- **D-11:** Empty sessions return `ReconstructedSession { sessionId, messages: [] }`.
- **D-12:** Text extraction from AssistantMessageEvent extracted into shared utility function used by both `use-claude-chat.ts` and reconstruction fold.
- **D-13:** Reconstruction is per-session: `reconstruct(sessionId)` returns one `ReconstructedSession`.
- **D-14:** `listTabs` RPC included in Phase 4 scope.

### Claude's Discretion
- SessionReconstructor service file organization
- `ReconstructSessionParams` schema design
- `listTabs` params/response schema design
- Error type design for reconstruction failures
- Test strategy for fold logic and RPC endpoints
- How to wire multi-group RPC if variadic `RpcServer.make` isn't supported (fallback: `RpcGroup.merge`)

### Deferred Ideas (OUT OF SCOPE)
- Session-level metadata (model, totalCost, isInterrupted)
- Batch reconstruction (reconstructAll endpoint)
- ToolResultEvent schema
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RECON-01 | Full conversation state reconstructed from stored events on app reopen | SessionReconstructor fold logic over StoredEvent union; event-to-ChatMessage mapping (D-09 through D-12); extended EventStore API for row metadata |
| RECON-02 | CLI sessions resumed via --resume flag using stored session_id | SystemInitEvent carries session_id; fold extracts it to ReconstructedSession.sessionId top-level field |
| RECON-03 | New RPC endpoint exposes session reconstruction to the renderer process | PersistenceRpcGroup with two non-streaming RPCs; RpcGroup.merge() combines with ClaudeRpcGroup; single transport via ElectronServerProtocol |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- NEVER use `as` type casting unless absolutely necessary. Prefer decoding via Effect Schema or type narrowing.
- NEVER use `any` type unless absolutely necessary.
- AVOID `useCallback`, `useMemo` and `memo` for React.
- Run `npm run check:write` after changes and resolve issues.
- Run `npm run typecheck` after changes and resolve issues.
- Run `npm test` after implementation to check for regressions.

## Architecture Patterns

### Recommended File Organization

```
src/
  services/
    database/
      event-store/
        service-definition.ts   # MODIFY: add getBySessionWithMeta method
        service.ts              # MODIFY: implement getBySessionWithMeta
        schemas.ts              # existing (no changes)
      session-reconstructor/
        service-definition.ts   # NEW: SessionReconstructor Context.Tag
        service.ts              # NEW: SessionReconstructorLive layer (fold logic)
        schemas.ts              # NEW: ChatMessage, ReconstructedSession Schema classes
        __tests__/
          service.test.ts       # NEW: fold logic tests
          schemas.test.ts       # NEW: schema round-trip tests
    persistence-rpc/
      group.ts                  # NEW: PersistenceRpcGroup definition
      handlers.ts               # NEW: PersistenceRpcHandlers layer
      __tests__/
        handlers.test.ts        # NEW: handler tests
    claude-rpc/
      server.ts                 # MODIFY: merge groups, update startRpcServer
      client.ts                 # MODIFY: merge groups, expose persistence client
      runtime.ts                # MODIFY: update AppRuntime layer
  lib/
    extract-assistant-text.ts   # NEW: shared utility (D-12)
  hooks/
    use-claude-chat.ts          # MODIFY: import shared utility
```

### Pattern 1: Multi-Group RPC via merge()

**What:** Combine `ClaudeRpcGroup` and `PersistenceRpcGroup` into a single merged group for both server and client.

**When to use:** When multiple RPC groups share the same transport (IPC channel).

**Why:** `RpcServer.make` and `RpcClient.make` each accept exactly one `RpcGroup` parameter. The `merge()` method on `RpcGroup` combines all RPCs from multiple groups into a single group. This is verified from the `@effect/rpc` 0.75.0 source code.

**Server side (`server.ts`):**
```typescript
import { PersistenceRpcGroup } from "../persistence-rpc/group";
import { ClaudeRpcGroup } from "./group";

const MergedRpcGroup = ClaudeRpcGroup.merge(PersistenceRpcGroup);

export const startRpcServer = Effect.gen(function* () {
  yield* Effect.logInfo("RPC server starting");
  return yield* RpcServer.make(MergedRpcGroup);
}).pipe(
  Effect.provide(ElectronServerProtocol),
  Effect.annotateLogs(annotations.service, "rpc"),
  Effect.withSpan("rpc-server"),
);
```

**Client side (`client.ts`):**
```typescript
import { PersistenceRpcGroup } from "../persistence-rpc/group";
import { ClaudeRpcGroup } from "./group";

const MergedRpcGroup = ClaudeRpcGroup.merge(PersistenceRpcGroup);

// In the Layer.scoped:
const client = yield* RpcClient.make(MergedRpcGroup);
// client.query, client.resume, client.cont (from ClaudeRpcGroup)
// client.reconstructSession, client.listTabs (from PersistenceRpcGroup)
```

**Handler composition:**
Both `ClaudeRpcHandlers` and `PersistenceRpcHandlers` produce handler Context for their respective groups. When using a merged group, handler layers from each group must both be provided. The `toLayer()` method on each group creates handler context that gets composed via `Layer.provideMerge`.

```typescript
// main.ts layer composition
const BaseLayer = ClaudeRpcHandlers.pipe(
  Layer.provideMerge(PersistenceRpcHandlers),
  Layer.provideMerge(SessionReconstructorLive),
  Layer.provideMerge(PersistentLayer),
  // ... rest of existing chain
);
```

**Confidence:** HIGH -- Verified from `@effect/rpc` 0.75.0 source code. `RpcGroup.merge()` at line 21-35 of `RpcGroup.js` merges request maps. `RpcClient.make` at lines 277-289 handles prefixed/namespaced tags automatically. `RpcServer.make` at line 333 accepts a single group parameter.

### Pattern 2: Non-Streaming RPC Definition

**What:** The persistence RPCs are request-response (not streaming like the Claude CLI RPCs).

**When to use:** For `reconstructSession` and `listTabs` which return a single response.

```typescript
import { Rpc, RpcGroup } from "@effect/rpc";
import { DatabaseErrorSchema } from "../database/errors";
import { ReconstructedSession } from "../database/session-reconstructor/schemas";
import { Tab } from "../database/tab-store/schemas";
import { ReconstructSessionParams, ListTabsParams } from "./params";

export class PersistenceRpcGroup extends RpcGroup.make(
  Rpc.make("reconstructSession", {
    payload: ReconstructSessionParams,
    success: ReconstructedSession,
    error: DatabaseErrorSchema,
    // no `stream: true` -- this is a request-response RPC
  }),
  Rpc.make("listTabs", {
    payload: ListTabsParams,
    success: Tab,  // Note: for arrays, the RPC returns Schema array
    error: DatabaseErrorSchema,
  }),
) {}
```

**Confidence:** HIGH -- Follows the same `Rpc.make` pattern as `ClaudeRpcGroup` (verified in `src/services/claude-rpc/group.ts`), just without `stream: true`.

**Important detail on array responses:** For `listTabs` which returns `ReadonlyArray<Tab>`, the success schema should be `Schema.Array(Tab)` (not just `Tab`). For `reconstructSession` which returns a single `ReconstructedSession`, the success schema is simply `ReconstructedSession`.

### Pattern 3: Service Definition (SessionReconstructor)

**What:** Standard Effect-TS service following codebase patterns.

```typescript
// service-definition.ts
import type { Effect } from "effect";
import { Context } from "effect";
import type { DatabaseQueryError } from "../errors";
import type { ReconstructedSession } from "./schemas";

export class SessionReconstructor extends Context.Tag("SessionReconstructor")<
  SessionReconstructor,
  {
    readonly reconstruct: (
      sessionId: string,
    ) => Effect.Effect<ReconstructedSession, DatabaseQueryError>;
  }
>() {}
```

```typescript
// service.ts
import { Effect, Layer } from "effect";
import { annotations } from "../../diagnostics";
import { EventStore } from "../event-store/service-definition";
import { ChatMessage, ReconstructedSession } from "./schemas";
import { SessionReconstructor } from "./service-definition";
import { extractAssistantText } from "@/lib/extract-assistant-text";
import { isAssistantMessage, isSystemInit } from "../../claude-cli/events";
import { isUserMessage } from "../event-store/schemas";

export const makeSessionReconstructorLive = () =>
  Layer.effect(
    SessionReconstructor,
    Effect.gen(function* () {
      const eventStore = yield* EventStore;

      const reconstruct = (sessionId: string) =>
        Effect.gen(function* () {
          const rows = yield* eventStore.getBySessionWithMeta(sessionId);

          let extractedSessionId = sessionId;
          const messages: Array<ChatMessage> = [];

          for (const row of rows) {
            if (isSystemInit(row.event)) {
              extractedSessionId = row.event.session_id;
            } else if (isUserMessage(row.event)) {
              messages.push(
                new ChatMessage({
                  id: row.sequenceNumber,
                  role: "user",
                  content: row.event.prompt,
                  createdAt: row.createdAt,
                }),
              );
            } else if (isAssistantMessage(row.event)) {
              messages.push(
                new ChatMessage({
                  id: row.sequenceNumber,
                  role: "assistant",
                  content: extractAssistantText(row.event),
                  createdAt: row.createdAt,
                }),
              );
            }
            // ResultEvent, SystemRetryEvent, UnknownEvent -> skipped
          }

          return new ReconstructedSession({
            sessionId: extractedSessionId,
            messages,
          });
        }).pipe(
          Effect.annotateLogs(annotations.operation, "reconstruct"),
          Effect.annotateLogs(annotations.sessionId, sessionId),
        );

      return { reconstruct };
    }).pipe(
      Effect.annotateLogs(annotations.service, "session-reconstructor"),
    ),
  );
```

**Confidence:** HIGH -- Follows the exact same `Context.Tag` + `Layer.effect` + `Effect.gen` pattern used by EventStore and TabStore.

### Pattern 4: EventStore API Extension

**What:** The current `EventStore.getBySession` returns `ReadonlyArray<StoredEvent>` -- decoded event data only, discarding row metadata (sequence_number, created_at). Per D-02, ChatMessage needs these as `id` and `createdAt`.

**Solution:** Add a `getBySessionWithMeta` method to EventStore that returns row metadata alongside decoded events.

```typescript
// New type in event-store schemas or a new file
interface StoredEventWithMeta {
  readonly event: StoredEvent;
  readonly sequenceNumber: number;
  readonly createdAt: string;
}

// Extended EventStore service definition
export class EventStore extends Context.Tag("EventStore")<
  EventStore,
  {
    readonly append: (...) => ...;
    readonly getBySession: (...) => ...;
    readonly getBySessionWithMeta: (
      sessionId: string,
    ) => Effect.Effect<ReadonlyArray<StoredEventWithMeta>, DatabaseQueryError>;
    readonly purgeSession: (...) => ...;
  }
>() {}
```

**Why not modify `getBySession` directly:** The existing method is used by the write pipeline tests and potentially other consumers. Adding a new method avoids breaking existing code and keeps backward compatibility.

**Implementation:** The SQL query is the same, but instead of only returning the decoded event, it returns a wrapper with the row metadata. The existing `getBySession` can internally delegate to `getBySessionWithMeta` and map to extract just the events.

**Confidence:** HIGH -- Based on direct reading of the EventStore service source code and the EventRow interface.

### Anti-Patterns to Avoid

- **Direct SQL in SessionReconstructor:** Do not have the reconstructor depend on `Database` directly. It should go through `EventStore` to maintain abstraction boundaries.
- **Mutable accumulator shared across async boundaries:** The fold is synchronous over a `ReadonlyArray` -- use a simple `for...of` loop with local `let` variables, not Effect Ref.
- **Using `as` for Schema types:** When constructing `ChatMessage` or `ReconstructedSession`, use the Schema class constructor (`new ChatMessage({...})`) rather than casting. This validates at construction time per codebase conventions.
- **Modifying existing `ChatMessage` interface in `use-claude-chat.ts`:** The hook currently uses a plain TypeScript interface. The new `ChatMessage` Schema class should be defined in the reconstruction schemas file, and the hook should migrate to using it. However, this must be done carefully to avoid breaking the renderer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text extraction from AssistantMessageEvent | Inline filter/map/join in each consumer | `extractAssistantText()` shared utility in `src/lib/` | D-12 mandates single source of truth; duplicated logic diverges |
| Schema validation for RPC payloads | Manual type checking | Effect Schema classes (`Schema.Class`) | Codebase convention; `@effect/rpc` requires Schema for payload/success types |
| RPC transport | Custom IPC message routing | `@effect/rpc` with `RpcGroup.merge()` | Already built; type-safe; handles serialization, errors, streams |
| Event type narrowing | Manual `event.type === "..."` checks | Existing type guards (`isSystemInit`, `isAssistantMessage`, `isUserMessage`) | Already available; Schema.is provides exhaustive narrowing |

## Common Pitfalls

### Pitfall 1: RpcServer.make Does Not Accept Variadic Groups
**What goes wrong:** D-06 assumes `RpcServer.make` accepts multiple group arguments. It does not.
**Why it happens:** The `@effect/rpc` API accepts exactly one `RpcGroup` parameter for both `make` and client.
**How to avoid:** Use `ClaudeRpcGroup.merge(PersistenceRpcGroup)` to produce a single merged group, then pass that to `RpcServer.make` and `RpcClient.make`.
**Warning signs:** TypeScript error on `RpcServer.make(group1, group2)`.

### Pitfall 2: Handler Layers Must Cover All RPCs in Merged Group
**What goes wrong:** After merging groups, if only one group's handler layer is provided, RPCs from the other group fail at runtime with missing handler errors.
**Why it happens:** `RpcServer.make(MergedGroup)` expects handler context for ALL RPCs in the merged group.
**How to avoid:** Ensure both `ClaudeRpcHandlers` (from `ClaudeRpcGroup.toLayer()`) AND `PersistenceRpcHandlers` (from `PersistenceRpcGroup.toLayer()`) are in the layer composition. They can be independent layers -- the server pulls handlers from the context.
**Warning signs:** Runtime error about missing handler for an RPC tag.

### Pitfall 3: EventStore.getBySession Discards Row Metadata
**What goes wrong:** `ChatMessage.id` (D-02) requires `sequence_number` from the DB row, and `ChatMessage.createdAt` requires `created_at`. The current `getBySession` returns only decoded `StoredEvent` objects.
**Why it happens:** The current implementation decodes `event_data` JSON and returns only the typed event, discarding the surrounding row.
**How to avoid:** Add `getBySessionWithMeta` to EventStore that returns `{ event: StoredEvent, sequenceNumber: number, createdAt: string }` tuples.
**Warning signs:** Unable to populate `ChatMessage.id` and `ChatMessage.createdAt` fields.

### Pitfall 4: ChatMessage Schema Class vs Interface Migration
**What goes wrong:** `use-claude-chat.ts` currently defines `ChatMessage` as a plain TypeScript interface `{ content: string, role: "user" | "assistant" }`. The new Schema class adds `id` and `createdAt` fields which breaks the hook.
**Why it happens:** The hook constructs messages inline without `id` or `createdAt`.
**How to avoid:** Phase approach: (1) Create the Schema class `ChatMessage` in the reconstruction schemas. (2) Modify the hook to use the Schema class. (3) Since the hook creates messages during live streaming (no DB row metadata available), it needs to assign temporary values -- for live streaming, `id` can be a negative counter (or 0) and `createdAt` can be `new Date().toISOString()`. Alternatively, keep the hook using a separate lighter type and only use the Schema class for reconstruction. The cleanest approach: export a factory function or allow the hook to continue using its own interface for now, with the Schema class used only for persistence/RPC. Per D-12 the text extraction is shared, but the message types can differ between live and reconstructed contexts.
**Warning signs:** TypeScript errors in `use-claude-chat.ts` after importing the new ChatMessage class.

### Pitfall 5: Non-Streaming RPC Array Return
**What goes wrong:** `listTabs` needs to return `ReadonlyArray<Tab>`. If the success schema is just `Tab`, it returns a single Tab, not an array.
**Why it happens:** `Rpc.make` success schema defines the wire type for the response.
**How to avoid:** Use `Schema.Array(Tab)` as the success schema for `listTabs`. For `reconstructSession`, use `ReconstructedSession` directly (it wraps the array internally).
**Warning signs:** Runtime decode error when trying to return an array through a scalar-typed RPC.

### Pitfall 6: Electron Import in Tests
**What goes wrong:** Tests that import modules which transitively import `electron` or `better-sqlite3` fail because Electron rebuilds native binaries for its own Node ABI.
**Why it happens:** Vitest uses system Node.js, not Electron's bundled Node.
**How to avoid:** Follow existing test pattern: mock `SqlClient.SqlClient` via `Layer.succeed`, never import Electron modules in test-reachable code. The `SessionReconstructor` depends on `EventStore` (mockable) not on `Database` or `SqlClient` directly.
**Warning signs:** `Error: The module was compiled against a different Node.js version` in test output.

## Code Examples

### Shared Text Extraction Utility (D-12)

```typescript
// src/lib/extract-assistant-text.ts
import type { AssistantMessageEvent } from "@/services/claude-cli/events";

export const extractAssistantText = (event: AssistantMessageEvent): string =>
  event.message.content
    .filter((block): block is { type: "text"; text: string } =>
      block.type === "text" && "text" in block,
    )
    .map((block) => block.text)
    .join("");
```

Source: Extracted from `src/hooks/use-claude-chat.ts` lines 74-77.

### ChatMessage and ReconstructedSession Schema Classes (D-01, D-02, D-03)

```typescript
// src/services/database/session-reconstructor/schemas.ts
import { Schema } from "effect";

export class ChatMessage extends Schema.Class<ChatMessage>("ChatMessage")({
  content: Schema.String,
  createdAt: Schema.String,
  id: Schema.Number,
  role: Schema.Union(Schema.Literal("user"), Schema.Literal("assistant")),
}) {}

export class ReconstructedSession extends Schema.Class<ReconstructedSession>(
  "ReconstructedSession",
)({
  messages: Schema.Array(ChatMessage),
  sessionId: Schema.String,
}) {}
```

### PersistenceRpcGroup Definition

```typescript
// src/services/persistence-rpc/group.ts
import { Rpc, RpcGroup } from "@effect/rpc";
import { DatabaseErrorSchema } from "../database/errors";
import { ReconstructedSession } from "../database/session-reconstructor/schemas";
import { Tab } from "../database/tab-store/schemas";
import {
  ListTabsParams,
  ReconstructSessionParams,
} from "./params";

export class PersistenceRpcGroup extends RpcGroup.make(
  Rpc.make("reconstructSession", {
    payload: ReconstructSessionParams,
    success: ReconstructedSession,
    error: DatabaseErrorSchema,
  }),
  Rpc.make("listTabs", {
    payload: ListTabsParams,
    success: Schema.Array(Tab),
    error: DatabaseErrorSchema,
  }),
) {}
```

### RPC Params

```typescript
// src/services/persistence-rpc/params.ts
import { Schema } from "effect";

export class ReconstructSessionParams extends Schema.Class<ReconstructSessionParams>(
  "ReconstructSessionParams",
)({
  sessionId: Schema.String,
}) {}

export class ListTabsParams extends Schema.Class<ListTabsParams>(
  "ListTabsParams",
)({}) {}
```

### StoredEventWithMeta Interface

```typescript
// Addition to src/services/database/event-store/schemas.ts
export interface StoredEventWithMeta {
  readonly createdAt: string;
  readonly event: StoredEvent;
  readonly sequenceNumber: number;
}
```

### Mock Pattern for SessionReconstructor Tests

```typescript
// Following existing test pattern from event-store/__tests__/service.test.ts
const mockEventStore = {
  append: () => Effect.succeed(undefined as void),
  getBySession: () => Effect.succeed([]),
  getBySessionWithMeta: (sessionId: string) =>
    Effect.succeed(testRows),
  purgeSession: () => Effect.succeed(undefined as void),
};

const testLayer = makeSessionReconstructorLive().pipe(
  Layer.provide(
    Layer.succeed(EventStore, mockEventStore),
  ),
);
```

## Validation Architecture

### Test Framework

- **Framework:** Vitest 4.1.1
- **Config file:** `vitest.config.mts`
- **Quick run command:** `npm test`
- **Full suite command:** `npm test`

### Phase Requirements to Test Map

- **RECON-01** (fold logic): Unit tests for SessionReconstructor.reconstruct() covering all event types, empty sessions, incomplete sessions, multi-turn conversations. Test type: unit. Command: `npx vitest run src/services/database/session-reconstructor/__tests__/service.test.ts`. File exists: No (Wave 0).
- **RECON-01** (text extraction): Unit test for extractAssistantText utility. Test type: unit. Command: `npx vitest run src/lib/__tests__/extract-assistant-text.test.ts`. File exists: No (Wave 0).
- **RECON-01** (schemas): Schema round-trip tests for ChatMessage and ReconstructedSession. Test type: unit. Command: `npx vitest run src/services/database/session-reconstructor/__tests__/schemas.test.ts`. File exists: No (Wave 0).
- **RECON-02** (session_id extraction): Covered by fold logic tests -- verify SessionReconstructor extracts session_id from SystemInitEvent. Test type: unit. Same test file as RECON-01 fold logic.
- **RECON-03** (RPC handlers): Unit tests for PersistenceRpcHandlers calling through to SessionReconstructor and TabStore. Test type: unit. Command: `npx vitest run src/services/persistence-rpc/__tests__/handlers.test.ts`. File exists: No (Wave 0).

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- `src/services/database/session-reconstructor/__tests__/service.test.ts` -- covers RECON-01, RECON-02
- `src/services/database/session-reconstructor/__tests__/schemas.test.ts` -- covers RECON-01 (schemas)
- `src/lib/__tests__/extract-assistant-text.test.ts` -- covers RECON-01 (text extraction)
- `src/services/persistence-rpc/__tests__/handlers.test.ts` -- covers RECON-03

No framework install needed -- Vitest 4.1.1 already configured and working (113 tests passing).

## Open Questions

1. **RPC Array Return Schema for listTabs**
   - What we know: `Rpc.make` `success` field defines the response schema. For streaming RPCs, each emitted item matches the schema. For non-streaming RPCs, the full response matches the schema.
   - What's unclear: Whether `Schema.Array(Tab)` works directly as a success type in `Rpc.make`, or if a wrapper class is needed (e.g., `class TabList extends Schema.Class("TabList")({ tabs: Schema.Array(Tab) }) {}`).
   - Recommendation: Try `Schema.Array(Tab)` first. If it fails at the RPC serialization layer, fall back to a wrapper class. The wrapper class approach is safer and more consistent with `ReconstructedSession`.

2. **ChatMessage Type Migration in use-claude-chat.ts**
   - What we know: The hook currently uses a plain interface `{ content: string, role: "user" | "assistant" }`. The new Schema class adds `id` and `createdAt`.
   - What's unclear: Whether to migrate the hook to use the full Schema class (requiring synthetic values for live streaming) or keep separate types for live vs. reconstructed messages.
   - Recommendation: For Phase 4, keep the hook's existing interface as-is. The shared `extractAssistantText` utility is the only change to the hook. The Schema class `ChatMessage` is used only in the reconstruction path. Phase 5 (tab restore) can unify the types when the renderer actually needs to display reconstructed messages.

## Sources

### Primary (HIGH confidence)
- `@effect/rpc` 0.75.0 source code (installed in node_modules) -- verified `RpcGroup.merge()`, `RpcServer.make` single-group signature, `RpcClient.make` single-group signature, client-side prefix/namespace handling
- `src/services/claude-rpc/group.ts` -- existing `RpcGroup.make` + `Rpc.make` pattern for ClaudeRpcGroup
- `src/services/claude-rpc/server.ts` -- existing `ClaudeRpcGroup.toLayer()` handler pattern, `ElectronServerProtocol`, `startRpcServer`
- `src/services/claude-rpc/client.ts` -- existing `RpcClient.make(ClaudeRpcGroup)` pattern, `ElectronClientProtocol`
- `src/services/database/event-store/service.ts` -- EventRow interface, getBySession implementation, Schema.parseJson decode pattern
- `src/services/database/event-store/service-definition.ts` -- EventStore Context.Tag API
- `src/services/database/event-store/schemas.ts` -- StoredEvent union, UserMessageEvent
- `src/services/database/tab-store/service-definition.ts` -- TabStore.getAll() API
- `src/services/claude-cli/events.ts` -- AssistantMessageEvent content block structure, type guards
- `src/hooks/use-claude-chat.ts` -- existing ChatMessage interface, text extraction logic at lines 74-77
- `src/main.ts` -- Layer composition pattern, existing layer chain

### Secondary (MEDIUM confidence)
- `node_modules/@effect/rpc/dist/dts/RpcGroup.d.ts` -- TypeScript type signatures for merge, add, toLayer
- `node_modules/@effect/rpc/dist/dts/RpcServer.d.ts` -- make signature (single group parameter)
- `node_modules/@effect/rpc/dist/dts/RpcClient.d.ts` -- make signature (single group parameter)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use; no new dependencies needed
- Architecture: HIGH -- all patterns verified from existing codebase; RpcGroup.merge verified from source
- Pitfalls: HIGH -- identified from direct code reading (EventStore row metadata gap, multi-group wiring)

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable; no external dependency changes expected)
