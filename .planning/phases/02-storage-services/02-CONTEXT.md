# Phase 2: Storage Services - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Effect services for appending events and managing tab metadata, with correct partitioning by session. Provides the append/query API that Phase 3 (Write Pipeline) writes to and Phase 4 (Session Reconstruction) reads from. Does not include stream buffering, CLI interception, or renderer integration.

</domain>

<decisions>
## Implementation Decisions

### User message schema
- **D-01:** Synthetic user_message events store prompt text only: `{ prompt: "..." }`. Timestamp comes from the `created_at` column. No duplicate metadata (model, cost, etc.) that's available from other event types.
- **D-02:** Create a separate `StoredEvent` schema union that includes both `ClaudeEvent` types and a new `UserMessageEvent`. Keeps `ClaudeEvent` pure (matches CLI output exactly) while the storage layer owns its own event type.
- **D-03:** EventStore stores raw JSON strings on write (no Schema validation — events are already validated upstream by CLI stream parsing). EventStore decodes via Schema on read, returning typed `StoredEvent` objects to callers.

### Tab lifecycle
- **D-04:** Tabs are hard-deleted (DELETE FROM tabs) when closed. No soft-delete flag.
- **D-05:** Tab deletion cascades to events: TabStore.delete() internally calls EventStore.purgeSession() in the same transaction for atomic cleanup. TabStore depends on EventStore.
- **D-06:** `is_active` and `tab_order` columns are removed from the `tabs` table. Both move to renderer-side localStorage. The `tabs` table simplifies to: id, session_id, cwd, git_branch, display_label, created_at, updated_at. Phase 1 schema needs a minor update to drop these columns.
- **D-07:** TabStore supports atomic reorder operations (but the actual ordering data lives in localStorage, not the database — so this means TabStore itself does NOT need a reorder method; renderer manages ordering client-side).

### Data retention
- **D-08:** EventStore exposes a `purgeSession(sessionId)` method that deletes all events for a given session. Used by TabStore cascade delete and available for future "clear conversation" features.
- **D-09:** TabStore coordinates the cascade: TabStore.delete(tabId) internally purges events via EventStore before removing the tab row, all in one transaction.

### Service structure
- **D-10:** Two separate Effect services: EventStore and TabStore, each as their own Context.Tag with service-definition.ts, service.ts, and errors as needed.
- **D-11:** Both services live under `src/services/database/` as subdirectories: `src/services/database/event-store/` and `src/services/database/tab-store/`. Groups all persistence code together.

### Claude's Discretion
- Sequence number management strategy (auto-increment per session, caller-provided, etc.)
- EventStore query API surface beyond "get all events by session" (by type, by range, count, etc.)
- Error type granularity (new error types per store vs. reusing DatabaseQueryError)
- Exact StoredEvent schema design and UserMessageEvent field names
- Test strategy and mock approach for SqlClient

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — EVNT-01 through EVNT-04 define event storage acceptance criteria; TAB-01 defines tab metadata fields (note: is_active and tab_order removed per D-06)

### Phase 1 Context
- `.planning/phases/01-sqlite-infrastructure/01-CONTEXT.md` — Database service design decisions (D-01: @effect/sql-sqlite-node, D-02: Database tag wrapping SqlClient, D-05: Phase 1 owns schema/Phase 2 owns queries)

### Architecture & Conventions
- `.planning/codebase/CONVENTIONS.md` — Effect-TS service patterns (service-definition.ts, service.ts, errors.ts structure), testing patterns (mock via Layer.succeed, no vi.mock)
- `.planning/codebase/STRUCTURE.md` — Where to add new services, file naming conventions
- `.planning/codebase/ARCHITECTURE.md` — Layer composition pattern and process model

### Existing Code
- `src/services/database/service-definition.ts` — Database Context.Tag exposing `{ sql: SqlClient.SqlClient }` — both stores depend on this
- `src/services/database/service.ts` — makeDatabaseLive() implementation — reference for Layer.effect pattern
- `src/services/database/schema.ts` — Current table DDL (needs update per D-06 to drop is_active and tab_order)
- `src/services/database/errors.ts` — Existing DatabaseQueryError — may be reused or extended
- `src/services/claude-cli/events.ts` — ClaudeEvent union schema — StoredEvent will wrap these types
- `src/services/claude-cli/service-definition.ts` — Reference for Context.Tag pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Database` service tag (`src/services/database/service-definition.ts`): Provides `{ sql: SqlClient.SqlClient }` — both EventStore and TabStore depend on this for tagged template queries
- `ClaudeEvent` union schema (`src/services/claude-cli/events.ts`): All CLI event types with type guards — StoredEvent wraps these
- `DatabaseQueryError` (`src/services/database/errors.ts`): Existing error type for query failures — can be reused or extended for store-specific errors
- `annotations` object (`src/services/diagnostics.ts`): Structured logging keys — new stores should add their own annotation values

### Established Patterns
- **Service structure**: `service-definition.ts` (Context.Tag) + `service.ts` (Layer.effect) + `errors.ts` (TaggedError) in `src/services/claude-cli/` — follow this for both stores
- **Layer composition**: `Layer.provideMerge` chain in `src/main.ts` — EventStore and TabStore layers need to be added here
- **Schema unions**: `Schema.Union` with type guards via `Schema.is()` — follow for StoredEvent
- **Testing**: Mock `SqlClient.SqlClient` with `unsafe` handler tracking calls — established in `src/services/database/__tests__/service.test.ts`

### Integration Points
- `src/main.ts` — Layer composition: EventStore and TabStore layers need to be wired after Database layer
- `src/services/database/schema.ts` — Needs update: drop `is_active` and `tab_order` columns from tabs table DDL
- Phase 3 will depend on EventStore for persisting CLI events
- Phase 4 will depend on EventStore for reading events back during reconstruction
- Phase 5 will depend on TabStore for tab restore on app reopen

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-storage-services*
*Context gathered: 2026-03-25*
