# Quick Task: Add E2E Logging - Research

**Researched:** 2026-03-28
**Domain:** Effect-TS structured logging in Electron app
**Confidence:** HIGH

## Summary

The app has solid logging infrastructure (`DevLogger`, `ProdLogger`, `annotations` object in `diagnostics.ts`) and several well-logged services (claude-cli, claude-rpc/server, database). However, many services have `Effect.annotateLogs` wired but zero actual log calls inside their operations. The renderer-side runtime (`Atom.runtime`) has no logger layer at all, so any `Effect.logInfo` calls in renderer-side code (atoms, RPC client) are silently swallowed.

**Primary recommendation:** Add lifecycle + error logging to all services missing it, following the exact patterns in `claude-cli/service.ts` and `database/service.ts`. Wire `DevLogger` into the renderer `Atom.runtime` layer so renderer-side log calls actually produce output.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Logging depth: lifecycle + errors level (entry/exit for key operations, all errors). Skip per-row debug noise.
- Renderer-side: Wire Effect logger into renderer runtime. Add logging to atom actions and RPC client.
- Production logging: Keep ProdLogger as Logger.none. No changes to production behavior.

### Claude's Discretion
- Exact log messages and annotation keys for new log calls
- Whether to add new annotation keys beyond existing set (service, operation, clientId, sessionId)
</user_constraints>

## Architecture Patterns

### Pattern 1: Main-Process Service Logging (reference: claude-cli/service.ts, database/service.ts)

Every main-process service follows this structure:

1. **Layer-level annotation:** `Effect.annotateLogs(annotations.service, "service-name")` wraps the entire `Layer.effect` generator -- this is already present on all services.
2. **Operation-level annotation:** `Effect.annotateLogs(annotations.operation, "operationName")` on each method -- already present on most methods.
3. **Lifecycle log on layer construction:** `yield* Effect.logInfo("XxxLive layer constructed")` inside the generator, after dependencies are resolved.
4. **Operation entry/exit logs:** `Effect.logInfo("Doing X")` at operation start; `Effect.logInfo("X completed")` or equivalent at end for mutating operations (create, delete, update).
5. **Error logging:** `Effect.tapError((cause) => Effect.logError("X failed").pipe(Effect.annotateLogs("error", String(cause))))` before `Effect.mapError`.

**Example from database/service.ts:**
```typescript
export const makeDatabaseLive = () =>
  Layer.effect(
    Database,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* integrityCheck(sql);
      yield* bootstrapSchema(sql);
      yield* Effect.logInfo("Database layer initialized");
      return { sql };
    }).pipe(Effect.annotateLogs(annotations.service, "database")),
  );
```

### Pattern 2: Renderer-Side Logger Wiring

The renderer runtime in `src/atoms/runtime.ts` currently builds:
```typescript
const RendererLayer = ClaudeCliFromRpc.pipe(
  Layer.provideMerge(RendererRpcClientLayer),
);
export const appRuntime = Atom.runtime(RendererLayer);
```

There is no logger layer. `Atom.runtime(layer)` creates a `ManagedRuntime` internally, which means all `Effect.logInfo/logDebug/etc.` calls in renderer-side code go to the default logger (console-based in dev). To get pretty-formatted output matching main-process logs, add `DevLogger` to the layer:

```typescript
import { DevLogger } from "@/services/diagnostics";

const RendererLayer = ClaudeCliFromRpc.pipe(
  Layer.provideMerge(RendererRpcClientLayer),
  Layer.provide(DevLogger),
);
```

Note: In the renderer there is no `app.isPackaged` check available (that is an Electron main-process API). Options:
- Always use `DevLogger` in renderer (production uses `Logger.none` only on main process; renderer logs go to DevTools console which users never see)
- Use an environment variable or a flag passed through preload to switch loggers

The simplest approach: always provide `DevLogger` in renderer. The DevTools console is only visible in dev mode (the `openDevTools()` call is guarded by `!app.isPackaged`).

### Pattern 3: Atom Action Logging

Atom actions created via `appRuntime.fn(...)` run inside the Effect runtime. They can use `Effect.logInfo` directly:

```typescript
export const sendMessageAtom = appRuntime.fn(
  (params: { readonly tabId: string; readonly prompt: string }, ctx: Atom.FnContext) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Sending message").pipe(
        Effect.annotateLogs("tabId", params.tabId),
      );
      // ... existing logic ...
    }).pipe(
      Effect.annotateLogs(annotations.service, "chat"),
    ),
);
```

### Anti-Patterns to Avoid
- **Raw console.log in services:** Only `devLog` in `main.ts` uses console.log (lifecycle events). Everything else should use Effect logger.
- **Logging inside `Effect.sync` callbacks:** The atom `ctx.set` calls are inside `Effect.sync` -- don't try to add Effect logging there. Log before/after the sync block.
- **Per-event debug noise:** Don't log every stream event in atoms. Log at operation boundaries (stream start, stream end, error).

## Modules Needing Changes

### Main-Process Services (have annotations, missing log calls)

**1. GitService (`src/services/git/service.ts`)**
- Has: `Effect.annotateLogs(annotations.service, "git")` on layer, `Effect.annotateLogs(annotations.operation, ...)` on each method
- Missing: Layer construction log, `Effect.tapError` on `runGitCommand` failures, entry log on mutating operations (createWorktree, removeWorktree)

**2. EventStore (`src/services/database/event-store/service.ts`)**
- Has: Service and operation annotations on all methods
- Missing: Layer construction log, `Effect.tapError` before `Effect.mapError` on mutations (append, purgeSession)

**3. ProjectStore (`src/services/database/project-store/service.ts`)**
- Has: Service and operation annotations on all methods
- Missing: Layer construction log, lifecycle logs on create/remove, `Effect.tapError`

**4. TabStore (`src/services/database/tab-store/service.ts`)**
- Has: Service and operation annotations on all methods
- Missing: Layer construction log, lifecycle logs on create/update/delete, `Effect.tapError`

**5. SessionReconstructor (`src/services/database/session-reconstructor/service.ts`)**
- Has: Service and operation annotations, sessionId annotation
- Missing: Layer construction log, entry/exit log on reconstruct (log message count for diagnostics)

**6. DialogService (`src/services/dialog/service.ts`)**
- Has: Service and operation annotations
- Missing: Result logging (selected directory or cancelled)

### RPC Handlers (thin delegation, minimal logging needed)

**7. PersistenceRpcHandlers (`src/services/persistence-rpc/handlers.ts`)**
- Pure delegation to store services. The underlying services will log. No logging needed here.

**8. GitRpcHandlers (`src/services/git-rpc/handlers.ts`)**
- Pure delegation. No logging needed.

**9. DialogRpcHandlers (`src/services/dialog-rpc/handlers.ts`)**
- Pure delegation. No logging needed.

### Renderer-Side (no logger wired, no log calls)

**10. RPC Client (`src/services/claude-rpc/client.ts`)**
- Missing: Logger in layer, connection lifecycle logs (protocol make, finalizer), error mapping log

**11. Chat atoms (`src/atoms/chat.ts`)**
- Missing: Service annotation on sendMessageAtom, entry/exit/error logs

**12. Sidebar atoms (`src/atoms/sidebar.ts`)**
- Missing: Service annotations on all action atoms, lifecycle logs on key operations (loadProjects, registerProject, createSession, removeProject)

### Preload (`src/preload.ts`)

**13. Preload script**
- This is a thin IPC bridge with no Effect runtime. No Effect logging possible. The `devLog` helper pattern from main.ts could be used here but the file is only 25 lines. Low value. Skip unless desired.

## Annotation Key Recommendations

The existing annotation keys are sufficient:
- `service` -- identifies the service (e.g., "git", "event-store", "chat", "sidebar")
- `operation` -- identifies the method (e.g., "create", "reconstruct", "sendMessage")
- `clientId` -- RPC client identifier (already used in server.ts)
- `sessionId` -- CLI session identifier (already used in cli and persistent-cli)

**New key recommendation:** `tabId` -- useful for renderer-side atoms to correlate logs across chat/sidebar operations for a specific tab. Add to `annotations` object in `diagnostics.ts`.

## Common Pitfalls

### Pitfall 1: Renderer Logger Silently Drops Logs
**What goes wrong:** Adding `Effect.logInfo` calls in atoms/client code produces no output because there is no logger layer in the renderer runtime.
**How to avoid:** Wire `DevLogger` into the `RendererLayer` in `atoms/runtime.ts` before adding any log calls.

### Pitfall 2: Logging in Effect.sync Blocks
**What goes wrong:** Attempting `yield* Effect.logInfo(...)` inside an `Effect.sync(() => { ... })` callback -- this is not possible since sync callbacks are not generators.
**How to avoid:** Place log calls outside sync blocks, in the surrounding `Effect.gen` function.

### Pitfall 3: Excessive Logging in Stream Consumers
**What goes wrong:** Logging every stream event in chat atoms creates massive console noise and potential performance impact.
**How to avoid:** Log only at operation boundaries: stream start ("Sending message"), stream completion (isResult event), and errors (catchAll). The main-process CLI service already logs individual events at debug level.

### Pitfall 4: Effect.tapError Placement
**What goes wrong:** Adding `Effect.tapError` after `Effect.mapError` means the tap sees the mapped error, not the original cause.
**How to avoid:** Always place `Effect.tapError` before `Effect.mapError` in the pipeline.

## Project Constraints (from CLAUDE.md)

- Run `npm run check:write` after changes and resolve issues
- Run `npm run typecheck` after changes and resolve issues
- Run `npm test` after implementation to check for regressions
- NEVER use `as` type casting unless absolutely necessary
- Use Effect logger where appropriate, otherwise the `devLog` helper
- Include sensible diagnostic logs for debugging workflows during development
- Ensure all errors are logged at some point in the Effect runtime

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all files listed in research context
- Existing logging patterns in `claude-cli/service.ts`, `claude-rpc/server.ts`, `database/service.ts` serve as authoritative reference
- `diagnostics.ts` defines the annotation keys and logger layers

### Confidence Breakdown
- Logging patterns: HIGH -- extracted directly from well-logged services in the codebase
- Renderer logger wiring: HIGH -- `Layer.provide(DevLogger)` is the same pattern used in `main.ts`
- Atom logging: MEDIUM -- `appRuntime.fn` runs Effect programs so `Effect.logInfo` should work, but renderer logger must be wired first
