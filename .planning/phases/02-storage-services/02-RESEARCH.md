# Phase 2: Storage Services - Research

**Researched:** 2026-03-25
**Domain:** Effect-TS service layers for SQLite event and tab storage
**Confidence:** HIGH

## Summary

Phase 2 builds two Effect services -- EventStore and TabStore -- on top of the existing `Database` service that provides a `SqlClient.SqlClient` instance. Both services use `@effect/sql`'s tagged template literal API for parameterized queries, `sql.insert()` for record insertion, `sql.update()` for single-record updates, and `sql.withTransaction` for atomic multi-table operations (tab deletion cascading to event purge).

The existing codebase already has the complete pattern established: `service-definition.ts` (Context.Tag), `service.ts` (Layer.effect), `errors.ts` (Schema.TaggedError), and `__tests__/` with mock SqlClient. The Database service already bootstraps the schema (events and tabs tables). Phase 2 adds query logic only -- no schema changes beyond the D-06 column drop (removing `is_active` and `tab_order` from tabs).

The StoredEvent schema is a new union type that wraps existing ClaudeEvent types alongside a new UserMessageEvent. EventStore stores raw JSON strings on write and decodes via Schema on read (per D-03). Sequence numbers should be auto-incremented per session using `MAX(sequence_number) + 1` within a transaction to avoid gaps and race conditions in the single-process SQLite context.

**Primary recommendation:** Follow the established service pattern exactly. Use tagged template queries for all SQL. Use `sql.withTransaction` for the cascade delete. Keep error types simple by reusing `DatabaseQueryError` with descriptive messages rather than creating per-store error types.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Synthetic user_message events store prompt text only: `{ prompt: "..." }`. Timestamp comes from the `created_at` column. No duplicate metadata (model, cost, etc.) that's available from other event types.
- **D-02:** Create a separate `StoredEvent` schema union that includes both `ClaudeEvent` types and a new `UserMessageEvent`. Keeps `ClaudeEvent` pure (matches CLI output exactly) while the storage layer owns its own event type.
- **D-03:** EventStore stores raw JSON strings on write (no Schema validation -- events are already validated upstream by CLI stream parsing). EventStore decodes via Schema on read, returning typed `StoredEvent` objects to callers.
- **D-04:** Tabs are hard-deleted (DELETE FROM tabs) when closed. No soft-delete flag.
- **D-05:** Tab deletion cascades to events: TabStore.delete() internally calls EventStore.purgeSession() in the same transaction for atomic cleanup. TabStore depends on EventStore.
- **D-06:** `is_active` and `tab_order` columns are removed from the `tabs` table. Both move to renderer-side localStorage. The `tabs` table simplifies to: id, session_id, cwd, git_branch, display_label, created_at, updated_at. Phase 1 schema needs a minor update to drop these columns.
- **D-07:** TabStore supports atomic reorder operations (but the actual ordering data lives in localStorage, not the database -- so this means TabStore itself does NOT need a reorder method; renderer manages ordering client-side).
- **D-08:** EventStore exposes a `purgeSession(sessionId)` method that deletes all events for a given session. Used by TabStore cascade delete and available for future "clear conversation" features.
- **D-09:** TabStore coordinates the cascade: TabStore.delete(tabId) internally purges events via EventStore before removing the tab row, all in one transaction.
- **D-10:** Two separate Effect services: EventStore and TabStore, each as their own Context.Tag with service-definition.ts, service.ts, and errors as needed.
- **D-11:** Both services live under `src/services/database/` as subdirectories: `src/services/database/event-store/` and `src/services/database/tab-store/`. Groups all persistence code together.

### Claude's Discretion
- Sequence number management strategy (auto-increment per session, caller-provided, etc.)
- EventStore query API surface beyond "get all events by session" (by type, by range, count, etc.)
- Error type granularity (new error types per store vs. reusing DatabaseQueryError)
- Exact StoredEvent schema design and UserMessageEvent field names
- Test strategy and mock approach for SqlClient

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVNT-01 | Each complete CLI event stored as an immutable row with session_id, sequence_number, event_type, event_data, and created_at | EventStore.append() uses tagged template INSERT with sql.insert(); sequence_number auto-generated per session |
| EVNT-02 | User messages stored as synthetic user_message events for full conversation reconstruction | UserMessageEvent schema class with `{ prompt: string }`; stored via same EventStore.append() path with event_type "user_message" |
| EVNT-03 | Events partitioned by session_id for multi-tab independence | All EventStore queries filter by session_id; existing idx_events_session_id index supports this |
| EVNT-04 | Sequence numbers maintain strict event ordering within each session | Auto-increment via MAX(sequence_number)+1 within transaction per session; UNIQUE(session_id, sequence_number) constraint enforces correctness |
| TAB-01 | Tab metadata stored: repository/cwd, git branch, session ID, tab order, display label | TabStore CRUD operations; note D-06 removes tab_order and is_active from DB (moved to localStorage) -- TAB-01 is satisfied by cwd, git_branch, session_id, display_label columns plus client-side tab_order |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- NEVER use `as` type casting unless absolutely necessary. Prefer decoding via Effect Schema or type narrowing.
- NEVER use `any` type unless absolutely necessary. For complex types use `ReturnType`, `Parameters`, etc.
- Run `npm run check:write` after changes and resolve issues.
- Run `npm run typecheck` after changes and resolve issues.
- Run `npm test` after implementation to check for regressions.
- `noExplicitAny` is `"error"` in production code but `"off"` in test files (`**/__tests__/**`, `**/*.test.*`).

## Standard Stack

### Core (Already Installed)

- `@effect/sql` 0.51.0 -- SqlClient tagged template queries, sql.insert(), sql.update(), withTransaction, SqlSchema helpers
- `@effect/sql-sqlite-node` 0.52.0 -- SQLite adapter using better-sqlite3 under the hood
- `effect` 3.21.0 -- Context.Tag, Layer, Schema, Effect for service pattern
- `vitest` 4.1.1 -- Test runner

### No New Dependencies

This phase requires zero new npm packages. Everything is available from the existing stack.

## Architecture Patterns

### Service Directory Structure

```
src/services/database/
  service-definition.ts    # Database Context.Tag (existing)
  service.ts               # makeDatabaseLive (existing)
  schema.ts                # Table DDL (existing, needs D-06 update)
  errors.ts                # DatabaseQueryError etc. (existing)
  event-store/
    service-definition.ts  # EventStore Context.Tag
    service.ts             # makeEventStoreLive Layer
    schemas.ts             # UserMessageEvent, StoredEvent, row types
    __tests__/
      service.test.ts
      schemas.test.ts
  tab-store/
    service-definition.ts  # TabStore Context.Tag
    service.ts             # makeTabStoreLive Layer
    schemas.ts             # Tab row schema, input types
    __tests__/
      service.test.ts
      schemas.test.ts
```

### Pattern 1: Service Definition (Context.Tag)

**What:** Define service interface as an Effect Context.Tag, following the ClaudeCli pattern.

**Example:**
```typescript
// src/services/database/event-store/service-definition.ts
import type { Effect } from "effect";
import { Context } from "effect";
import type { DatabaseQueryError } from "../errors";
import type { StoredEvent } from "./schemas";

export class EventStore extends Context.Tag("EventStore")<
  EventStore,
  {
    readonly append: (
      sessionId: string,
      eventType: string,
      eventData: string,
    ) => Effect.Effect<void, DatabaseQueryError>;
    readonly getBySession: (
      sessionId: string,
    ) => Effect.Effect<ReadonlyArray<StoredEvent>, DatabaseQueryError>;
    readonly purgeSession: (
      sessionId: string,
    ) => Effect.Effect<void, DatabaseQueryError>;
  }
>() {}
```

### Pattern 2: Layer Implementation with Database Dependency

**What:** Implement service as a Layer.effect that depends on the Database tag, extracting the sql client.

**Example:**
```typescript
// src/services/database/event-store/service.ts
import { Effect, Layer } from "effect";
import { annotations } from "../../diagnostics";
import { DatabaseQueryError } from "../errors";
import { Database } from "../service-definition";
import { EventStore } from "./service-definition";

export const makeEventStoreLive = () =>
  Layer.effect(
    EventStore,
    Effect.gen(function* () {
      const { sql } = yield* Database;

      const append = (
        sessionId: string,
        eventType: string,
        eventData: string,
      ) =>
        Effect.gen(function* () {
          yield* sql`
            INSERT INTO events (session_id, sequence_number, event_type, event_data)
            VALUES (
              ${sessionId},
              (SELECT COALESCE(MAX(sequence_number), 0) + 1
               FROM events WHERE session_id = ${sessionId}),
              ${eventType},
              ${eventData}
            )
          `;
        }).pipe(
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: `Failed to append event for session ${sessionId}`,
              }),
          ),
          Effect.annotateLogs(annotations.operation, "append"),
        );

      // ... other methods

      return { append, getBySession, purgeSession };
    }).pipe(Effect.annotateLogs(annotations.service, "event-store")),
  );
```

### Pattern 3: Tagged Template Queries

**What:** Use the sql tagged template literal from SqlClient for all queries. Parameters are automatically bound and escaped.

**Example:**
```typescript
// SELECT with parameters
const rows = yield* sql<EventRow>`
  SELECT id, session_id, sequence_number, event_type, event_data, created_at
  FROM events
  WHERE session_id = ${sessionId}
  ORDER BY sequence_number ASC
`;

// INSERT with tagged template
yield* sql`
  INSERT INTO events (session_id, sequence_number, event_type, event_data)
  VALUES (${sessionId}, ${seqNum}, ${eventType}, ${eventData})
`;

// INSERT using sql.insert() helper
yield* sql`INSERT INTO tabs ${sql.insert({
  session_id: sessionId,
  cwd,
  git_branch: gitBranch,
  display_label: displayLabel,
})}`;

// UPDATE using sql.update() helper
yield* sql`UPDATE tabs SET ${sql.update(updates, ["id"])} WHERE id = ${tabId}`;

// DELETE
yield* sql`DELETE FROM events WHERE session_id = ${sessionId}`;
yield* sql`DELETE FROM tabs WHERE id = ${tabId}`;
```

### Pattern 4: Transactions for Cascade Delete

**What:** Use `sql.withTransaction` to wrap multiple operations atomically.

**Example:**
```typescript
// TabStore.delete cascading to EventStore.purgeSession
const deleteTab = (tabId: number) =>
  Effect.gen(function* () {
    const { sql } = yield* Database;
    // Look up the session_id for this tab
    const rows = yield* sql<{ session_id: string | null }>`
      SELECT session_id FROM tabs WHERE id = ${tabId}
    `;
    const tab = rows[0];
    if (!tab) return; // tab already gone

    // Purge events if tab had a session
    if (tab.session_id) {
      yield* sql`DELETE FROM events WHERE session_id = ${tab.session_id}`;
    }

    // Delete the tab
    yield* sql`DELETE FROM tabs WHERE id = ${tabId}`;
  }).pipe(sql.withTransaction);
```

**Note on D-05/D-09:** TabStore.delete() needs access to `sql.withTransaction` from the Database service. The cleanest approach is for the TabStore implementation to call `EventStore.purgeSession()` within a transaction boundary. Since both services share the same underlying SqlClient connection, `sql.withTransaction` will wrap both operations in a single SQLite transaction.

### Pattern 5: Schema Decode on Read

**What:** EventStore stores raw JSON on write (D-03) but decodes via Effect Schema on read.

**Example:**
```typescript
import { Schema } from "effect";

// Row type from database (before decode)
interface EventRow {
  readonly id: number;
  readonly session_id: string;
  readonly sequence_number: number;
  readonly event_type: string;
  readonly event_data: string;
  readonly created_at: string;
}

// Decode function
const decodeEventData = (row: EventRow): Effect.Effect<StoredEvent, ParseError> =>
  Schema.decodeUnknown(StoredEvent)(JSON.parse(row.event_data));
```

### Pattern 6: Layer Composition in main.ts

**What:** Wire EventStore and TabStore layers into the existing layer composition chain.

**Example:**
```typescript
// src/main.ts (updated)
const EventStoreLayer = makeEventStoreLive();
const TabStoreLayer = makeTabStoreLive();

const BaseLayer = Layer.provideMerge(
  ClaudeRpcHandlers,
  Layer.provideMerge(
    ClaudeCliLive,
    Layer.provideMerge(
      TabStoreLayer,                    // depends on Database + EventStore
      Layer.provideMerge(
        EventStoreLayer,                // depends on Database
        Layer.provideMerge(
          DatabaseLayer,                // depends on SqliteLive
          Layer.provideMerge(SqliteLive, NodeContext.layer),
        ),
      ),
    ),
  ),
);
```

### Anti-Patterns to Avoid

- **Raw SQL via sql.unsafe():** Do not use `sql.unsafe()` for queries with user-provided parameters. Use tagged template literals instead for automatic parameter binding and SQL injection prevention. `sql.unsafe()` is only appropriate for DDL statements (CREATE TABLE, PRAGMA) -- which are already handled in the existing schema.ts.
- **Schema validation on write:** Per D-03, EventStore does NOT validate event_data JSON on write. Events are already validated upstream by CLI stream parsing. Do not add decode/encode steps to the write path.
- **Sequence number from caller:** Do not make callers provide sequence numbers. The store should auto-assign them within a transaction to prevent gaps and duplicates.
- **Shared error types across domains:** Do not reuse ClaudeCliError types for database errors. Use the existing DatabaseQueryError or extend it.
- **vi.mock / vi.fn / vi.spyOn:** Per project conventions, never use Vitest mocking utilities. Mock dependencies via Layer.succeed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parameterized SQL | String concatenation or manual escaping | `sql` tagged template literal | Automatic parameter binding, SQL injection prevention |
| Record insertion | Manual column/value SQL building | `sql.insert({ ... })` helper | Handles column ordering, placeholder generation |
| Record updates | Manual SET clause building | `sql.update(record, omitKeys)` helper | Handles partial updates, column ordering |
| Transactions | Manual BEGIN/COMMIT/ROLLBACK | `sql.withTransaction` | Handles rollback on failure, connection isolation |
| JSON decode | Manual JSON.parse + type assertion | `Schema.decodeUnknown(StoredEvent)` | Type-safe decode with error channel, no `as` casting |
| Service mocking in tests | vi.mock / vi.fn | `Layer.succeed(Tag, mockImpl)` | Project convention, provides proper DI isolation |

## Common Pitfalls

### Pitfall 1: Sequence Number Race Conditions
**What goes wrong:** Two concurrent appends for the same session could read the same MAX(sequence_number) and produce a duplicate, violating the UNIQUE constraint.
**Why it happens:** If sequence numbers are computed in two separate queries (SELECT MAX then INSERT), there is a TOCTOU window.
**How to avoid:** Use a subselect within the INSERT statement: `VALUES (..., (SELECT COALESCE(MAX(sequence_number), 0) + 1 FROM events WHERE session_id = ?), ...)`. SQLite serializes writes, so the subselect and insert are atomic. Alternatively, wrap in `sql.withTransaction`. In this single-process Electron app, the risk is low but the subselect approach costs nothing and is correct by construction.
**Warning signs:** UNIQUE constraint violation errors during concurrent tab operations.

### Pitfall 2: Forgetting to Update schema.ts for D-06
**What goes wrong:** The existing `TABS_TABLE_SQL` in `schema.ts` includes `tab_order INTEGER NOT NULL` and `is_active INTEGER NOT NULL DEFAULT 0`. If not updated, the schema won't match what TabStore expects.
**Why it happens:** Phase 1 created the schema; Phase 2 needs to modify it per D-06.
**How to avoid:** Update `TABS_TABLE_SQL` in `schema.ts` first, before implementing TabStore. Since Phase 1 uses `CREATE TABLE IF NOT EXISTS`, existing databases with the old schema will need to handle the discrepancy (ALTER TABLE or accept schema change only applies to fresh DBs during dev).
**Warning signs:** TabStore queries referencing columns that don't exist, or existing columns that shouldn't be there.

### Pitfall 3: Transaction Boundary for Cascade Delete
**What goes wrong:** If TabStore.delete() calls EventStore.purgeSession() then deletes the tab row without a transaction, a crash between the two operations leaves orphaned tab rows or orphaned events.
**Why it happens:** Two separate SQL operations without a wrapping transaction.
**How to avoid:** Wrap both operations in `sql.withTransaction`. The key insight is that TabStore's delete method must access the raw sql client to wrap both the purgeSession logic and the tab delete in a single transaction, rather than calling EventStore.purgeSession() as an opaque Effect (which would use a separate transaction context).
**Warning signs:** Orphaned events after tab deletion, or tabs without events after crash recovery.

### Pitfall 4: JSON.parse Errors on Corrupt Data
**What goes wrong:** `Schema.decodeUnknown` will fail if `event_data` contains invalid JSON or doesn't match the StoredEvent schema.
**Why it happens:** Data corruption, schema evolution, or bugs in upstream event serialization.
**How to avoid:** Use `Effect.either` or `Effect.catchTag` when decoding to gracefully handle corrupt rows. Consider logging and skipping corrupt rows rather than failing the entire query. The UnknownEvent catchall in ClaudeEvent helps absorb unknown event types, but totally invalid JSON is a different failure mode.
**Warning signs:** ParseError exceptions during session reconstruction.

### Pitfall 5: Importing Electron Modules in Test-Reachable Code
**What goes wrong:** Tests fail with native module load errors because Electron rebuilds native binaries for its own Node ABI.
**Why it happens:** Service files that import from `electron` or `better-sqlite3` directly, then get imported by test files.
**How to avoid:** EventStore and TabStore depend on the Database Context.Tag, not on SqliteClient directly. Tests mock the SqlClient via Layer.succeed. No Electron or native module imports in the store code.
**Warning signs:** `Error: Cannot find module 'better-sqlite3'` in test output.

### Pitfall 6: Schema.Class vs Schema.TaggedError Confusion
**What goes wrong:** Using Schema.Class for error types or Schema.TaggedError for data types.
**Why it happens:** Both create Effect Schema classes but with different semantics.
**How to avoid:** Use `Schema.Class` for data types (UserMessageEvent, EventRow). Use `Schema.TaggedError` for error types (DatabaseQueryError). Never mix them.
**Warning signs:** Type errors when trying to yield errors, or when trying to use data types in error positions.

## Code Examples

### EventStore Service Definition
```typescript
// src/services/database/event-store/service-definition.ts
import type { Effect } from "effect";
import { Context } from "effect";
import type { DatabaseQueryError } from "../errors";
import type { StoredEvent } from "./schemas";

export class EventStore extends Context.Tag("EventStore")<
  EventStore,
  {
    readonly append: (
      sessionId: string,
      eventType: string,
      eventData: string,
    ) => Effect.Effect<void, DatabaseQueryError>;
    readonly getBySession: (
      sessionId: string,
    ) => Effect.Effect<ReadonlyArray<StoredEvent>, DatabaseQueryError>;
    readonly purgeSession: (
      sessionId: string,
    ) => Effect.Effect<void, DatabaseQueryError>;
  }
>() {}
```

### UserMessageEvent Schema
```typescript
// src/services/database/event-store/schemas.ts
import { Schema } from "effect";
import {
  AssistantMessageEvent,
  ResultEvent,
  SystemInitEvent,
  SystemRetryEvent,
  UnknownEvent,
} from "../../claude-cli/events";

export class UserMessageEvent extends Schema.Class<UserMessageEvent>(
  "UserMessageEvent",
)({
  type: Schema.Literal("user_message"),
  prompt: Schema.String,
}) {}

// StoredEvent wraps ClaudeEvent types + UserMessageEvent
// D-02: Keeps ClaudeEvent pure while storage layer owns its union
export const StoredEvent = Schema.Union(
  SystemInitEvent,
  SystemRetryEvent,
  AssistantMessageEvent,
  ResultEvent,
  UserMessageEvent,
  UnknownEvent, // must be last -- catchall
);
export type StoredEvent = typeof StoredEvent.Type;

export const isUserMessage = Schema.is(UserMessageEvent);
```

### TabStore Service Definition
```typescript
// src/services/database/tab-store/service-definition.ts
import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { DatabaseQueryError } from "../errors";
import type { Tab, TabCreate, TabUpdate } from "./schemas";

export class TabStore extends Context.Tag("TabStore")<
  TabStore,
  {
    readonly create: (
      input: TabCreate,
    ) => Effect.Effect<Tab, DatabaseQueryError>;
    readonly getById: (
      id: number,
    ) => Effect.Effect<Option.Option<Tab>, DatabaseQueryError>;
    readonly getAll: () => Effect.Effect<
      ReadonlyArray<Tab>,
      DatabaseQueryError
    >;
    readonly update: (
      id: number,
      input: TabUpdate,
    ) => Effect.Effect<void, DatabaseQueryError>;
    readonly delete: (
      id: number,
    ) => Effect.Effect<void, DatabaseQueryError>;
  }
>() {}
```

### Tab Schema Types
```typescript
// src/services/database/tab-store/schemas.ts
import { Schema } from "effect";

export class Tab extends Schema.Class<Tab>("Tab")({
  id: Schema.Number,
  session_id: Schema.NullOr(Schema.String),
  cwd: Schema.String,
  git_branch: Schema.NullOr(Schema.String),
  display_label: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
}) {}

export class TabCreate extends Schema.Class<TabCreate>("TabCreate")({
  session_id: Schema.optional(Schema.String),
  cwd: Schema.String,
  git_branch: Schema.optional(Schema.String),
  display_label: Schema.optional(Schema.String),
}) {}

export class TabUpdate extends Schema.Class<TabUpdate>("TabUpdate")({
  session_id: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  git_branch: Schema.optional(Schema.String),
  display_label: Schema.optional(Schema.String),
}) {}
```

### Mock SqlClient for Tests
```typescript
// Test helper following established pattern from service.test.ts
const makeMockSqlClient = (
  handler: (sql: string, params?: ReadonlyArray<unknown>) => Effect.Effect<ReadonlyArray<unknown>, unknown>,
) => {
  const calls: Array<{ sql: string; params?: ReadonlyArray<unknown> }> = [];
  return {
    calls,
    layer: Layer.succeed(SqlClient.SqlClient, {
      unsafe: (sqlString: string) => {
        calls.push({ sql: sqlString });
        return handler(sqlString);
      },
      // For tagged template queries, the SqlClient acts as a function
      // The mock needs to handle both tagged template and unsafe calls
    } as any),
  };
};
```

**Note on testing tagged template queries:** The existing mock pattern uses `unsafe` only. For services using tagged template queries (`sql\`...\``), the mock will need to handle the Constructor interface. The simplest approach is to track the compiled SQL string and parameters. Since `noExplicitAny` is off in test files, `as any` casts are acceptable for mock construction.

### Sequence Number Auto-Increment via Subselect
```typescript
// Atomic sequence number assignment -- no race condition
yield* sql`
  INSERT INTO events (session_id, sequence_number, event_type, event_data)
  VALUES (
    ${sessionId},
    (SELECT COALESCE(MAX(sequence_number), 0) + 1
     FROM events
     WHERE session_id = ${sessionId}),
    ${eventType},
    ${eventData}
  )
`;
```

### Cascade Delete with Transaction
```typescript
// TabStore delete with cascade -- D-05, D-09
const deleteTab = (tabId: number) =>
  Effect.gen(function* () {
    // Look up session_id before deleting
    const rows = yield* sql<{ session_id: string | null }>`
      SELECT session_id FROM tabs WHERE id = ${tabId}
    `;
    const tab = rows[0];
    if (tab?.session_id) {
      yield* sql`DELETE FROM events WHERE session_id = ${tab.session_id}`;
    }
    yield* sql`DELETE FROM tabs WHERE id = ${tabId}`;
  }).pipe(
    sql.withTransaction,
    Effect.mapError(
      (cause) =>
        new DatabaseQueryError({
          cause: String(cause),
          message: `Failed to delete tab ${tabId}`,
        }),
    ),
  );
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| sqlfx (tim-smart/sqlfx) | @effect/sql (monorepo) | 2024 | sqlfx merged into Effect monorepo as @effect/sql |
| Manual SQL string building | Tagged template literals | @effect/sql 1.0.0 | Automatic parameter binding, SQL injection prevention |
| Separate transaction management | sql.withTransaction | @effect/sql 1.0.0 | Declarative transaction boundaries with automatic rollback |

**Deprecated/outdated:**
- `sqlfx` package: Replaced by `@effect/sql` in the Effect monorepo
- `Effect.Tag` (old API): Replaced by `Context.Tag` (already used in this project)

## Validation Architecture

### Test Framework

- **Framework:** Vitest 4.1.1
- **Config file:** `vitest.config.mts`
- **Quick run command:** `npm test`
- **Full suite command:** `npm test`

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVNT-01 | CLI event stored as immutable row with correct columns | unit | `npx vitest run src/services/database/event-store/__tests__/service.test.ts -t "append"` | Wave 0 |
| EVNT-02 | User messages stored as synthetic user_message events | unit | `npx vitest run src/services/database/event-store/__tests__/service.test.ts -t "user message"` | Wave 0 |
| EVNT-03 | Events partitioned by session_id | unit | `npx vitest run src/services/database/event-store/__tests__/service.test.ts -t "session"` | Wave 0 |
| EVNT-04 | Sequence numbers maintain strict ordering within session | unit | `npx vitest run src/services/database/event-store/__tests__/service.test.ts -t "sequence"` | Wave 0 |
| TAB-01 | Tab metadata CRUD with correct fields | unit | `npx vitest run src/services/database/tab-store/__tests__/service.test.ts` | Wave 0 |
| D-05/D-09 | Cascade delete: tab deletion purges events atomically | unit | `npx vitest run src/services/database/tab-store/__tests__/service.test.ts -t "cascade"` | Wave 0 |
| D-06 | Schema update: is_active and tab_order removed from tabs | unit | `npx vitest run src/services/database/__tests__/schema.test.ts` | Existing (update) |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- `src/services/database/event-store/__tests__/service.test.ts` -- covers EVNT-01 through EVNT-04
- `src/services/database/event-store/__tests__/schemas.test.ts` -- covers StoredEvent decode, UserMessageEvent
- `src/services/database/tab-store/__tests__/service.test.ts` -- covers TAB-01, D-05/D-09 cascade
- `src/services/database/tab-store/__tests__/schemas.test.ts` -- covers Tab, TabCreate, TabUpdate schemas
- Update `src/services/database/__tests__/schema.test.ts` -- verify D-06 column removal

## Open Questions

1. **Tagged template mock complexity**
   - What we know: The existing test mock only handles `sql.unsafe()`. Tagged template queries go through the Constructor interface which compiles templates to SQL strings + parameter arrays.
   - What's unclear: The exact mock shape needed to intercept tagged template queries in unit tests. The SqlClient Constructor is a function that returns Statement objects.
   - Recommendation: Study the `@effect/sql` internal client.js to understand how Constructor wraps queries. Alternatively, a simpler approach may be to use the `unsafe` method to execute raw SQL in the mock and verify the compiled output. If mocking proves too complex, consider a thin integration test with an in-memory SQLite database (but this would import better-sqlite3 which may conflict with Electron ABI -- validate before committing to this approach).

2. **Schema migration for D-06 on existing databases**
   - What we know: `CREATE TABLE IF NOT EXISTS` won't alter an existing table. If a database already exists with `is_active` and `tab_order` columns, the DDL won't remove them.
   - What's unclear: Whether this matters during development (database wipe is acceptable per requirements).
   - Recommendation: For development, simply delete the database file to pick up schema changes. The existing code uses `CREATE TABLE IF NOT EXISTS` which will create the correct schema on fresh databases. No ALTER TABLE needed during dev. A future PRAGMA user_version check could handle this but is explicitly out of scope per requirements.

3. **StreamEventMessage in StoredEvent union**
   - What we know: Per the write pipeline design (Phase 3), only complete AssistantMessageEvents are persisted, not individual StreamEventMessages. SystemInitEvent is persisted immediately.
   - What's unclear: Whether StoredEvent should include StreamEventMessage at all, since it should never appear in the database.
   - Recommendation: Exclude StreamEventMessage from the StoredEvent union since it should never be stored. If one somehow ends up in the database, the UnknownEvent catchall will handle it gracefully.

## Sources

### Primary (HIGH confidence)
- `@effect/sql` 0.51.0 type declarations -- SqlClient.d.ts, Statement.d.ts, SqlSchema.d.ts (read directly from node_modules)
- `@effect/sql-sqlite-node` 0.52.0 -- installed and verified in package.json
- Effect-TS/effect GitHub repository -- [Client.test.ts](https://github.com/Effect-TS/effect/blob/main/packages/sql-sqlite-node/test/Client.test.ts) for tagged template and transaction examples
- Existing codebase -- service-definition.ts, service.ts, errors.ts, events.ts patterns verified by reading source

### Secondary (MEDIUM confidence)
- [DeepWiki Effect-TS SQL Core](https://deepwiki.com/Effect-TS/effect/6.1-sql-core-abstraction) -- architecture overview
- [@effect/sql official docs](https://effect-ts.github.io/effect/docs/sql) -- API index

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages already installed and verified; no new dependencies
- Architecture: HIGH -- follows established patterns from Phase 1 and existing ClaudeCli service
- Pitfalls: HIGH -- identified from direct codebase analysis and understanding of SQLite behavior
- Testing: MEDIUM -- mock approach for tagged template queries needs validation during implementation

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable -- Effect ecosystem versioned, no fast-moving changes expected)
