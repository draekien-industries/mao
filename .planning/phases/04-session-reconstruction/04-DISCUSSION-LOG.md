# Phase 4: Session Reconstruction - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 04-session-reconstruction
**Areas discussed:** Reconstruction output shape, RPC endpoint design, Event folding logic, Reconstruction trigger

---

## Reconstruction Output Shape

| Option | Description | Selected |
|--------|-------------|----------|
| ChatMessage[] + session_id | Return the same ChatMessage[] shape the hook already uses, plus session_id for --resume. Minimal contract. | ✓ |
| Full session envelope | Typed object with sessionId, messages, model, totalCost, isInterrupted. Everything upfront. | |
| You decide | Claude picks during planning. | |

**User's choice:** ChatMessage[] + session_id
**Notes:** User wanted to drill down on what ChatMessage should look like practically.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Keep ChatMessage as-is | { content: string, role } — no changes | |
| Add optional id field | Sequence-based id for stable identity (React keys, scroll anchoring) | |

**User's choice:** Extend ChatMessage — wanted to drill down on practical shape.
**Notes:** Agreed on: `{ id: number, role: "user" | "assistant", content: string, createdAt: string }` where id = sequence_number from DB.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Schema class | Effect Schema class — consistent with codebase, works with @effect/rpc | ✓ |
| Plain TypeScript type | Simple interface, lighter but no Schema validation | |
| You decide | | |

**User's choice:** Schema class

---

| Option | Description | Selected |
|--------|-------------|----------|
| Include session_id | ReconstructedSession { sessionId, messages } — one RPC call returns everything | ✓ |
| Separate query | Return only ChatMessage[], renderer gets session_id separately | |

**User's choice:** Include session_id

---

## RPC Endpoint Design

| Option | Description | Selected |
|--------|-------------|----------|
| Extend ClaudeRpcGroup | Add non-streaming reconstruct RPC alongside query/resume/cont | |
| New PersistenceRpcGroup | Separate group for persistence queries | ✓ |
| You decide | | |

**User's choice:** Initially selected "Extend ClaudeRpcGroup", then changed mind to two separate groups after considering that the group name would become inaccurate.
**Notes:** User explicitly requested to see what two groups sharing transport would look like. After seeing the code sketch, confirmed the approach works.

---

| Option | Description | Selected |
|--------|-------------|----------|
| New handler layer | PersistenceRpcHandlers layer composed alongside ClaudeRpcHandlers | ✓ |
| Extend ClaudeRpcHandlers | Add reconstruction handler directly into existing handler | |
| You decide | | |

**User's choice:** New handler layer

---

| Option | Description | Selected |
|--------|-------------|----------|
| Assume multi-group works | @effect/rpc supports variadic RpcGroup args. Researcher verifies. | ✓ |
| Single merged group | Use RpcGroup.merge at transport level | |
| You decide | | |

**User's choice:** Assume multi-group works

---

## Event Folding Logic

| Option | Description | Selected |
|--------|-------------|----------|
| Show user message alone | ChatMessage[] has user message with no following assistant message. Renderer detects via last role. | ✓ |
| Add placeholder assistant message | Synthetic empty assistant message for pair-based rendering | |
| Omit the incomplete turn | Drop trailing user message if no response | |

**User's choice:** Show user message alone

---

| Option | Description | Selected |
|--------|-------------|----------|
| Effect service | SessionReconstructor service with reconstruct(sessionId) method | ✓ |
| Pure function + service wrapper | Pure foldEvents() function with thin service wrapper | |
| You decide | | |

**User's choice:** Effect service

---

| Option | Description | Selected |
|--------|-------------|----------|
| Extract to shared utility | Move text extraction to shared function, single source of truth | ✓ |
| Duplicate in reconstruction | Write same logic in fold function | |
| You decide | | |

**User's choice:** Extract to shared utility

---

| Option | Description | Selected |
|--------|-------------|----------|
| Include as empty session | Return ReconstructedSession { sessionId, messages: [] } | ✓ |
| Filter out empty sessions | Skip sessions with no user messages | |
| You decide | | |

**User's choice:** Include as empty session

---

## Reconstruction Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Per-session | reconstruct(sessionId) returns one ReconstructedSession. Lazy loading possible. | ✓ |
| Batch all sessions | reconstructAll() returns all sessions at once | |
| Both endpoints | Per-session + batch | |
| You decide | | |

**User's choice:** Per-session

---

| Option | Description | Selected |
|--------|-------------|----------|
| Include listTabs now | Add listTabs RPC to PersistenceRpcGroup in Phase 4 | ✓ |
| Defer to Phase 5 | Phase 5 adds the endpoint when building tab restore | |
| You decide | | |

**User's choice:** Include listTabs now

---

| Option | Description | Selected |
|--------|-------------|----------|
| SessionReconstructor service | Dedicated service with reconstruct(sessionId). Handler delegates. | ✓ |
| Inline in handler | Handler calls EventStore and folds directly | |

**User's choice:** SessionReconstructor service

---

## Claude's Discretion

- SessionReconstructor service file organization
- ReconstructSessionParams and listTabs params/response schema design
- Error type design for reconstruction failures
- Test strategy for fold logic and RPC endpoints
- Multi-group RPC fallback (RpcGroup.merge if variadic not supported)

## Deferred Ideas

- Session-level metadata (model, totalCost, isInterrupted) on ReconstructedSession
- Batch reconstructAll() endpoint
- ToolResultEvent schema (from Phase 3 deferred)
