# Phase 5: Renderer Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 05-renderer-integration
**Areas discussed:** Tab restore flow, Graceful shutdown, RPC client isolation, Tool result persistence, Session resume behavior

---

## Tab Restore Flow

### Conversation hydration timing

| Option | Description | Selected |
|--------|-------------|----------|
| Active tab first | Hydrate active tab immediately, lazy-load others on click. Fastest perceived startup. | ✓ |
| All tabs eagerly | Hydrate all tabs in parallel on app start. Simpler code but slower startup. | |
| All tabs background | Active tab first, then background-load remaining. Best of both but more complex. | |

**User's choice:** Active tab first (Recommended)
**Notes:** None

### Active tab persistence

| Option | Description | Selected |
|--------|-------------|----------|
| SQLite column | Add is_active boolean to tabs table. Single source of truth. | |
| localStorage | Store in renderer localStorage. Simpler, no schema change. | |

**User's choice:** Neither — just default to the first available tab in the list
**Notes:** loadProjectsAtom already implements this behavior. No persistence needed.

### Loading state during hydration

| Option | Description | Selected |
|--------|-------------|----------|
| Skeleton messages | Message-shaped skeleton blocks that resolve into real messages. Consistent with UI-05. | ✓ |
| Spinner | Simple centered spinner. Less polished but trivial. | |
| Empty then populate | Show empty chat panel, messages appear when ready. No loading indicator. | |

**User's choice:** Skeleton messages (Recommended)
**Notes:** None

---

## Graceful Shutdown

### In-flight stream handling on quit

| Option | Description | Selected |
|--------|-------------|----------|
| Kill streams, discard buffers | SIGTERM to all child processes, discard partial buffers. Fast shutdown. | ✓ |
| Flush then quit | Wait for streams to pause, persist buffered data. Slower, risk of hanging. | |
| Timeout flush | Attempt flush with 2s timeout, then kill. Balance approach. | |

**User's choice:** Kill streams, discard buffers (Recommended)
**Notes:** Matches Phase 3 WPIPE-02 design.

### Database connection closure

| Option | Description | Selected |
|--------|-------------|----------|
| Runtime dispose sufficient | SqliteClient acquireRelease handles closure. WAL mode for crash safety. | ✓ |
| Explicit DB close before dispose | Belt-and-suspenders db.close() before runtime dispose. Risk of double-close. | |

**User's choice:** Runtime dispose is sufficient (Recommended)
**Notes:** None

---

## RPC Client Isolation

### CLI subprocess model

| Option | Description | Selected |
|--------|-------------|----------|
| Keep shared service | ClaudeCliLive spawns fresh process per call. Stateless, already isolated. | |
| Per-tab ClaudeCli instance | Separate ClaudeCli service per tab. Independent process management. | ✓ |

**User's choice:** Per-tab ClaudeCli instance
**Notes:** None

### Instance management approach

| Option | Description | Selected |
|--------|-------------|----------|
| Main-process tab registry | Map<tabId, ClaudeCli> in main process. Lightweight, fits existing architecture. | |
| Per-tab ManagedRuntime | Each tab gets its own runtime. Full isolation, built-in disposal. | ✓ |
| You decide | Claude picks during planning. | |

**User's choice:** Per-tab ManagedRuntime
**Notes:** User plans to migrate to stream-json input mode in the future, which would have persistent multi-turn subprocesses per tab. Per-tab runtimes prepare the isolation model for this.

---

## Tool Result Persistence

### Persistence level

| Option | Description | Selected |
|--------|-------------|----------|
| Persist as typed event | ToolResultEvent schema with typed fields. Full fidelity restoration. | ✓ |
| Persist raw JSON only | Store as raw JSON blob. Simpler write, untyped reconstruction. | |
| Skip for Phase 5 | Don't persist tool results yet. Tool use shows but not results. | |

**User's choice:** Persist as typed event (Recommended)
**Notes:** None

### Tool result display in restored conversations

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in assistant message | Tool result merged into the assistant message that invoked it. | |
| Separate message block | Distinct block between tool-use message and next assistant response. | ✓ |
| You decide | Claude picks based on ChatMessage schema capabilities. | |

**User's choice:** Separate message block
**Notes:** Matches Claude's actual turn structure (assistant -> tool_result -> assistant).

---

## Session Resume Behavior

### Auto-resume on restore

| Option | Description | Selected |
|--------|-------------|----------|
| Wait for user action | Static history, user sends message to resume. No surprise CLI spawns. | ✓ |
| Auto-resume active sessions | Only resume sessions that were mid-conversation. | |
| Always auto-resume | Every restored tab spawns --resume. Could hit concurrency warning. | |

**User's choice:** Wait for user action (Recommended)
**Notes:** None

---

## Claude's Discretion

- Per-tab ManagedRuntime composition details (which shared layers are bridged, how tab runtimes are created/destroyed)
- `ToolResultEvent` schema field design (exact fields, content type representation)
- How `sendMessageAtom` is refactored to use per-tab runtimes instead of the global `appRuntime`
- Reconstruction fold extension for ToolResultEvent -> ChatMessage mapping
- Skeleton message component design (reuse existing skeleton or purpose-built)
- Per-tab runtime disposal ordering during graceful shutdown

## Deferred Ideas

- stream-json input mode for persistent multi-turn subprocesses
- Auto-resume interrupted sessions
- Active tab memory across restarts
- Batch reconstruction for eager startup
