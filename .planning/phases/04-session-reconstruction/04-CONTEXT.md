# Phase 4: Session Reconstruction - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Read-path service that rebuilds full conversation state from stored events and exposes it to the renderer via RPC. Includes a SessionReconstructor service, a new PersistenceRpcGroup with reconstructSession and listTabs endpoints, and a shared text extraction utility. Does not include renderer-side UI integration, tab restore flow, or graceful shutdown — those belong to Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Reconstruction output shape
- **D-01:** Reconstruction returns a Schema class `ReconstructedSession` containing `{ sessionId: string, messages: ChatMessage[] }`. Session-level metadata (cost, model) excluded for now — can be added later without breaking the contract.
- **D-02:** `ChatMessage` is extended with `id` (sequence_number from DB — stable identity for React keys/scroll anchoring) and `createdAt` (ISO timestamp from DB row). New shape: `{ id: number, role: "user" | "assistant", content: string, createdAt: string }`.
- **D-03:** `ChatMessage` and `ReconstructedSession` are defined as Effect Schema classes — consistent with codebase patterns and works natively with `@effect/rpc`.

### RPC endpoint design
- **D-04:** Create a new `PersistenceRpcGroup` separate from `ClaudeRpcGroup`. Clean separation: CLI streaming vs persistence queries. Both groups share the same IPC transport via `ElectronServerProtocol`.
- **D-05:** `PersistenceRpcGroup` contains two non-streaming RPCs: `reconstructSession(sessionId)` → `ReconstructedSession` and `listTabs()` → `Tab[]`. Future persistence RPCs (search, stats) extend this group.
- **D-06:** `RpcServer.make` and `RpcClient.make` accept both groups as variadic arguments — single transport, single client. Researcher should verify the exact multi-group API with `@effect/rpc`.
- **D-07:** A new `PersistenceRpcHandlers` layer provides the handler implementations. Composed alongside `ClaudeRpcHandlers` in `main.ts` layer composition. Depends on `SessionReconstructor` and `TabStore`.

### Event folding logic
- **D-08:** `SessionReconstructor` is an Effect service (`Context.Tag`) with a `reconstruct(sessionId)` method. It calls `EventStore.getBySession` internally and folds events into `ReconstructedSession`.
- **D-09:** Event-to-message mapping:
  - `UserMessageEvent` → `ChatMessage { role: "user", content: prompt }`
  - `AssistantMessageEvent` → `ChatMessage { role: "assistant", content: extractedText }`
  - `SystemInitEvent` → extracts `session_id` to top-level field (not a message)
  - `ResultEvent` → skipped (marks turn end; cost/token data not included per D-01)
  - `SystemRetryEvent` → skipped (transient)
  - `UnknownEvent` → skipped
- **D-10:** Incomplete sessions (user message with no assistant response) are represented as-is — `messages` array contains only the user message. No placeholder assistant message inserted. Renderer detects this by checking if last message is `role: "user"`.
- **D-11:** Empty sessions (SystemInitEvent only, no messages) return `ReconstructedSession { sessionId, messages: [] }`. Session is valid and has a session_id for `--resume`.
- **D-12:** Text extraction from `AssistantMessageEvent` (filter text content blocks, join) is extracted into a shared utility function. Both `use-claude-chat.ts` hook and the reconstruction fold use it — single source of truth.

### Reconstruction trigger
- **D-13:** Reconstruction is per-session: `reconstruct(sessionId)` returns one `ReconstructedSession`. The renderer calls it per tab. Enables lazy loading (active tab first, others on demand). Matches `EventStore.getBySession` API shape.
- **D-14:** `listTabs` RPC included in Phase 4 scope so the renderer can discover tabs. Phase 5 wires both `listTabs` + `reconstructSession` into the tab restore flow.

### Claude's Discretion
- SessionReconstructor service file organization (under `src/services/database/` or a new directory)
- `ReconstructSessionParams` schema design (simple sessionId wrapper or richer)
- `listTabs` params/response schema design (passthrough to TabStore.getAll or filtered)
- Error type design for reconstruction failures (reuse DatabaseQueryError or new types)
- Test strategy for fold logic and RPC endpoints
- How to wire multi-group RPC if variadic `RpcServer.make` isn't supported (fallback: `RpcGroup.merge`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — RECON-01 through RECON-03 define the acceptance criteria for this phase

### Prior Phase Context
- `.planning/phases/01-sqlite-infrastructure/01-CONTEXT.md` — Database service design (D-01: @effect/sql-sqlite-node, D-02: Database tag wrapping SqlClient)
- `.planning/phases/02-storage-services/02-CONTEXT.md` — EventStore design (D-02: StoredEvent union, D-03: raw JSON on write/Schema decode on read), TabStore design (D-06: is_active/tab_order in localStorage)
- `.planning/phases/03-write-pipeline/03-CONTEXT.md` — PersistentClaudeCli decisions (D-08: pre-generated session_id, D-14: interrupted sessions keep user message)

### Architecture & Conventions
- `.planning/codebase/CONVENTIONS.md` — Effect-TS service patterns (service-definition.ts, service.ts, errors.ts structure), testing patterns (mock via Layer.succeed, no vi.mock)
- `.planning/codebase/STRUCTURE.md` — Where to add new services, file naming conventions
- `.planning/codebase/ARCHITECTURE.md` — Layer composition pattern, RPC architecture, process model

### Existing Code (Critical for Implementation)
- `src/services/database/event-store/service-definition.ts` — EventStore Context.Tag with `getBySession(sessionId)` API
- `src/services/database/event-store/schemas.ts` — StoredEvent union and UserMessageEvent schema
- `src/services/database/tab-store/service-definition.ts` — TabStore Context.Tag with `getAll()` API
- `src/services/database/tab-store/schemas.ts` — Tab, TabCreate, TabUpdate schemas
- `src/services/claude-rpc/group.ts` — ClaudeRpcGroup definition (reference for RpcGroup.make pattern)
- `src/services/claude-rpc/server.ts` — ClaudeRpcHandlers and ElectronServerProtocol (reference for handler layer and transport sharing)
- `src/services/claude-rpc/client.ts` — ClaudeCliFromRpc (reference for client-side RPC layer pattern)
- `src/services/claude-cli/events.ts` — ClaudeEvent union with type guards (isAssistantMessage used by text extraction)
- `src/hooks/use-claude-chat.ts` — Current ChatMessage type (lines 17-20) and text extraction logic (lines 74-77) to be refactored into shared utility
- `src/main.ts` — Layer composition where PersistenceRpcHandlers and SessionReconstructor layers need to be wired

### Project Constraints
- `.planning/PROJECT.md` — Constraints section (Effect-TS patterns, local only, no partial data)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EventStore.getBySession(sessionId)` — Returns `ReadonlyArray<StoredEvent>` decoded via Schema. The read API that reconstruction builds on.
- `TabStore.getAll()` — Returns `ReadonlyArray<Tab>`. Directly exposed via `listTabs` RPC.
- `StoredEvent` schema union (`src/services/database/event-store/schemas.ts`) — Type guards available for all event types.
- Type guards: `isSystemInit`, `isAssistantMessage`, `isResult`, `isUserMessage` — used in the fold function to dispatch event handling.
- `ElectronServerProtocol` / `ElectronClientProtocol` — Existing IPC transport shared by both RPC groups.
- Text extraction in `use-claude-chat.ts:74-77` — Current logic to extract to shared utility.

### Established Patterns
- **Service structure**: `service-definition.ts` (Context.Tag) + `service.ts` (Layer.effect) + `errors.ts` — follow for SessionReconstructor
- **RPC group**: `RpcGroup.make(Rpc.make(...))` in group.ts, `Group.toLayer(handler)` in server.ts — follow for PersistenceRpcGroup
- **RPC client**: `RpcClient.make(Group)` wrapped as a service Layer — follow for persistence client
- **Layer composition**: `Layer.provideMerge` chain in `src/main.ts` — SessionReconstructor and PersistenceRpcHandlers slot into this chain
- **Schema classes**: `Schema.Class` for data types — follow for ChatMessage and ReconstructedSession

### Integration Points
- `src/main.ts` — Layer composition: add SessionReconstructorLive, PersistenceRpcHandlers
- `src/services/claude-rpc/server.ts` — `RpcServer.make` needs both ClaudeRpcGroup and PersistenceRpcGroup
- `src/services/claude-rpc/client.ts` — `RpcClient.make` needs both groups for the renderer-side client
- `src/hooks/use-claude-chat.ts` — Refactor text extraction into shared utility (non-breaking change)

</code_context>

<specifics>
## Specific Ideas

- ChatMessage shape: `{ id: number, role: "user" | "assistant", content: string, createdAt: string }` where `id` is the sequence_number from the DB row
- Two RPC groups sharing one transport — `PersistenceRpcGroup` for persistence queries, `ClaudeRpcGroup` for CLI streaming
- Shared `extractAssistantText()` utility used by both the reconstruction fold and the existing `useClaudeChat` hook

</specifics>

<deferred>
## Deferred Ideas

- **Session-level metadata** — Adding model, totalCost, isInterrupted fields to ReconstructedSession. Can be added when the renderer needs them.
- **Batch reconstruction** — A reconstructAll() endpoint for eager startup. Per-session is sufficient; batch can be added if lazy loading proves insufficient.
- **ToolResultEvent schema** — From Phase 3 deferred: typed schema for tool_result events. Would affect reconstruction fold if these events are ever persisted.

</deferred>

---

*Phase: 04-session-reconstruction*
*Context gathered: 2026-03-26*
