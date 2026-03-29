# Phase 7: Per-Tab CLI Process Isolation (Gap Closure) - Research

**Researched:** 2026-03-29
**Domain:** Effect-TS service wiring, Electron main process lifecycle
**Confidence:** HIGH

## Summary

This phase closes a gap where `TabRuntimeManager` was scaffolded in Phase 05 but never wired into production paths. The service already has full `getOrCreate`/`dispose`/`disposeAll` implementations, unit tests, and shutdown ordering tests. The `before-quit` handler already calls `disposeAll()` via `TabRuntimeManager`. The only problem: the internal `HashMap` is always empty because no production code ever calls `getOrCreate`.

The work is straightforward wiring: (1) call `getOrCreate(tab.id)` in the `createTab` RPC handler after tab insertion, and (2) eagerly create runtimes for all persisted tabs on app startup. No new libraries, no architectural changes, no schema modifications.

**Primary recommendation:** Add `TabRuntimeManager` as a dependency to `PersistenceRpcHandlers`, call `getOrCreate` in the `createTab` handler, and add a server-side startup path that calls `getOrCreate` for each existing tab via `TabStore.getAll()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** TabRuntimeManager.getOrCreate(tabId) is called server-side inside the createTab RPC handler, automatically after the tab row is inserted. The renderer does not need to know about runtime management -- it's an implementation detail of the main process.
- **D-02:** On app startup, runtimes are eagerly created for all persisted tabs. When the server-side tab listing/reconstruction path runs, getOrCreate is called for each existing tab so that disposeAll always has the full set.
- **D-03:** Per-tab ManagedRuntime stays as `ManagedRuntime.make(Layer.empty)` -- this phase establishes lifecycle tracking (create/dispose) without changing how CLI execution works. Real ClaudeCliLive wiring per tab is deferred to a future stream-json input mode phase.
- **D-04:** No changes to sendMessageAtom in this phase. It stays on the global appRuntime with shared ClaudeCli via RendererRpcClient. Per-tab runtime routing into the CLI execution path is future work.

### Claude's Discretion
- How to surface getOrCreate during tab restore (e.g., new RPC method, or hook into existing listTabs handler)
- Whether to add a runtime count to shutdown logging for observability

### Deferred Ideas (OUT OF SCOPE)
- Real ClaudeCliLive per-tab -- deferred to stream-json input mode phase
- sendMessageAtom per-tab routing -- depends on real layer contents
- Tab close disposes single runtime -- not needed until runtimes hold real resources
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAFE-01 | Graceful shutdown flushes or explicitly discards pending writes on app quit via before-quit event | Strengthened: disposeAll() will operate on a populated HashMap instead of empty one, making the shutdown path functional rather than a no-op |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- NEVER use `as` type casting; prefer Effect Schema decoding or type narrowing
- NEVER use `any` type; use `ReturnType`, `Parameters`, etc. for complex types
- Run `npm run check:write` after changes and resolve issues
- Run `npm run typecheck` after changes and resolve issues
- Run `npm test` after implementation to check for regressions
- Include sensible diagnostic logs; use Effect logger or `devLog` helper
- Ensure all errors are logged at some point in the Effect runtime

## Architecture Patterns

### Current Production Code Layout (relevant files)

```
src/
  main.ts                                    # Layer composition + before-quit handler
  services/
    tab-runtime-manager/
      service.ts                             # Full implementation (getOrCreate/dispose/disposeAll)
      service-definition.ts                  # Context.Tag interface
      __tests__/service.test.ts              # Unit tests
    persistence-rpc/
      handlers.ts                            # createTab RPC handler (wire point for D-01)
      group.ts                               # RPC group definition
    database/tab-store/
      service-definition.ts                  # TabStore tag
    __tests__/
      shutdown.test.ts                       # Shutdown ordering tests
```

### Pattern 1: Adding a Service Dependency to RPC Handlers

**What:** The `PersistenceRpcHandlers` layer currently yields `ProjectStore`, `SessionReconstructor`, and `TabStore`. Adding `TabRuntimeManager` follows the identical pattern.

**Current code (handlers.ts):**
```typescript
export const PersistenceRpcHandlers = PersistenceRpcGroup.toLayer(
  Effect.gen(function* () {
    const projectStore = yield* ProjectStore;
    const reconstructor = yield* SessionReconstructor;
    const tabStore = yield* TabStore;
    // ... handler implementations
  }),
);
```

**After wiring:**
```typescript
export const PersistenceRpcHandlers = PersistenceRpcGroup.toLayer(
  Effect.gen(function* () {
    const projectStore = yield* ProjectStore;
    const reconstructor = yield* SessionReconstructor;
    const tabStore = yield* TabStore;
    const runtimeManager = yield* TabRuntimeManager;
    // ... handler implementations, createTab calls runtimeManager.getOrCreate
  }),
);
```

**Confidence:** HIGH -- this is the exact pattern used for every other service dependency in this codebase.

### Pattern 2: Eager Tab Runtime Creation on Startup (D-02)

**Options researched for Claude's Discretion:**

**Option A: Hook into `listTabs` RPC handler**
- Modify the `listTabs` handler to call `getOrCreate` for each returned tab
- Pros: No new RPC methods, triggered automatically when renderer calls `loadProjectsAtom`
- Cons: Side-effects in a "list" operation violate single-responsibility; every `listTabs` call would re-trigger getOrCreate (idempotent but noisy)

**Option B: Dedicated startup effect in `main.ts`**
- After RPC server starts, run a one-shot Effect that loads all tabs from `TabStore` and calls `getOrCreate` for each
- Pros: Clean separation of concerns; runs once at startup; explicit intent
- Cons: Need to access both `TabStore` and `TabRuntimeManager` from `main.ts` (both already in the layer)

**Option C: Add an `initializeRuntimes` RPC method**
- New RPC called by the renderer during app start
- Pros: Explicit trigger
- Cons: Renderer shouldn't know about runtime management (contradicts D-01's "implementation detail of main process")

**Recommendation: Option B** -- Run a one-shot `initializeTabRuntimes` effect via `runtime.runFork` in `main.ts` after `startRpcServer`. This keeps runtime management as a main-process implementation detail (per D-01) and only runs once.

```typescript
// In main.ts, after startRpcServer fork
runtime.runFork(
  Effect.gen(function* () {
    const tabStore = yield* TabStore;
    const manager = yield* TabRuntimeManager;
    const tabs = yield* tabStore.getAll();
    yield* Effect.forEach(tabs, (tab) => manager.getOrCreate(tab.id));
  }).pipe(
    Effect.annotateLogs(annotations.service, "tab-runtime-manager"),
    Effect.annotateLogs(annotations.operation, "initializeTabRuntimes"),
  ),
);
```

**Confidence:** HIGH -- `runtime.runFork` is already used for `startRpcServer` in the same file; `TabStore` and `TabRuntimeManager` are both in `ServerLayer`.

### Pattern 3: Shutdown Logging Enhancement (Claude's Discretion)

**Recommendation:** Add runtime count to `disposeAll` shutdown logging. The service already logs `Effect.annotateLogs("count", count)` inside `disposeAll` (line 111 of service.ts), so this is already handled. Additionally, add a count log in the `before-quit` handler for lifecycle-level observability:

```typescript
// In before-quit handler, after disposeAll completes
devLog(`per-tab runtimes disposed (from active HashMap)`, app.isPackaged);
```

This is minimal and follows the existing `devLog` pattern in `main.ts`.

### Anti-Patterns to Avoid

- **Triggering getOrCreate from renderer:** D-01 explicitly states this is a main-process implementation detail. Never add runtime management calls in atoms or renderer code.
- **Making listTabs impure:** Don't add side effects to query handlers. Keep reads pure.
- **Changing disposeAll logic:** The existing implementation is correct and tested. The only change needed is populating the HashMap.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-tab runtime lifecycle | Custom Map + manual cleanup | Existing `TabRuntimeManager` service | Already fully implemented with Ref-based HashMap, proper disposal, error handling |
| Layer dependency injection | Manual service passing | `yield* TabRuntimeManager` in Effect.gen | Established codebase pattern, type-safe |
| Startup initialization | Custom init hooks | `runtime.runFork(Effect.gen(...))` | Already used for `startRpcServer` in main.ts |

## Common Pitfalls

### Pitfall 1: Layer Composition Order in main.ts
**What goes wrong:** Adding `TabRuntimeManager` dependency to `PersistenceRpcHandlers` could cause a missing service error if the layer isn't provided before the handlers in the composition chain.
**Why it happens:** `Layer.provideMerge` order matters; downstream layers must have their dependencies available.
**How to avoid:** `TabRuntimeManagerLayer` is already provided at line 54 of `main.ts`, which is BEFORE `PersistenceRpcHandlers` at line 51. Since `provideMerge` reads bottom-to-top (later provides to earlier), this ordering is already correct.
**Warning signs:** TypeScript compile errors about missing `TabRuntimeManager` in the layer requirements.

### Pitfall 2: Race Between Startup Init and First createTab
**What goes wrong:** If a user creates a tab before the startup `initializeTabRuntimes` effect completes, both paths call `getOrCreate` for the same tab.
**Why it happens:** `runtime.runFork` runs asynchronously.
**How to avoid:** This is actually safe -- `getOrCreate` is idempotent. If the tab already exists in the HashMap, it returns the existing runtime. No race condition because `Ref` operations are atomic in Effect.
**Warning signs:** None expected; this is a non-issue but worth documenting.

### Pitfall 3: Forgetting to Update Handler Tests
**What goes wrong:** Existing `PersistenceRpcHandlers` tests use a mock layer that provides `TabStore`, `ProjectStore`, and `SessionReconstructor`. Adding `TabRuntimeManager` as a dependency will cause test failures if the mock layer isn't updated.
**Why it happens:** The `toLayer` effect now yields an additional service that tests must provide.
**How to avoid:** Add `TabRuntimeManager` to the mock layer in handler tests using `Layer.succeed(TabRuntimeManager, { getOrCreate: () => Effect.void, ... })`.

### Pitfall 4: Startup Init Must Handle Empty DB
**What goes wrong:** On first launch, `TabStore.getAll()` returns an empty array.
**Why it happens:** No tabs exist yet in a fresh database.
**How to avoid:** `Effect.forEach` on an empty array is a no-op. No special handling needed, but add a log for observability: "Initialized 0 tab runtimes (fresh database)".

## Code Examples

### createTab Handler Wiring (D-01)

```typescript
// In src/services/persistence-rpc/handlers.ts
import { TabRuntimeManager } from "../tab-runtime-manager/service-definition";

export const PersistenceRpcHandlers = PersistenceRpcGroup.toLayer(
  Effect.gen(function* () {
    const projectStore = yield* ProjectStore;
    const reconstructor = yield* SessionReconstructor;
    const tabStore = yield* TabStore;
    const runtimeManager = yield* TabRuntimeManager;

    return {
      // ... existing handlers unchanged ...
      createTab: (params) =>
        Effect.gen(function* () {
          const tab = yield* tabStore.create(new TabCreate({ /* ... */ }));
          // D-01: Register per-tab runtime after tab creation
          yield* runtimeManager.getOrCreate(tab.id);
          return tab;
        }),
      // ... rest of handlers ...
    };
  }),
);
```

### Startup Initialization (D-02)

```typescript
// In src/main.ts, inside app.on("ready", ...)
app.on("ready", () => {
  devLog("app ready", app.isPackaged);
  createWindow();
  runtime.runFork(startRpcServer.pipe(Effect.scoped));
  // D-02: Eagerly create runtimes for all persisted tabs
  runtime.runFork(
    Effect.gen(function* () {
      const tabStore = yield* TabStore;
      const manager = yield* TabRuntimeManager;
      const tabs = yield* tabStore.getAll();
      yield* Effect.forEach(tabs, (tab) => manager.getOrCreate(tab.id));
      yield* Effect.logInfo("Tab runtimes initialized").pipe(
        Effect.annotateLogs("count", tabs.length),
      );
    }).pipe(
      Effect.annotateLogs(annotations.service, "tab-runtime-manager"),
      Effect.annotateLogs(annotations.operation, "initializeTabRuntimes"),
      Effect.catchAll((error) =>
        Effect.logError("Tab runtime initialization failed").pipe(
          Effect.annotateLogs("error", String(error)),
        ),
      ),
    ),
  );
});
```

## Validation Architecture

### Test Framework

- **Framework:** Vitest 4.1.1
- **Config file:** `vitest.config.ts` (project root)
- **Quick run command:** `npm test`
- **Full suite command:** `npm test`

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAFE-01-a | createTab handler calls getOrCreate after tab insertion | unit | `npx vitest run src/services/persistence-rpc/__tests__/handlers.test.ts -t "createTab"` | Exists (needs extension) |
| SAFE-01-b | disposeAll disposes runtimes from a populated HashMap | unit | `npx vitest run src/services/tab-runtime-manager/__tests__/service.test.ts` | Exists (already covers this) |
| SAFE-01-c | Shutdown ordering: disposeAll before runtime.dispose | unit | `npx vitest run src/services/__tests__/shutdown.test.ts` | Exists (already covers this) |
| SAFE-01-d | Startup initialization creates runtimes for persisted tabs | unit | `npx vitest run src/services/tab-runtime-manager/__tests__/service.test.ts -t "initializeTabRuntimes"` | New test needed |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Extend `src/services/persistence-rpc/__tests__/handlers.test.ts` -- verify `createTab` calls `getOrCreate`
- [ ] Add startup initialization test in `src/services/tab-runtime-manager/__tests__/service.test.ts` -- verify getOrCreate called for each persisted tab

## Sources

### Primary (HIGH confidence)
- Direct code reading of all canonical files listed in CONTEXT.md
- Existing test files for TabRuntimeManager and shutdown ordering
- `src/main.ts` layer composition and lifecycle handlers

### Secondary (MEDIUM confidence)
- Effect-TS patterns verified against codebase conventions (consistent across all services)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, pure wiring of existing code
- Architecture: HIGH -- follows established patterns already in codebase (service dependency injection, runtime.runFork)
- Pitfalls: HIGH -- all pitfalls verified against actual code; race condition confirmed safe via Effect Ref atomicity

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- no external dependency changes)
