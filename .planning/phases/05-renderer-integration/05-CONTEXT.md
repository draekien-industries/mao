# Phase 5: Renderer Integration - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Users experience seamless app restart — tabs restore with full conversation history, tool results appear in reconstructed conversations, and quitting the app never loses data. Per-tab CLI isolation via ManagedRuntime sets up the architecture for future persistent subprocesses. Does not include stream-json input mode, search/analytics, or schema migration tooling — those are future work.

</domain>

<decisions>
## Implementation Decisions

### Tab restore flow
- **D-01:** Hydrate the active tab's conversation immediately on app start via `reconstructSession` RPC. Other tabs lazy-load when the user clicks them. Fastest perceived startup.
- **D-02:** No active tab persistence — default to the first available tab in the list on app reopen. `loadProjectsAtom` already implements this behavior. TAB-02 requirement satisfied by "first tab wins" rather than remembering exact tab.
- **D-03:** Skeleton message loading state while a tab's conversation is being hydrated. Reuse the `sessionLoadingAtom` pattern from Phase 04.2 (UI-05). Message-shaped skeleton blocks resolve into real messages.

### Graceful shutdown
- **D-04:** On app quit, kill all in-flight CLI streams and discard in-memory buffers. Send SIGTERM to child processes. The last persisted complete event is the recovery point. Matches Phase 3 design (WPIPE-02: buffer discarded on termination). Fast shutdown path.
- **D-05:** Runtime dispose is sufficient for DB cleanup — `SqliteClient` layer's `acquireRelease` semantics (Phase 1 INFRA-03) handle connection closure. WAL mode provides crash safety. No explicit `db.close()` call needed before runtime dispose.

### RPC client isolation
- **D-06:** Per-tab ManagedRuntime — each tab gets its own `ManagedRuntime` with a `ClaudeCliLive` layer. Main runtime handles shared services (DB, RPC server); per-tab runtimes handle CLI work.
- **D-07:** Per-tab runtimes enable future migration to `stream-json` input mode with persistent multi-turn subprocesses. Each tab's subprocess lifecycle ties to the tab's runtime — `runtime.dispose()` naturally kills the long-lived process on tab close.
- **D-08:** Error boundaries per-tab — one crashed subprocess doesn't affect other tabs. Per-tab runtimes provide natural isolation.

### Tool result persistence
- **D-09:** Define a `ToolResultEvent` schema (tool_use_id, content, is_error). Store as a new event type in EventStore alongside existing event types. Full fidelity restoration of tool use in conversations.
- **D-10:** Tool results rendered as separate message blocks in restored conversations — distinct from the assistant message that invoked the tool. Matches Claude's actual turn structure (assistant -> tool_result -> assistant).

### Session resume behavior
- **D-11:** Wait for user action — restored conversations display as static history. User sends a new message (which uses `--resume` under the hood) to continue the session. No auto-spawning of CLI processes on app start.

### Folded Todos
- **Persist tool_result as typed schema** — Addressed by D-09: `ToolResultEvent` schema with typed fields, stored as a new event type in EventStore.
- **Isolate RPC clients per tab for independent claude-cli subprocesses** — Addressed by D-06/D-07: per-tab ManagedRuntime with independent ClaudeCliLive layers.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — TAB-02 (active tab persistence, simplified to first-tab default), TAB-03 (full tab layout restore), SAFE-01 (graceful shutdown)

### Prior Phase Context
- `.planning/phases/04-session-reconstruction/04-CONTEXT.md` — ReconstructedSession schema (D-01, D-02), PersistenceRpcGroup design (D-04 through D-07), event folding logic (D-08 through D-14)
- `.planning/phases/04.3-multi-tab-orchestration-with-background-streaming/04.3-CONTEXT.md` — Per-tab atom families, status indicators, smart scroll, concurrency management
- `.planning/phases/04.5-fix-tab-working-directory-mismatch/04.5-CONTEXT.md` — cwdAtom family threading cwd through to CLI spawn
- `.planning/phases/03-write-pipeline/03-CONTEXT.md` — WPIPE-02 buffer discard on termination, PersistentClaudeCli stream architecture
- `.planning/phases/01-sqlite-infrastructure/01-CONTEXT.md` — Database service design, acquireRelease lifecycle

### Architecture & Conventions
- `.planning/codebase/CONVENTIONS.md` — Effect-TS service patterns, testing patterns
- `.planning/codebase/STRUCTURE.md` — File locations, naming conventions, where to add new code
- `.planning/codebase/ARCHITECTURE.md` — Layer composition, RPC architecture, process model

### Existing Code (Critical for Implementation)
- `src/main.ts` — Layer composition, before-quit handler (lines 116-127), ManagedRuntime lifecycle
- `src/atoms/sidebar.ts` — `loadProjectsAtom` (lines 52-69), `setActiveTabAtom`, `projectsAtom`
- `src/atoms/chat.ts` — Per-tab atoms (messages, streaming, error, events), `sendMessageAtom`, `cwdAtom` family
- `src/services/persistence-rpc/group.ts` — `listTabs` and `reconstructSession` RPC definitions
- `src/services/persistence-rpc/handlers.ts` — RPC handler implementations
- `src/services/database/session-reconstructor/service.ts` — SessionReconstructor service
- `src/services/database/event-store/schemas.ts` — StoredEvent union, existing event types (where ToolResultEvent will be added)
- `src/services/claude-cli/service.ts` — ClaudeCliLive (needs per-tab instantiation)
- `src/services/claude-cli/events.ts` — ClaudeEvent union with type guards (extend for tool results)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `reconstructSession` RPC — Already wired in persistence-rpc group, never called from renderer yet. Phase 5 connects this.
- `loadProjectsAtom` — Already hydrates sidebar from DB on app start and defaults to first tab. Foundation for tab restore.
- `sessionLoadingAtom` — Existing skeleton loading pattern for tab switches. Reuse for hydration loading state.
- `sendMessageAtom` — Global action that forks fibers per call. Needs refactoring for per-tab runtime model.
- `before-quit` handler — Exists in main.ts, disposes ManagedRuntime. Needs extension for per-tab runtime disposal.
- `StoredEvent` union schema — Extensible with new event types (ToolResultEvent).

### Established Patterns
- **Atom families**: `Atom.family` with `Atom.keepAlive` for per-tab state — follow for any new per-tab atoms
- **RPC call from atoms**: `RendererRpcClient` accessed via `yield* RendererRpcClient` inside `appRuntime.fn` — follow for reconstruction calls
- **Layer composition**: `Layer.provideMerge` chain in main.ts — per-tab runtimes will need a subset of this chain
- **Event schema extension**: Add to `ClaudeEvent` union before `UnknownEvent` catch-all

### Integration Points
- `loadProjectsAtom` — Extend to call `reconstructSession` for the active tab after loading projects
- `setActiveTabAtom` — Extend to call `reconstructSession` for newly activated tabs (lazy hydration)
- `main.ts` before-quit — Extend to dispose per-tab runtimes before main runtime
- `EventStore` schemas — Add `ToolResultEvent` to `StoredEvent` union
- `SessionReconstructor` fold logic — Extend to handle `ToolResultEvent` → separate message block

</code_context>

<specifics>
## Specific Ideas

- Skeleton messages (chat bubble shapes) during hydration, resolving into real messages — consistent with existing session switch skeleton pattern
- Tool results as separate message blocks matching Claude's turn structure: assistant (with tool_use) -> tool_result -> assistant (with text response)
- Per-tab ManagedRuntime prepares for future `stream-json` input mode with persistent multi-turn subprocesses
- Kill-and-discard shutdown strategy — fast quit, no waiting, WAL mode handles crash safety

</specifics>

<deferred>
## Deferred Ideas

- **stream-json input mode** — Persistent multi-turn subprocesses per tab. Per-tab runtimes (D-06) prepare the isolation model for this.
- **Auto-resume interrupted sessions** — Could auto-resume tabs where last message was from user with no response. Deferred in favor of explicit user action (D-11).
- **Active tab memory** — Persisting which tab was active across restarts. Simplified to first-tab default (D-02).
- **Batch reconstruction** — `reconstructAll()` for eager startup. Per-session lazy loading sufficient for now.

### Reviewed Todos (not folded)
None — both matched todos were folded into scope.

</deferred>

---

*Phase: 05-renderer-integration*
*Context gathered: 2026-03-29*
