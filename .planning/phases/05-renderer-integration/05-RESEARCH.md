# Phase 5: Renderer Integration - Research

**Researched:** 2026-03-29
**Domain:** Electron renderer/main process integration, Effect-TS ManagedRuntime, session reconstruction, graceful shutdown
**Confidence:** HIGH

## Summary

Phase 5 connects the existing backend persistence infrastructure (Phases 1-4) to the renderer process. The core work is: (1) calling `reconstructSession` RPC from sidebar atoms on app start and tab switch, (2) adding `ToolResultEvent` to the stored event schema and rendering tool results as distinct message blocks, (3) extending the `before-quit` handler to kill active CLI streams, and (4) introducing per-tab ManagedRuntime for future CLI process isolation.

The codebase is well-structured for this phase. The `reconstructSession` RPC exists and is wired but never called from the renderer. The `loadProjectsAtom` and `setActiveTabAtom` are the natural integration points. The `StoredEvent` union is extensible. The `before-quit` handler already disposes the main runtime. Per-tab ManagedRuntime is the most architecturally significant addition but is well-scoped because `Atom.runtime` from `@effect-atom/atom-react` already demonstrates the pattern.

**Primary recommendation:** Implement in three waves: (1) session hydration via RPC + skeleton loading, (2) ToolResultEvent schema + persistence + UI rendering, (3) graceful shutdown + per-tab runtime scaffolding.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Hydrate the active tab's conversation immediately on app start via `reconstructSession` RPC. Other tabs lazy-load when the user clicks them. Fastest perceived startup.
- **D-02:** No active tab persistence — default to the first available tab in the list on app reopen. `loadProjectsAtom` already implements this behavior. TAB-02 requirement satisfied by "first tab wins" rather than remembering exact tab.
- **D-03:** Skeleton message loading state while a tab's conversation is being hydrated. Reuse the `sessionLoadingAtom` pattern from Phase 04.2 (UI-05). Message-shaped skeleton blocks resolve into real messages.
- **D-04:** On app quit, kill all in-flight CLI streams and discard in-memory buffers. Send SIGTERM to child processes. The last persisted complete event is the recovery point. Matches Phase 3 design (WPIPE-02: buffer discarded on termination). Fast shutdown path.
- **D-05:** Runtime dispose is sufficient for DB cleanup — `SqliteClient` layer's `acquireRelease` semantics (Phase 1 INFRA-03) handle connection closure. WAL mode provides crash safety. No explicit `db.close()` call needed before runtime dispose.
- **D-06:** Per-tab ManagedRuntime — each tab gets its own `ManagedRuntime` with a `ClaudeCliLive` layer. Main runtime handles shared services (DB, RPC server); per-tab runtimes handle CLI work.
- **D-07:** Per-tab runtimes enable future migration to `stream-json` input mode with persistent multi-turn subprocesses. Each tab's subprocess lifecycle ties to the tab's runtime — `runtime.dispose()` naturally kills the long-lived process on tab close.
- **D-08:** Error boundaries per-tab — one crashed subprocess doesn't affect other tabs. Per-tab runtimes provide natural isolation.
- **D-09:** Define a `ToolResultEvent` schema (tool_use_id, content, is_error). Store as a new event type in EventStore alongside existing event types. Full fidelity restoration of tool use in conversations.
- **D-10:** Tool results rendered as separate message blocks in restored conversations — distinct from the assistant message that invoked the tool. Matches Claude's actual turn structure (assistant -> tool_result -> assistant).
- **D-11:** Wait for user action — restored conversations display as static history. User sends a new message (which uses `--resume` under the hood) to continue the session. No auto-spawning of CLI processes on app start.

### Claude's Discretion
None specified — all decisions are locked.

### Deferred Ideas (OUT OF SCOPE)
- **stream-json input mode** — Persistent multi-turn subprocesses per tab.
- **Auto-resume interrupted sessions** — Auto-resume tabs where last message was from user with no response.
- **Active tab memory** — Persisting which tab was active across restarts.
- **Batch reconstruction** — `reconstructAll()` for eager startup.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAB-02 | Active tab indicator persisted so the correct tab is focused on reopen | Satisfied by D-02: "first tab wins" default in `loadProjectsAtom`. No DB schema change needed — `loadProjectsAtom` already selects first tab when `activeTabIdAtom` is null. |
| TAB-03 | Full tab layout restored on app reopen with all tabs pointing to correct projects | Satisfied by existing `loadProjectsAtom` + D-01 hydration. `listTabs` RPC returns all tabs with cwd/project_id. `reconstructSession` hydrates conversation for active tab. Lazy hydration for rest. |
| SAFE-01 | Graceful shutdown flushes or explicitly discards pending writes on app quit via before-quit event | Satisfied by D-04/D-05: kill-and-discard shutdown. Existing `before-quit` handler disposes main runtime. Extend to kill child processes via fiber interruption before runtime dispose. |
</phase_requirements>

## Architecture Patterns

### Session Hydration Flow

**What:** On app start, `loadProjectsAtom` loads all projects/tabs from DB, defaults to first tab, then calls `reconstructSession` RPC to hydrate the active tab's conversation history into `messagesAtom(tabId)`.

**Integration points:**
1. `loadProjectsAtom` (src/atoms/sidebar.ts, lines 52-69) — extend to call `reconstructSession` after selecting first tab
2. `setActiveTabAtom` (src/atoms/sidebar.ts, lines 72-89) — extend to call `reconstructSession` for lazy hydration on tab switch
3. `sessionLoadingAtom` — set `true` before reconstruction, `false` after messages are populated

**Pattern:**
```typescript
// Inside loadProjectsAtom, after setting activeTabIdAtom:
if (firstTab && firstTab.session_id) {
  ctx.set(sessionLoadingAtom, true);
  const client = yield* RendererRpcClient;
  const session = yield* client.reconstructSession({
    sessionId: firstTab.session_id,
  });
  ctx.set(messagesAtom(String(firstTab.id)), session.messages.map(m => ({
    role: m.role,
    content: m.content,
  })));
  ctx.set(sessionIdAtom(String(firstTab.id)), session.sessionId);
  ctx.set(sessionLoadingAtom, false);
}
```

**Key detail:** The `Tab` schema has `session_id: Schema.NullOr(Schema.String)`. Tabs without a `session_id` (never used yet) should skip reconstruction. Only tabs with a non-null `session_id` have stored events.

### ChatMessage Schema Mismatch

**What:** The renderer `ChatMessage` type (src/atoms/chat.ts) has `{ content: string; role: "user" | "assistant" }`. The reconstructor's `ChatMessage` (src/services/database/session-reconstructor/schemas.ts) has `{ content, createdAt, id, role }`. The reconstructed messages need mapping to the renderer format.

**Additionally:** Tool result messages need a new role or message type. Currently `ChatMessage` only supports `"user" | "assistant"`. For D-10, tool results must be rendered as separate blocks. Options:
- Extend `ChatMessage` with a `"tool_result"` role
- Create a union type `ChatMessage | ToolResultMessage` for the messages array

**Recommendation:** Extend the `ChatMessage` type to support tool results. Add fields: `role: "user" | "assistant" | "tool_result"`, plus optional `toolUseId` and `isError` for tool result messages. This keeps the messages array flat and the rendering logic in a single `map()`.

### ToolResultEvent Schema (D-09)

**What:** Claude CLI emits tool results as `type: "user"` events with message content blocks of `type: "tool_result"`. The event structure from Claude CLI:

```json
{
  "type": "user",
  "session_id": "session-id",
  "message": {
    "id": "msg_xxx",
    "type": "message",
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_xxx",
        "content": "tool output text"
      }
    ]
  }
}
```

The `content` field can be a string or an array of content blocks (e.g., `[{"type": "text", "text": "..."}]`).

**Schema design:**
```typescript
export class ToolResultContentBlock extends Schema.Class<ToolResultContentBlock>(
  "ToolResultContentBlock",
)({
  type: Schema.Literal("tool_result"),
  tool_use_id: Schema.String,
  content: Schema.Union(
    Schema.String,
    Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.optional(Schema.String) })),
  ),
  is_error: Schema.optional(Schema.Boolean),
}) {}

export class ToolResultEvent extends Schema.Class<ToolResultEvent>(
  "ToolResultEvent",
)({
  type: Schema.Literal("user"),
  session_id: Schema.String,
  message: Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("message"),
    role: Schema.Literal("user"),
    content: Schema.Array(ToolResultContentBlock),
  }),
}) {}
```

**Placement:**
- Define `ToolResultEvent` in `src/services/claude-cli/events.ts` (before `UnknownEvent` in `ClaudeEvent` union)
- Add to `StoredEvent` union in `src/services/database/event-store/schemas.ts`
- Add `isToolResult` type guard
- Extend `wrapStream` in persistent service to persist `ToolResultEvent`
- Extend `SessionReconstructor.reconstruct` to fold tool results into messages

### Per-Tab ManagedRuntime (D-06, D-07, D-08)

**What:** Each tab gets its own `ManagedRuntime` that provides `ClaudeCli`. The main runtime handles shared services (DB, RPC server, EventStore). Per-tab runtimes handle CLI subprocess lifecycle.

**Current state:** The renderer has a single `appRuntime` (src/atoms/runtime.ts) built from `ClaudeCliFromRpc` + `RendererRpcClientLayer`. All tabs share one RPC client and one `ClaudeCli` layer.

**Architecture for per-tab runtimes:**
- The per-tab runtime concept applies to the **main process**, not the renderer
- Currently `ClaudeCliLive` is a single layer in the main runtime -- each `query`/`resume`/`cont` call spawns a new process but they all share the same executor
- Per-tab runtime means: on the main side, each tab's CLI operations run in an isolated `ManagedRuntime` with its own `ClaudeCliLive`, so `runtime.dispose()` kills that tab's processes
- The renderer side stays the same (single `appRuntime` with RPC client) -- the RPC layer routes calls to the correct per-tab runtime on the main side

**Scope for this phase:** Scaffold the per-tab runtime infrastructure on the main process side. The existing `sendMessageAtom` in the renderer does not need to change its RPC call pattern -- the main process routes to the per-tab runtime internally. Full subprocess isolation (persistent processes) is deferred to the `stream-json` input mode work.

**Practical approach:**
- Create a `TabRuntimeManager` service on the main process that creates/disposes per-tab `ManagedRuntime` instances
- Each per-tab runtime provides `ClaudeCli` + `EventStore` (or the persistent CLI wrapper)
- `before-quit` handler iterates all per-tab runtimes and disposes them before main runtime

### Graceful Shutdown (D-04, D-05, SAFE-01)

**What:** On app quit, kill all in-flight CLI streams. The existing handler in `src/main.ts` (lines 116-127):

```typescript
let isQuitting = false;
app.on("before-quit", async (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();
  devLog("disposing runtime", app.isPackaged);
  try {
    await runtime.dispose();
  } finally {
    devLog("runtime disposed, exiting", app.isPackaged);
    app.exit(0);
  }
});
```

**Extension needed:**
- `runtime.dispose()` already interrupts all forked fibers (including active CLI streams)
- When the main `ManagedRuntime` disposes, any `forkScoped` fibers in `buildStream` get interrupted, which kills child processes via Effect's scope cleanup
- Per D-05, `SqliteClient` layer's `acquireRelease` handles DB connection closure automatically
- With per-tab runtimes: dispose per-tab runtimes first (which kills CLI processes), then dispose main runtime (which closes DB)

**Key insight:** The existing `runtime.dispose()` in `before-quit` already provides SAFE-01 compliance because Effect's scope semantics clean up child processes. The extension for per-tab runtimes is: dispose them explicitly before the main runtime. This is a minor addition to the existing handler.

### Skeleton Loading in Chat Panel (D-03)

**What:** Show `MessageSkeleton` components while `sessionLoadingAtom` is true. The UI-SPEC defines: 3 alternating skeleton blocks (user-right, assistant-left, user-right) with staggered widths, using shadcn's `Skeleton` component.

**Integration:** In `src/routes/index.tsx`, the `ChatPanel` component needs a new loading state check. When `sessionLoadingAtom` is true, render `MessageSkeleton` instead of the empty state or messages list.

**Current state:** `sessionLoadingAtom` is already used in `setActiveTabAtom` but set/cleared synchronously. For reconstruction, it needs to be set `true` before the async RPC call and `false` after messages are populated.

### Anti-Patterns to Avoid

- **Importing node:fs in renderer**: The renderer process cannot use Node.js modules. All data access goes through RPC. Effect's `CommandExecutor` is main-process only.
- **Auto-spawning CLI on restore**: D-11 explicitly forbids auto-spawning. Restored conversations are static until user sends a new message.
- **Storing stream deltas as tool results**: Only the complete `ToolResultEvent` (user-type event from CLI) gets persisted, not incremental tool input deltas.
- **Blocking shutdown on DB flush**: D-04/D-05 specify kill-and-discard. Do not wait for pending writes to complete before killing processes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session reconstruction | Custom event replay logic | `SessionReconstructor.reconstruct()` RPC | Already implemented and tested in Phase 4 |
| CLI process lifecycle | Manual process.kill() calls | `ManagedRuntime.dispose()` scope cleanup | Effect's scope semantics handle cleanup correctly |
| Loading skeletons | Custom animation CSS | shadcn `Skeleton` component | Already installed, provides consistent pulse animation |
| Event schema validation | Manual JSON.parse + type checks | `Schema.parseJson(StoredEvent)` | Already wired in EventStore service |

## Common Pitfalls

### Pitfall 1: Reconstruction called for tabs with no session_id
**What goes wrong:** `reconstructSession` fails or returns empty when called for a tab that has never been used (session_id is null).
**Why it happens:** `Tab.session_id` is `NullOr(String)`. New tabs created via `createTab` have no session_id until the first CLI spawn emits a `SystemInitEvent`.
**How to avoid:** Guard reconstruction: `if (tab.session_id !== null) { reconstruct... }`. Skip tabs with null session_id — they have no events to reconstruct.
**Warning signs:** Errors in console about failed reconstruction for null session IDs.

### Pitfall 2: Atom state stale after async reconstruction
**What goes wrong:** Messages from a previous tab appear in the newly switched tab.
**Why it happens:** User switches tabs rapidly. Reconstruction for tab A completes and writes to `messagesAtom("A")`, but tab B is now active. If the code writes to `messagesAtom(activeTabId)` instead of the specific tab's atom, data goes to the wrong place.
**How to avoid:** Always use the specific `tabId` from the reconstruction request, never read `activeTabIdAtom` to determine where to write results.
**Warning signs:** Messages appearing in wrong tabs after rapid switching.

### Pitfall 3: ToolResultEvent before UnknownEvent in union
**What goes wrong:** `ToolResultEvent` has `type: "user"` which could conflict with the `UnknownEvent` catch-all.
**Why it happens:** `Schema.Union` tries members in order. `UnknownEvent` has `type: Schema.String` which matches everything.
**How to avoid:** Insert `ToolResultEvent` before `UnknownEvent` in both `ClaudeEvent` and `StoredEvent` unions. The `type: "user"` literal discriminant ensures `ToolResultEvent` matches first.
**Warning signs:** Tool results decoded as `UnknownEvent` instead of `ToolResultEvent`.

### Pitfall 4: sessionLoadingAtom cleared before messages are set
**What goes wrong:** Skeleton disappears but messages haven't rendered yet, causing a flash of "Send a message to start chatting."
**Why it happens:** `sessionLoadingAtom` is set to `false` before `messagesAtom` is populated.
**How to avoid:** Set messages first, then clear loading state. Single synchronous batch: `ctx.set(messagesAtom(...), messages); ctx.set(sessionLoadingAtom, false);`.
**Warning signs:** Brief flash of empty state between skeleton and messages.

### Pitfall 5: Per-tab runtime disposal order
**What goes wrong:** Main runtime disposes first, closing DB connections. Per-tab runtimes then fail to finalize because EventStore is gone.
**Why it happens:** Disposal order not explicitly controlled.
**How to avoid:** In `before-quit`, dispose all per-tab runtimes first (they only hold CLI processes), then dispose main runtime (which holds DB, RPC server).
**Warning signs:** Errors in console about failed DB operations during shutdown.

## Code Examples

### Extending loadProjectsAtom for hydration (D-01)

```typescript
// In src/atoms/sidebar.ts, inside loadProjectsAtom's Effect.gen:
// After selecting first tab...
if (firstTab && firstTab.session_id) {
  ctx.set(sessionLoadingAtom, true);
  const client = yield* RendererRpcClient;
  const session = yield* client.reconstructSession({
    sessionId: firstTab.session_id,
  });
  const tabKey = String(firstTab.id);
  // Map reconstructed ChatMessage to renderer ChatMessage format
  ctx.set(
    messagesAtom(tabKey),
    session.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  );
  ctx.set(sessionIdAtom(tabKey), session.sessionId);
  ctx.set(sessionLoadingAtom, false);
}
```

### Extending setActiveTabAtom for lazy hydration (D-01)

```typescript
// In src/atoms/sidebar.ts, setActiveTabAtom needs to become async (Effect.gen)
// Currently it's Effect.sync — needs upgrading to support RPC call
export const setActiveTabAtom = appRuntime.fn(
  (tabId: number, ctx: Atom.FnContext) =>
    Effect.gen(function* () {
      ctx.set(sessionLoadingAtom, true);
      ctx.set(activeTabIdAtom, tabId);
      // Populate cwdAtom
      const projects = ctx(projectsAtom);
      const tab = projects.flatMap((p) => p.sessions).find((s) => s.id === tabId);
      if (tab) {
        ctx.set(cwdAtom(String(tabId)), tab.cwd);
      }
      // Lazy hydration: only if tab has a session and messages not yet loaded
      const existingMessages = ctx(messagesAtom(String(tabId)));
      if (tab?.session_id && existingMessages.length === 0) {
        const client = yield* RendererRpcClient;
        const session = yield* client.reconstructSession({
          sessionId: tab.session_id,
        });
        const tabKey = String(tabId);
        ctx.set(
          messagesAtom(tabKey),
          session.messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        );
        ctx.set(sessionIdAtom(tabKey), session.sessionId);
      }
      ctx.set(sessionLoadingAtom, false);
    }),
);
```

### ToolResultEvent schema (D-09)

```typescript
// In src/services/claude-cli/events.ts
export class ToolResultBlock extends Schema.Class<ToolResultBlock>(
  "ToolResultBlock",
)({
  type: Schema.Literal("tool_result"),
  tool_use_id: Schema.String,
  content: Schema.Union(
    Schema.String,
    Schema.Array(Schema.Struct({
      type: Schema.String,
      text: Schema.optional(Schema.String),
    })),
  ),
  is_error: Schema.optional(Schema.Boolean),
}) {}

export class ToolResultEvent extends Schema.Class<ToolResultEvent>(
  "ToolResultEvent",
)({
  type: Schema.Literal("user"),
  session_id: Schema.String,
  message: Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("message"),
    role: Schema.Literal("user"),
    content: Schema.Array(ToolResultBlock),
  }),
}) {}

// Add to ClaudeEvent union BEFORE UnknownEvent:
export const ClaudeEvent = Schema.Union(
  SystemInitEvent,
  SystemRetryEvent,
  StreamEventMessage,
  AssistantMessageEvent,
  ResultEvent,
  ToolResultEvent,  // <-- new, before UnknownEvent
  UnknownEvent,
);

export const isToolResult = Schema.is(ToolResultEvent);
```

### MessageSkeleton component (D-03, from UI-SPEC)

```typescript
// src/components/message-skeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function MessageSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {/* User skeleton — right-aligned */}
      <div className="flex justify-end">
        <Skeleton className="h-9 w-[45%] rounded-2xl bg-primary/20" />
      </div>
      {/* Assistant skeleton — left-aligned */}
      <div className="flex justify-start">
        <Skeleton className="h-[52px] w-[70%] rounded-2xl bg-muted" />
      </div>
      {/* User skeleton — right-aligned */}
      <div className="flex justify-end">
        <Skeleton className="h-9 w-[55%] rounded-2xl bg-primary/20" />
      </div>
    </div>
  );
}
```

### ToolResultBlock component (D-10, from UI-SPEC)

```typescript
// src/components/tool-result-block.tsx
import { cn } from "@/lib/utils";

interface ToolResultBlockProps {
  readonly content: string;
  readonly isError: boolean;
}

export function ToolResultBlock({ content, isError }: ToolResultBlockProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg border border-border bg-muted/50 px-3 py-2">
        <span
          className={cn(
            "text-xs font-semibold",
            isError ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {isError ? "Tool Error" : "Tool Result"}
        </span>
        <div className="mt-1 whitespace-pre-wrap text-sm">{content}</div>
      </div>
    </div>
  );
}
```

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | vitest.config.mts |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TAB-02 | First tab selected on app reopen (loadProjectsAtom defaults) | unit | `npx vitest run src/atoms/__tests__/sidebar.test.ts -t "first tab"` | Wave 0 |
| TAB-03 | reconstructSession called for active tab, messages populated | unit | `npx vitest run src/atoms/__tests__/sidebar.test.ts -t "reconstruct"` | Wave 0 |
| SAFE-01 | Per-tab runtimes disposed before main runtime on quit | unit | `npx vitest run src/services/__tests__/shutdown.test.ts` | Wave 0 |
| D-09 | ToolResultEvent schema decodes CLI tool_result events | unit | `npx vitest run src/services/claude-cli/__tests__/events.test.ts -t "ToolResult"` | Wave 0 |
| D-09 | ToolResultEvent persisted by PersistentClaudeCli | unit | `npx vitest run src/services/claude-cli/persistent/__tests__/service.test.ts -t "tool_result"` | Wave 0 |
| D-10 | SessionReconstructor folds ToolResultEvent into messages | unit | `npx vitest run src/services/database/session-reconstructor/__tests__/service.test.ts -t "tool_result"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test && npm run typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/atoms/__tests__/sidebar.test.ts` -- test for reconstruction integration in loadProjectsAtom/setActiveTabAtom (new test file or extend existing)
- [ ] `src/services/claude-cli/__tests__/events.test.ts` -- extend with ToolResultEvent decode tests (file may exist, needs new cases)
- [ ] Extend existing `service.test.ts` files for PersistentClaudeCli and SessionReconstructor with ToolResultEvent cases

## Project Constraints (from CLAUDE.md)

- NEVER use `as` type casting -- prefer Effect Schema decoding or type narrowing
- NEVER use `any` type -- use `ReturnType`, `Parameters`, etc.
- AVOID `useCallback`, `useMemo`, `memo` -- depend on React Compiler
- Run `npm run check:write` after changes
- Run `npm run typecheck` after changes
- Run `npm test` after finishing implementation
- Include diagnostic logs using Effect logger or `devLog` helper
- All errors logged at some point in Effect runtime
- Use `Atom.family` with `Atom.keepAlive` for per-tab atoms
- Never import `electron` or `better-sqlite3` in test-reachable code
- Never use `vi.mock`, `vi.fn`, `vi.spyOn` -- mock via `Layer.succeed`
- SQL uses tagged template literals, never string interpolation
- Service factory functions: `make*Live()` returning Layer
- Every method: `Effect.tapError` + `Effect.mapError` + `Effect.annotateLogs`

## Open Questions

1. **ToolResultEvent content format flexibility**
   - What we know: Claude CLI emits `content` as either a string or an array of content blocks
   - What's unclear: Whether both formats appear in practice or if one dominates
   - Recommendation: Support both via `Schema.Union(Schema.String, Schema.Array(...))`. Extract text for display by normalizing both formats to string.

2. **Per-tab runtime granularity on main process**
   - What we know: D-06 specifies per-tab ManagedRuntime. The main process has one runtime today.
   - What's unclear: Whether to create per-tab runtimes now (for isolation) or scaffold the manager only (since full subprocess isolation is deferred)
   - Recommendation: Create `TabRuntimeManager` service that manages per-tab runtimes, but start with a simple map of tabId -> ManagedRuntime. Full isolation deferred to stream-json work.

3. **ChatMessage type extension for tool results**
   - What we know: Current `ChatMessage` only has `"user" | "assistant"` roles
   - What's unclear: Whether to extend the existing union or create a separate message type
   - Recommendation: Add `"tool_result"` to the role union and add optional `toolUseId`/`isError` fields. Keeps rendering simple with one flat array.

## Sources

### Primary (HIGH confidence)
- Codebase analysis of all files listed in CONTEXT.md canonical references
- `src/main.ts` -- before-quit handler, layer composition
- `src/atoms/sidebar.ts` -- loadProjectsAtom, setActiveTabAtom
- `src/atoms/chat.ts` -- per-tab atom families, sendMessageAtom
- `src/services/persistence-rpc/` -- reconstructSession RPC definition and handler
- `src/services/database/session-reconstructor/` -- reconstruction logic
- `src/services/database/event-store/schemas.ts` -- StoredEvent union
- `src/services/claude-cli/events.ts` -- ClaudeEvent union, type guards
- `src/services/claude-cli/persistent/service.ts` -- wrapStream persistence logic

### Secondary (MEDIUM confidence)
- [Claude CLI stream-json tool_result event format](https://github.com/anthropics/claude-code/issues/24596) -- event type reference
- [Claude stream-json event cheatsheet](https://takopi.dev/reference/runners/claude/stream-json-cheatsheet/) -- tool_result as user message type
- [Claude Code headless docs](https://code.claude.com/docs/en/headless) -- stream-json output format

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- integration points clearly identified in existing code, patterns well-established
- Pitfalls: HIGH -- derived from concrete codebase analysis (null session_id, atom timing, union ordering)

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- no new dependencies, all patterns established)
