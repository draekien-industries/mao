# Phase 7: Per-Tab CLI Process Isolation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 07-per-tab-cli-process-isolation
**Areas discussed:** Runtime trigger point, Runtime contents, sendMessageAtom integration

---

## Runtime Trigger Point

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side on createTab RPC | PersistenceRpcHandlers.createTab automatically calls getOrCreate(tabId) after inserting the tab row | ✓ |
| New RPC endpoint from renderer | Add a new 'initTabRuntime' RPC that the renderer calls after createTab | |
| Lazy on first CLI interaction | getOrCreate called when a tab's first message triggers a CLI spawn | |

**User's choice:** Server-side on createTab RPC
**Notes:** Renderer stays unaware of runtime management — it's an implementation detail of the main process.

### Follow-up: Tab Restore on Startup

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, eagerly on startup | When tabs are restored from DB, server-side ensures runtimes exist for all persisted tabs | ✓ |
| No, only on new tab creation | Restored tabs get runtimes lazily when user first interacts | |

**User's choice:** Yes, eagerly on startup
**Notes:** Ensures disposeAll always has the full set of active runtimes.

---

## Runtime Contents

| Option | Description | Selected |
|--------|-------------|----------|
| Empty scaffold | Keep ManagedRuntime.make(Layer.empty) — establish lifecycle tracking only | ✓ |
| ClaudeCliLive per tab | Each tab runtime gets its own ClaudeCliLive layer for full isolation | |

**User's choice:** Empty scaffold
**Notes:** Real ClaudeCliLive wiring is a separate concern for a future stream-json input mode phase.

---

## sendMessageAtom Integration

| Option | Description | Selected |
|--------|-------------|----------|
| No changes | sendMessageAtom stays on global appRuntime with shared ClaudeCli via RendererRpcClient | ✓ |
| Route through per-tab runtime | sendMessageAtom calls a new RPC that runs CLI operations on the tab's ManagedRuntime | |

**User's choice:** No changes
**Notes:** Per-tab runtime routing into the CLI execution path is future work.

---

## Claude's Discretion

- How to surface getOrCreate during tab restore (new RPC method vs hook into existing handler)
- Whether to add runtime count to shutdown logging

## Deferred Ideas

- Real ClaudeCliLive per-tab (stream-json input mode phase)
- sendMessageAtom per-tab routing (depends on real layer contents)
- Individual tab close → dispose(tabId) cleanup
