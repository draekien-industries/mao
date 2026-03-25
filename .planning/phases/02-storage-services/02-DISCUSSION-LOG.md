# Phase 2: Storage Services - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 02-storage-services
**Areas discussed:** User message schema, Tab lifecycle, Data retention, Service structure

---

## User Message Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt text only | event_data stores just { prompt: "..." }. Minimal, matches what's needed for conversation reconstruction. Timestamp comes from created_at column. | ✓ |
| Prompt + conversation metadata | event_data stores { prompt: "...", model: "...", max_turns: N, ... } — captures full context. Richer but duplicates info from other events. | |

**User's choice:** Prompt text only
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Separate StoredEvent union | Create a new StoredEvent schema for storage layer. Keeps ClaudeEvent pure (matches CLI output). | ✓ |
| Add to ClaudeEvent union | Add UserMessageEvent to existing ClaudeEvent union. Simpler but mixes CLI and synthetic events. | |

**User's choice:** Separate StoredEvent union
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Store raw JSON | Serialize event to JSON string and store as-is. Validation already happened upstream. | ✓ |
| Validate via Schema on write | Decode through StoredEvent schema before writing. Catches corruption at storage boundary. | |

**User's choice:** Store raw JSON
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Decode on read | EventStore returns typed StoredEvent objects. Store owns the round-trip. | ✓ |
| Return raw, caller decodes | EventStore returns raw row data. Caller responsible for Schema.decode. | |

**User's choice:** Decode on read
**Notes:** None

---

## Tab Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Hard delete | DELETE FROM tabs. Closed tabs disappear. Events remain as orphans. | ✓ |
| Soft delete via flag | Add is_closed column. Enables "recently closed tabs" later but adds complexity. | |

**User's choice:** Hard delete
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Leave events | Events remain after tab deletion. Harmless orphans, useful for future features. | |
| Cascade delete events | DELETE events WHERE session_id = tab.session_id. Clean database, no orphans. | ✓ |

**User's choice:** Cascade delete events
**Notes:** User chose cascade despite recommendation to leave events

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, atomic reorder | TabStore exposes reorder method updating tab_order in single transaction. | ✓ |
| Single-tab update only | TabStore only updates one tab at a time. Simpler API. | |

**User's choice:** Yes, atomic reorder
**Notes:** Later superseded — tab_order moved to localStorage per D-06

| Option | Description | Selected |
|--------|-------------|----------|
| TabStore manages is_active | TabStore.setActive() ensures only one active tab. | |
| Other | User provided custom answer | ✓ |

**User's choice:** Don't store active tab in database. UI defaults to first available tab or stores in localStorage. Tab order can potentially live in localStorage as well.
**Notes:** This led to a follow-up question about tab_order location

| Option | Description | Selected |
|--------|-------------|----------|
| Move to localStorage | Both tab_order and is_active live in renderer. TabStore only persists session-to-project mapping. | ✓ |
| Keep tab_order in DB | tab_order stays in database for main process tab restoration. Only is_active moves. | |

**User's choice:** Move to localStorage
**Notes:** Simplifies tabs table significantly — drops two columns from Phase 1 schema

---

## Data Retention

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, purge by session | EventStore.purgeSession(sessionId) deletes all events. Needed for cascade delete. | ✓ |
| No delete operations | Strictly append-only. Conflicts with cascade delete decision. | |

**User's choice:** Purge by session
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| TabStore coordinates | TabStore.delete() internally calls EventStore.purgeSession() in same transaction. | ✓ |
| Caller coordinates | Caller must call both separately. Risks partial cleanup. | |

**User's choice:** TabStore coordinates
**Notes:** None

---

## Service Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Two separate services | EventStore and TabStore as independent Context.Tags. Follows existing pattern. | ✓ |
| One combined StorageService | Single service with both event and tab methods. Fewer files. | |

**User's choice:** Two separate services
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Under database/ | src/services/database/event-store/ and src/services/database/tab-store/. Groups persistence code. | ✓ |
| Top-level directories | src/services/event-store/ and src/services/tab-store/ as siblings to database/. | |

**User's choice:** Under database/
**Notes:** None

---

## Claude's Discretion

- Sequence number management strategy
- EventStore query API surface beyond "get all events by session"
- Error type granularity
- StoredEvent schema design and UserMessageEvent field names
- Test strategy and mock approach

## Deferred Ideas

None — discussion stayed within phase scope.
