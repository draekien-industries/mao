# Phase 7: Per-Tab CLI Process Isolation - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire TabRuntimeManager.getOrCreate() into production tab lifecycle paths so per-tab runtimes are created on tab creation, tracked in the HashMap, and disposed on app quit. This closes the gap where disposeAll() operates on an empty map. Does not change CLI execution path (sendMessageAtom stays on global appRuntime) or add real layer contents to per-tab runtimes.

</domain>

<decisions>
## Implementation Decisions

### Runtime trigger point
- **D-01:** TabRuntimeManager.getOrCreate(tabId) is called server-side inside the createTab RPC handler, automatically after the tab row is inserted. The renderer does not need to know about runtime management — it's an implementation detail of the main process.
- **D-02:** On app startup, runtimes are eagerly created for all persisted tabs. When the server-side tab listing/reconstruction path runs, getOrCreate is called for each existing tab so that disposeAll always has the full set.

### Runtime contents
- **D-03:** Per-tab ManagedRuntime stays as `ManagedRuntime.make(Layer.empty)` — this phase establishes lifecycle tracking (create/dispose) without changing how CLI execution works. Real ClaudeCliLive wiring per tab is deferred to a future stream-json input mode phase.

### sendMessageAtom integration
- **D-04:** No changes to sendMessageAtom in this phase. It stays on the global appRuntime with shared ClaudeCli via RendererRpcClient. Per-tab runtime routing into the CLI execution path is future work.

### Claude's Discretion
- How to surface getOrCreate during tab restore (e.g., new RPC method, or hook into existing listTabs handler)
- Whether to add a runtime count to shutdown logging for observability

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — SAFE-01 (graceful shutdown, strengthened by this phase)

### Prior Phase Context
- `.planning/phases/05-renderer-integration/05-CONTEXT.md` — D-06 (per-tab ManagedRuntime), D-04 (kill-and-discard shutdown), D-07 (future stream-json input mode)

### Existing Code (Critical for Implementation)
- `src/services/tab-runtime-manager/service.ts` — TabRuntimeManager scaffold with getOrCreate/dispose/disposeAll
- `src/services/tab-runtime-manager/service-definition.ts` — TabRuntime interface and Context.Tag
- `src/main.ts` — Layer composition (line 48: TabRuntimeManagerLayer), before-quit handler (lines 119-144)
- `src/services/persistence-rpc/handlers.ts` — createTab RPC handler (where D-01 getOrCreate call goes)
- `src/atoms/sidebar.ts` — loadProjectsAtom (where D-02 eager restore triggers)
- `src/services/tab-runtime-manager/__tests__/service.test.ts` — Existing unit tests
- `src/services/__tests__/shutdown.test.ts` — Shutdown sequence tests (disposeAll before runtime.dispose)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TabRuntimeManager` service: Full getOrCreate/dispose/disposeAll implementation exists, just never called from production paths
- `before-quit` handler: Already calls disposeAll() via TabRuntimeManager — will work correctly once the HashMap is populated
- Shutdown tests: Already verify disposeAll ordering — extend with non-empty HashMap scenarios

### Established Patterns
- RPC handlers access services via `yield* ServiceTag` inside Effect.gen — follow for accessing TabRuntimeManager in createTab handler
- `PersistenceRpcHandlers` already depends on TabStore, EventStore — adding TabRuntimeManager dependency follows the same Layer composition pattern

### Integration Points
- `PersistenceRpcHandlers.createTab` — Add `yield* manager.getOrCreate(tab.id)` after tab insertion
- Tab restore path (server-side) — Call getOrCreate for each persisted tab during startup
- `before-quit` handler — Already wired, no changes needed (just needs non-empty HashMap)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward wiring of existing scaffold into production paths.

</specifics>

<deferred>
## Deferred Ideas

- **Real ClaudeCliLive per-tab** — Each tab's ManagedRuntime should eventually contain its own ClaudeCliLive for true process isolation. Deferred to stream-json input mode phase.
- **sendMessageAtom per-tab routing** — Route CLI operations through per-tab runtimes instead of global appRuntime. Depends on real layer contents (above).
- **Tab close disposes single runtime** — Currently only disposeAll on quit. Individual tab close → dispose(tabId) would clean up sooner. Not needed until runtimes hold real resources.

### Reviewed Todos (not folded)
- **Persist tool_result as typed schema** — Already folded into Phase 05 scope (D-09)
- **Isolate RPC clients per tab** — Already folded into Phase 05 scope (D-06/D-07); this phase implements the lifecycle half

</deferred>

---

*Phase: 07-per-tab-cli-process-isolation*
*Context gathered: 2026-03-29*
