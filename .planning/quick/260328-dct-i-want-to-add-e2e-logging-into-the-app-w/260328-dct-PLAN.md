---
phase: quick-260328-dct
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/diagnostics.ts
  - src/services/git/service.ts
  - src/services/database/event-store/service.ts
  - src/services/database/project-store/service.ts
  - src/services/database/tab-store/service.ts
  - src/services/database/session-reconstructor/service.ts
  - src/services/dialog/service.ts
  - src/services/claude-rpc/client.ts
  - src/atoms/runtime.ts
  - src/atoms/chat.ts
  - src/atoms/sidebar.ts
autonomous: true
requirements: [E2E-LOGGING]

must_haves:
  truths:
    - "All main-process services log lifecycle events (layer construction) and errors"
    - "Mutating operations (create, delete, update, purge) log entry and error with tapError"
    - "Renderer-side Effect.logInfo calls produce visible output in DevTools console"
    - "Chat and sidebar atom actions log operation boundaries (start, complete, error)"
    - "Production logging remains Logger.none -- no behavioral change"
  artifacts:
    - path: "src/services/diagnostics.ts"
      provides: "tabId annotation key"
      contains: "tabId"
    - path: "src/atoms/runtime.ts"
      provides: "DevLogger wired into renderer runtime"
      contains: "DevLogger"
  key_links:
    - from: "src/atoms/runtime.ts"
      to: "src/services/diagnostics.ts"
      via: "import DevLogger"
      pattern: "import.*DevLogger.*diagnostics"
    - from: "src/atoms/chat.ts"
      to: "Effect.logInfo"
      via: "lifecycle logging in sendMessageAtom"
      pattern: "Effect\\.logInfo"
    - from: "src/atoms/sidebar.ts"
      to: "Effect.logInfo"
      via: "lifecycle logging in action atoms"
      pattern: "Effect\\.logInfo"
---

<objective>
Add lifecycle and error logging to all services and renderer-side atoms that currently lack log calls, and wire DevLogger into the renderer runtime so renderer-side logs produce output.

Purpose: Enable end-to-end diagnostic observability across the entire app -- every service layer construction, every mutating operation boundary, and every error is logged with structured annotations.

Output: All services and atom actions emit structured Effect logs; renderer runtime has DevLogger wired in.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260328-dct-i-want-to-add-e2e-logging-into-the-app-w/260328-dct-CONTEXT.md
@.planning/quick/260328-dct-i-want-to-add-e2e-logging-into-the-app-w/260328-dct-RESEARCH.md
@src/services/diagnostics.ts
@src/atoms/runtime.ts

<interfaces>
<!-- Reference patterns from existing well-logged services -->

From src/services/diagnostics.ts:
```typescript
export const annotations = {
  service: "service",
  operation: "operation",
  clientId: "clientId",
  sessionId: "sessionId",
} as const;

export const DevLogger = Logger.pretty;
export const ProdLogger = Logger.replace(Logger.defaultLogger, Logger.none);
```

Pattern from database/service.ts (layer construction log):
```typescript
yield* Effect.logInfo("Database layer initialized");
```

Pattern from claude-cli/service.ts (tapError before mapError):
```typescript
Effect.tapError((cause) =>
  Effect.logError("CLI spawn failed").pipe(
    Effect.annotateLogs("error", String(cause)),
  ),
),
Effect.mapError(...)
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add logging to main-process services and diagnostics</name>
  <files>
    src/services/diagnostics.ts,
    src/services/git/service.ts,
    src/services/database/event-store/service.ts,
    src/services/database/project-store/service.ts,
    src/services/database/tab-store/service.ts,
    src/services/database/session-reconstructor/service.ts,
    src/services/dialog/service.ts
  </files>
  <action>
1. **diagnostics.ts** -- Add `tabId: "tabId"` to the `annotations` object (new annotation key for renderer-side correlation).

2. **GitService (git/service.ts)** -- The layer uses `Layer.effect` with `Effect.gen`:
   - Add `yield* Effect.logInfo("GitService layer constructed")` after resolving `executor`.
   - In `runGitCommand`: add `Effect.tapError((cause) => Effect.logError("Git command failed").pipe(Effect.annotateLogs("error", String(cause))))` BEFORE the existing `Effect.mapError` on the `executor.start(command)` call.
   - Add `yield* Effect.logInfo("Creating worktree")` at start of `createWorktree`.
   - Add `yield* Effect.logInfo("Removing worktree")` by wrapping `removeWorktree` in `Effect.gen` with an entry log (or use `Effect.tap`).

3. **EventStore (event-store/service.ts)** -- The layer uses `Layer.effect` with `Effect.gen`:
   - Add `yield* Effect.logInfo("EventStore layer constructed")` after resolving `sql` from Database.
   - On `append`: add `Effect.tapError((cause) => Effect.logError("Event append failed").pipe(Effect.annotateLogs("error", String(cause))))` BEFORE the existing `Effect.mapError`.
   - On `purgeSession`: add `Effect.tapError` with logError BEFORE `Effect.mapError`.

4. **ProjectStore (project-store/service.ts)** -- The layer uses `Layer.effect` with `Effect.gen`:
   - Add `yield* Effect.logInfo("ProjectStore layer constructed")` after resolving `sql`.
   - On `create`: add `yield* Effect.logInfo("Creating project")` at start of gen, add `Effect.tapError` before `Effect.mapError`.
   - On `remove`: add `yield* Effect.logInfo("Removing project").pipe(Effect.annotateLogs("projectId", String(id)))` at start of gen, add `Effect.tapError` before `Effect.mapError`.

5. **TabStore (tab-store/service.ts)** -- The layer uses `Layer.effect` with `Effect.gen`:
   - Add `yield* Effect.logInfo("TabStore layer constructed")` after resolving `sql`.
   - On `create`: add `yield* Effect.logInfo("Creating tab")` at start of gen, add `Effect.tapError` before `Effect.mapError`.
   - On `update`: wrap in `Effect.gen` if needed, add `yield* Effect.logInfo("Updating tab").pipe(Effect.annotateLogs("tabId", String(id)))` at start, add `Effect.tapError` before `Effect.mapError`.
   - On `deleteTab`: add `yield* Effect.logInfo("Deleting tab").pipe(Effect.annotateLogs("tabId", String(id)))` at start of gen, add `Effect.tapError` before `Effect.mapError`.

6. **SessionReconstructor (session-reconstructor/service.ts)** -- The layer uses `Layer.effect` with `Effect.gen`:
   - Add `yield* Effect.logInfo("SessionReconstructor layer constructed")` after resolving `eventStore`.
   - In `reconstruct`: add `yield* Effect.logInfo("Reconstructing session")` at start of gen. After building messages array, add `yield* Effect.logInfo("Session reconstructed").pipe(Effect.annotateLogs("messageCount", String(messages.length)))`.

7. **DialogService (dialog/service.ts)** -- Uses `Layer.succeed` (no gen block for the layer itself, but `openDirectory` is an Effect):
   - Cannot add layer construction log (Layer.succeed is synchronous). Skip it.
   - On `openDirectory`: add logging after the `Effect.map` for the result. Use `Effect.tap((opt) => Option.isSome(opt) ? Effect.logInfo("Directory selected") : Effect.logInfo("Directory selection cancelled"))` before the `Effect.annotateLogs` calls.

**Important patterns:**
- Always place `Effect.tapError` BEFORE `Effect.mapError` in the pipeline so the tap sees the original error.
- Use `Effect.annotateLogs("error", String(cause))` inside tapError for error context.
- Do NOT add per-row/per-query debug logs for read operations (getAll, getById, getBySession). Only lifecycle and error logs.
  </action>
  <verify>
    <automated>cd F:/Dev/draekien-industries/mao && npm run typecheck && npm run check:write && npm test</automated>
  </verify>
  <done>
    All 6 main-process services have layer construction logs (where applicable), mutating operations have entry logs, and all error paths have Effect.tapError before Effect.mapError. The `tabId` annotation key exists in diagnostics.ts. All checks pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire renderer logger and add logging to atoms and RPC client</name>
  <files>
    src/atoms/runtime.ts,
    src/atoms/chat.ts,
    src/atoms/sidebar.ts,
    src/services/claude-rpc/client.ts
  </files>
  <action>
1. **runtime.ts** -- Wire `DevLogger` into the renderer layer so all `Effect.logInfo` calls in renderer code produce output:
   ```typescript
   import { DevLogger } from "@/services/diagnostics";

   const RendererLayer = ClaudeCliFromRpc.pipe(
     Layer.provideMerge(RendererRpcClientLayer),
     Layer.provide(DevLogger),
   );
   ```
   Always use DevLogger in renderer (DevTools console is only visible in dev; production users never see it).

2. **client.ts (RPC client)** -- Add lifecycle logging to the `ElectronClientProtocol` layer:
   - After `const rt = yield* Effect.runtime<never>()`, add: `yield* Effect.logInfo("RPC client protocol initialized")`.
   - In the `Effect.addFinalizer`, add: `yield* Effect.logInfo("RPC client protocol finalizing")` before the `Effect.sync(() => unsubscribe())` (wrap both in Effect.all or sequential gen).
   - In `ClaudeCliFromRpc` layer gen: add `yield* Effect.logInfo("ClaudeCliFromRpc layer constructed")`.
   - Annotate the `ElectronClientProtocol` layer with `Effect.annotateLogs(annotations.service, "rpc-client")`.
   - Annotate the `ClaudeCliFromRpc` layer gen with `Effect.annotateLogs(annotations.service, "claude-cli-from-rpc")`.

3. **chat.ts** -- Add logging to `sendMessageAtom`:
   - At start of gen (before adding user message): `yield* Effect.logInfo("Sending message").pipe(Effect.annotateLogs(annotations.tabId, params.tabId))`.
   - After the `Stream.runForEach` completes (stream ended naturally): no log needed (the result event sets isStreaming=false).
   - In the `Effect.catchAll`: add `yield* Effect.logError("Send message failed").pipe(Effect.annotateLogs("error", formatClaudeCliError(err)), Effect.annotateLogs(annotations.tabId, params.tabId))` BEFORE the `Effect.sync` that sets error state.
   - Wrap the entire gen with `.pipe(Effect.annotateLogs(annotations.service, "chat"))`.
   - Import `annotations` from `@/services/diagnostics`.

4. **sidebar.ts** -- Add logging to action atoms:
   - **loadProjectsAtom**: add `yield* Effect.logInfo("Loading projects")` at start of gen. Wrap gen with `Effect.annotateLogs(annotations.service, "sidebar")` and `Effect.annotateLogs(annotations.operation, "loadProjects")`.
   - **registerProjectAtom**: add `yield* Effect.logInfo("Registering project")` at start of gen. Add `yield* Effect.logInfo("Project registered").pipe(Effect.annotateLogs("projectName", name))` after the `createProject` call. Wrap gen with service "sidebar" and operation "registerProject" annotations. Add `Effect.tapError` wrapping the whole gen to catch and log any errors.
   - **createSessionAtom**: add `yield* Effect.logInfo("Creating session")` at start, `yield* Effect.logInfo("Session created")` after `createTab`. Wrap with service "sidebar" and operation "createSession" annotations. Add `Effect.tapError`.
   - **removeProjectAtom**: add `yield* Effect.logInfo("Removing project").pipe(Effect.annotateLogs("projectId", String(projectId)))` at start. Wrap with service "sidebar" and operation "removeProject" annotations. Add `Effect.tapError`.
   - Import `annotations` from `@/services/diagnostics`.

**Anti-patterns to avoid:**
- Do NOT log inside `Effect.sync` blocks (the ctx.set calls). Log before/after the sync block.
- Do NOT log every stream event in chat atoms. Only log at operation boundaries.
- Do NOT add logging to pure read/derived atoms (tabStatusAtom, branchesAtom state, etc.).
- Do NOT add logging to `setActiveTabAtom` or `checkWorktreeExistsAtom` (trivial operations, no diagnostic value).
- Do NOT add logging to `loadBranchesAtom` (lightweight read-only operation).
  </action>
  <verify>
    <automated>cd F:/Dev/draekien-industries/mao && npm run typecheck && npm run check:write && npm test</automated>
  </verify>
  <done>
    Renderer runtime has DevLogger wired in. sendMessageAtom logs start and errors with tabId annotation. Sidebar action atoms (loadProjects, registerProject, createSession, removeProject) log lifecycle events with service/operation annotations. RPC client logs protocol initialization and finalization. All checks pass.
  </done>
</task>

</tasks>

<verification>
- `npm run typecheck` passes with no errors
- `npm run check:write` passes (Biome lint + format)
- `npm test` passes with no regressions
- Grep confirms logging calls exist in all targeted files: `grep -r "Effect.logInfo\|Effect.logError" src/services/git/service.ts src/services/database/*/service.ts src/services/dialog/service.ts src/services/claude-rpc/client.ts src/atoms/chat.ts src/atoms/sidebar.ts`
- Grep confirms DevLogger is in renderer runtime: `grep "DevLogger" src/atoms/runtime.ts`
- Grep confirms tabId annotation exists: `grep "tabId" src/services/diagnostics.ts`
</verification>

<success_criteria>
- Every main-process service (GitService, EventStore, ProjectStore, TabStore, SessionReconstructor, DialogService) has structured lifecycle and error logging
- Renderer runtime has DevLogger so Effect.log* calls produce console output
- Chat and sidebar atom actions log at operation boundaries with service/operation annotations
- RPC client logs protocol lifecycle
- No per-row debug noise added to read operations
- ProdLogger remains Logger.none (no production behavior change)
- All existing tests pass without regression
</success_criteria>

<output>
After completion, create `.planning/quick/260328-dct-i-want-to-add-e2e-logging-into-the-app-w/260328-dct-SUMMARY.md`
</output>
